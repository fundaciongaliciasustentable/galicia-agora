// Runs one layer: load layer.yaml and adapter, fetch → normalize → validate →
// publish (publish.ts applies the failure policy and writes atomically).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Adapter, AdapterContext, LayerDef } from './adapter.ts';
import { parseDuration } from './duration.ts';
import { fetchWithRetry } from './http.ts';
import { type Attempt, type Decision, publish, readMeta } from './publish.ts';
import { loadYaml, validate, validateWithSchema } from './schemas.ts';

export const LAYERS_DIR = 'pipeline/layers';

export interface RunOptions {
  outDir: string;
  now?: Date;
  env?: Record<string, string | undefined>;
  get?: AdapterContext['get'];
  /** Ignore ingest.every and run anyway. */
  force?: boolean;
  layersDir?: string;
  /** Inject an adapter (tests); otherwise import layers/<id>/adapter.ts. */
  adapter?: Adapter;
}

export type RunResult = { skipped: true; reason: string } | ({ skipped: false } & Decision);

export async function loadLayer(id: string, layersDir = LAYERS_DIR): Promise<LayerDef> {
  return loadYaml<LayerDef>(join(layersDir, id, 'layer.yaml'));
}

async function loadPropertiesSchema(id: string, layersDir: string): Promise<object | null> {
  try {
    return JSON.parse(await readFile(join(layersDir, id, 'properties.schema.json'), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function runLayer(id: string, opts: RunOptions): Promise<RunResult> {
  const layersDir = opts.layersDir ?? LAYERS_DIR;
  const now = opts.now ?? new Date();
  const layer = await loadLayer(id, layersDir);
  const dataPath = join(opts.outDir, id, 'data.geojson');
  const metaPath = join(opts.outDir, id, 'meta.json');

  if (!opts.force && layer.ingest?.every) {
    const prev = await readMeta(metaPath);
    if (prev) {
      const due = Date.parse(prev.fetched_at) + parseDuration(layer.ingest.every);
      // Small tolerance so a 10-min cron does not skip a 10-min layer by seconds.
      if (now.getTime() < due - 60_000) return { skipped: true, reason: 'not due' };
    }
  }

  const adapter: Adapter =
    opts.adapter ??
    (await import(pathToFileURL(join(process.cwd(), layersDir, id, 'adapter.ts')).href)).default;

  const ctx: AdapterContext = {
    layer,
    now,
    env: opts.env ?? process.env,
    get: opts.get ?? ((url, o) => fetchWithRetry(url, o)),
  };

  const attempt: Attempt = {
    layerId: id,
    at: now,
    sourceUrl: layer.source_url,
    licence: layer.licence.spdx ?? layer.licence.text_url,
    attribution: layer.attribution,
    volatile: layer.volatile === true,
  };

  try {
    const raw = await adapter.fetch(ctx);
    const { collection, publishedAt } = await adapter.normalize(raw, ctx);
    const errors = await validate('geojson', collection);
    const propsSchema = await loadPropertiesSchema(id, layersDir);
    if (propsSchema && errors.length === 0) {
      collection.features.forEach((f, i) => {
        for (const e of validateWithSchema(propsSchema, f.properties)) {
          if (errors.length < 10) errors.push(`/features/${i}/properties${e}`);
        }
      });
    }
    attempt.data = {
      body: JSON.stringify(collection),
      featureCount: collection.features.length,
      publishedAt,
    };
    if (errors.length) attempt.validationErrors = errors;
  } catch (err) {
    attempt.error = err instanceof Error ? err.message : String(err);
  }

  const decision = await publish(attempt, dataPath, metaPath);
  return { skipped: false, ...decision };
}
