// Runs one layer: load layer.yaml and adapter, fetch → normalize → validate →
// publish (publish.ts applies the failure policy and writes atomically).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  Adapter,
  AdapterContext,
  FeatureCollection,
  LayerDef,
  PublishedLayer,
} from './adapter.ts';
import { parseDuration } from './duration.ts';
import { fetchWithRetry } from './http.ts';
import { type Attempt, ageStatus, type Decision, publish, readMeta } from './publish.ts';
import type { RasterAdapter } from './raster.ts';
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
  adapter?: Adapter | RasterAdapter;
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

/** stale_after if set, otherwise three ingest cycles, otherwise one day. */
export function staleAfterMs(layer: LayerDef): number {
  if (layer.stale_after) return parseDuration(layer.stale_after);
  if (layer.ingest?.every) return 3 * parseDuration(layer.ingest.every);
  return 24 * 3600_000;
}

/**
 * Read another layer's last good published output (derived layers, depends_on).
 * Throws when the layer is undeclared, has no good file, or is stale by its own
 * stale_after: a derived layer must not be rebuilt from old inputs.
 */
export async function readPublishedLayer(
  layer: LayerDef,
  depId: string,
  outDir: string,
  now: Date,
  layersDir = LAYERS_DIR,
): Promise<PublishedLayer> {
  if (!layer.depends_on?.includes(depId)) {
    throw new Error(`${layer.id} reads ${depId} but does not list it in depends_on`);
  }
  const meta = await readMeta(join(outDir, depId, 'meta.json'));
  if (!meta?.checksum) throw new Error(`input layer ${depId} has no published data`);
  const status = ageStatus(meta, now, staleAfterMs(await loadLayer(depId, layersDir)));
  if (status !== 'fresh') {
    throw new Error(`input layer ${depId} is ${status} (last success ${meta.last_success_at})`);
  }
  const collection = JSON.parse(
    await readFile(join(outDir, depId, 'data.geojson'), 'utf8'),
  ) as FeatureCollection;
  return { collection, meta };
}

export async function runLayer(id: string, opts: RunOptions): Promise<RunResult> {
  const layersDir = opts.layersDir ?? LAYERS_DIR;
  const now = opts.now ?? new Date();
  const layer = await loadLayer(id, layersDir);
  // Raster layers publish a PMTiles archive instead of GeoJSON (raster.ts).
  const raster = layer.geometry === 'raster';
  const dataPath = join(opts.outDir, id, raster ? 'data.pmtiles' : 'data.geojson');
  const metaPath = join(opts.outDir, id, 'meta.json');

  if (!opts.force && layer.ingest?.every) {
    const prev = await readMeta(metaPath);
    if (prev) {
      const due = Date.parse(prev.fetched_at) + parseDuration(layer.ingest.every);
      // Small tolerance so a 10-min cron does not skip a 10-min layer by seconds.
      if (now.getTime() < due - 60_000) return { skipped: true, reason: 'not due' };
    }
  }

  const adapter: Adapter | RasterAdapter =
    opts.adapter ??
    (await import(pathToFileURL(join(process.cwd(), layersDir, id, 'adapter.ts')).href)).default;

  const ctx: AdapterContext = {
    layer,
    now,
    env: opts.env ?? process.env,
    get: opts.get ?? ((url, o) => fetchWithRetry(url, o)),
    readLayer: (depId) => readPublishedLayer(layer, depId, opts.outDir, now, layersDir),
  };

  const attempt: Attempt = {
    layerId: id,
    at: now,
    sourceUrl: layer.source_url,
    licence: layer.licence.spdx ?? layer.licence.text_url,
    attribution: layer.attribution,
    volatile: layer.volatile === true,
  };

  if (raster || 'kind' in adapter) {
    try {
      if (!raster || !('kind' in adapter)) {
        throw new Error('raster adapters need geometry: raster (and the reverse)');
      }
      const out = await adapter.normalize(await adapter.fetch(ctx), ctx);
      attempt.data = {
        body: out.archive,
        featureCount: out.tileCount,
        publishedAt: out.publishedAt,
      };
    } catch (err) {
      attempt.error = err instanceof Error ? err.message : String(err);
    }
    return { skipped: false, ...(await publish(attempt, dataPath, metaPath)) };
  }

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
