import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  {
    match: 'SIXSAN_WEB_KML/MapServer/KmlServer',
    file: join(dir, 'fixtures', 'kmlserver-trimmed.kmz'),
  },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('farmacias adapter', () => {
  it('makes one request and keeps the pharmacies folder only', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    expect(out.publishedAt).toBeNull();
    const fs = out.collection.features;
    expect(fs).toHaveLength(6);
    expect(new Set(fs.map((f) => String(f.id).split('-')[0]))).toEqual(
      new Set(['C', 'LU', 'OR', 'PO']),
    );
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
  });

  it('uses SIGLAS as id and publishes no holder names or phones', async () => {
    const { out } = await run();
    const f = out.collection.features.find((x) => x.id === 'C-224-F');
    expect(f?.properties).toEqual({
      id: 'C-224-F',
      nome: 'Farmacia C-224-F',
      enderezo: 'ESTRADA CASTELA, Nº 152 - 154',
      cp: '15570',
      concello: 'Narón',
      codigo_ine: '15054',
    });
    expect(f?.geometry?.coordinates).toEqual([-8.19673, 43.4988]);
    expect(JSON.stringify(out.collection)).not.toMatch(/TITULAR|TELEFONO|9\d{8}/);
  });
});
