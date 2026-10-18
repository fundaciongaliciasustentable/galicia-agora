// Pipeline entry point.
//   npm run validate                    validate sources.yaml and every layers/*/layer.yaml
//   npm run ingest [-- --layer=<id>]    run due layers (or one); --force ignores ingest.every
//   npm run status                      status of each layer; exits 3 if any needs an alert
//   npm run catalog                     write data-out/catalog.json for the site

import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { LayerDef } from './lib/adapter.ts';
import { parseDuration } from './lib/duration.ts';
import { LAYERS_DIR, loadLayer, runLayer } from './lib/ingest.ts';
import { ageStatus, type Meta, needsAlert, readMeta, writeAtomic } from './lib/publish.ts';
import { loadYaml, validate } from './lib/schemas.ts';

const OUT_DIR = process.env.DATA_OUT_DIR ?? 'data-out';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function layerIds(): Promise<string[]> {
  const entries = await readdir(LAYERS_DIR, { withFileTypes: true });
  const ids: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    // A folder without layer.yaml is a layer in progress, not a layer.
    try {
      await access(join(LAYERS_DIR, e.name, 'layer.yaml'));
      ids.push(e.name);
    } catch {}
  }
  return ids.sort();
}

/** stale_after if set, otherwise three ingest cycles, otherwise one day. */
function staleAfterMs(layer: LayerDef): number {
  if (layer.stale_after) return parseDuration(layer.stale_after);
  if (layer.ingest?.every) return 3 * parseDuration(layer.ingest.every);
  return 24 * 3600_000;
}

function cycleMs(layer: LayerDef): number {
  return layer.ingest?.every ? parseDuration(layer.ingest.every) : 24 * 3600_000;
}

async function cmdValidate(): Promise<number> {
  let failures = 0;
  const srcErrs = await validate('sources', await loadYaml('pipeline/sources.yaml'));
  console.log(`sources.yaml: ${srcErrs.length ? srcErrs.join('\n  ') : 'ok'}`);
  failures += srcErrs.length;
  for (const id of await layerIds()) {
    const doc = await loadYaml<{ id?: string }>(join(LAYERS_DIR, id, 'layer.yaml'));
    const errs = await validate('layer', doc);
    if (doc.id !== id) errs.push(`id "${doc.id}" does not match folder "${id}"`);
    console.log(`${id}: ${errs.length ? errs.join('\n  ') : 'ok'}`);
    failures += errs.length;
  }
  return failures ? 1 : 0;
}

async function cmdIngest(): Promise<number> {
  const only = arg('layer');
  const force = process.argv.includes('--force');
  const ids = only ? [only] : await layerIds();
  let failed = 0;
  // Sequential on purpose: be gentle with public services.
  for (const id of ids) {
    const r = await runLayer(id, { outDir: OUT_DIR, force: force || !!only });
    if (r.skipped) {
      console.log(`${id}: skipped (${r.reason})`);
      continue;
    }
    const m = r.meta;
    console.log(
      `${id}: ${m.status}${r.write ? ` · ${m.feature_count} features` : ` · kept last good · ${m.last_error}`}`,
    );
    if (!r.write) failed++;
  }
  await cmdCatalog();
  // A failed source is not a failed job: the policy already handled it.
  return only && failed ? 1 : 0;
}

async function cmdStatus(): Promise<number> {
  const now = new Date();
  let alerts = 0;
  const ids = await layerIds();
  if (ids.length === 0) console.log('No layers yet.');
  for (const id of ids) {
    const layer = await loadLayer(id);
    const meta = await readMeta(join(OUT_DIR, id, 'meta.json'));
    if (!meta) {
      console.log(`${id}: never ingested`);
      continue;
    }
    const status = ageStatus(meta, now, staleAfterMs(layer));
    const alert = needsAlert(meta, now, cycleMs(layer));
    if (alert) alerts++;
    console.log(
      `${id}: ${status}${alert ? ' ALERT' : ''} · ${meta.feature_count} features · published ${meta.published_at ?? 'unknown'} · fetched ${meta.fetched_at}${meta.last_error ? ` · ${meta.last_error}` : ''}`,
    );
  }
  return alerts ? 3 : 0;
}

/** Public catalogue: layer definitions (no auth details) + current meta. */
async function cmdCatalog(): Promise<number> {
  const now = new Date();
  const layers = [];
  for (const id of await layerIds()) {
    const layer = await loadLayer(id);
    const meta: Meta | null = await readMeta(join(OUT_DIR, id, 'meta.json'));
    const { auth: _auth, ...pub } = layer as LayerDef & { auth?: unknown };
    layers.push({
      ...pub,
      meta: meta
        ? {
            ...meta,
            status: ageStatus(meta, now, staleAfterMs(layer)),
            alert: needsAlert(meta, now, cycleMs(layer)),
          }
        : null,
    });
  }
  await writeAtomic(
    join(OUT_DIR, 'catalog.json'),
    `${JSON.stringify({ generated_at: now.toISOString(), layers }, null, 2)}\n`,
  );
  return 0;
}

async function main(): Promise<number> {
  const cmd = process.argv[2];
  if (cmd === 'validate') return cmdValidate();
  if (cmd === 'ingest') return cmdIngest();
  if (cmd === 'status') return cmdStatus();
  if (cmd === 'catalog') return cmdCatalog();
  console.error('Usage: cli.ts <validate|ingest|status|catalog>');
  return 2;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
