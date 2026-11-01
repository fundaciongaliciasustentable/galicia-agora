import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [1, 2, 3, 4, 5].map((n) => ({
  match: `PHGC2021_2027_Estado/MapServer/${n}/query?resultOffset=0&`,
  file: join(dir, 'fixtures', `layer${n}.json`),
}));

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('estado-masas-auga adapter', () => {
  it('reads five sublayers and validates every water body', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(5);
    expect(ctx.requested.some((u) => u.includes('MapServer/0/'))).toBe(false);
    const fs = out.collection.features;
    expect(fs).toHaveLength(7);
    expect(new Set(fs.map((f) => f.id)).size).toBe(7);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
    expect(out.publishedAt).toBeNull();
  });

  it('chains river parts into simpler lines', async () => {
    const { out } = await run();
    const rio = out.collection.features.find((f) => f.id === 'rio-ES-014-NR-058-000-01-00');
    expect(rio?.properties).toMatchObject({
      nome: 'Rego do Lourido',
      categoria: 'rio',
      estado_global: 'peor que bo',
      estado_quimico: 'non alcanza o bo',
    });
    const coords = rio?.geometry?.coordinates as unknown[];
    const parts = rio?.geometry?.type === 'LineString' ? 1 : coords.length;
    expect(parts).toBeLessThan(5);
  });

  it('keeps a code shared by two sublayers apart', async () => {
    const { out } = await run();
    const ids = out.collection.features.map((f) => f.id);
    expect(ids).toContain('costeira-ES01450');
    expect(ids).toContain('porto-ES01450');
  });
});
