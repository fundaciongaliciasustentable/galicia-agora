import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { categoria, tramo } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  {
    match: 'Clasificacion_PRAIAS/MapServer/0/query?resultOffset=0&',
    file: join(dir, 'fixtures', 'layer0.json'),
  },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('praias adapter', () => {
  it('reads one page in EPSG:4326 and validates every feature', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    expect(ctx.requested[0]).toContain('outSR=4326');
    const fs = out.collection.features;
    expect(fs).toHaveLength(5);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
    expect(out.publishedAt).toBeNull();
  });

  it('drops Z/M and keeps the source class and stretch', async () => {
    const { out } = await run();
    const f = out.collection.features.find((x) => x.id === 'Praia_436');
    expect(f?.geometry?.coordinates).toHaveLength(2);
    expect(f?.properties).toEqual({
      id: 'Praia_436',
      nome: 'Praia de A Corna',
      concello: 'Ribeira - Pobra do Caramiñal',
      provincia: 'A Coruña',
      categoria: 'urbana',
      tramo: 1,
    });
    expect(JSON.stringify(out.collection)).not.toMatch(/B_AZUL|bandeira/i);
  });

  it('maps the class and stretch values and rejects unknown classes', () => {
    expect(categoria('URBANA *')).toBe('urbana');
    expect(categoria('NATURAL')).toBe('natural');
    expect(() => categoria('MIXTA')).toThrow(/CATEGORIA_/);
    expect(tramo('UNICO')).toBeNull();
    expect(tramo('TRAMO3')).toBe(3);
  });
});
