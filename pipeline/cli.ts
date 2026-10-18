// Pipeline entry point.
//   npm run validate   validate sources.yaml and every layers/*/layer.yaml
//   npm run status     print the status of each published layer (meta.json)
//   npm run ingest [-- --layer=<id>]   (Phase 1: adapters not written yet)

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readMeta } from './lib/publish.ts';
import { loadYaml, validate } from './lib/schemas.ts';

const LAYERS_DIR = 'pipeline/layers';
const OUT_DIR = process.env.DATA_OUT_DIR ?? 'data-out';

async function layerIds(): Promise<string[]> {
  const entries = await readdir(LAYERS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
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

async function cmdStatus(): Promise<number> {
  const ids = await layerIds();
  if (ids.length === 0) console.log('No layers yet.');
  for (const id of ids) {
    const meta = await readMeta(join(OUT_DIR, id, 'meta.json'));
    console.log(
      meta
        ? `${id}: ${meta.status} · ${meta.feature_count} features · published ${meta.published_at ?? 'unknown'} · fetched ${meta.fetched_at}`
        : `${id}: never ingested`,
    );
  }
  return 0;
}

async function main(): Promise<number> {
  const cmd = process.argv[2];
  if (cmd === 'validate') return cmdValidate();
  if (cmd === 'status') return cmdStatus();
  if (cmd === 'ingest') {
    console.error('No adapters yet: ingest arrives in Phase 1, after source verification.');
    return 1;
  }
  console.error('Usage: cli.ts <validate|status|ingest>');
  return 2;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
