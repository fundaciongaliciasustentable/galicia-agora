import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { FIGURAS } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

const routes = [1, 2, 3, 4, 5, 6].map((n) => ({
  match: `MapServer/${n}/query?resultOffset=0&`,
  file: fx(`layer${n}.json`),
}));

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

function positions(c: unknown): Array<[number, number]> {
  if (Array.isArray(c) && typeof c[0] === 'number') return [c as [number, number]];
  return Array.isArray(c) ? c.flatMap(positions) : [];
}

describe('espazos-naturais-galicia adapter', () => {
  it('queries the six non-Natura sublayers once each', async () => {
    const { ctx } = await run();
    expect(ctx.requested).toHaveLength(6);
    for (const u of ctx.requested) {
      expect(u).toContain('outSR=4326');
      expect(u).toContain('maxAllowableOffset=0.0001');
    }
  });

  it('normalizes real fixtures into valid features inside Galicia', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs.length).toBe(11);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      for (const [lon, lat] of positions(f.geometry?.coordinates)) {
        expect(inGalicia(lon, lat, 0.05)).toBe(true);
      }
    }
    expect(out.publishedAt).toBeNull();
  });

  it('labels each feature with the figura of its sublayer', async () => {
    const { out } = await run();
    const figuras = new Set(out.collection.features.map((f) => f.properties.figura));
    expect(figuras).toEqual(new Set(Object.values(FIGURAS)));
    expect(out.collection.features.find((f) => f.id === '2-3')?.properties).toEqual({
      figura: 'Parque natural',
      nome: 'O Invernadeiro',
      superficie_ha: 5722,
    });
    // Floating noise in the source (983.8100000000001) is trimmed to 2 decimals.
    const corrubedo = out.collection.features.find((f) => f.id === '3-1');
    expect(corrubedo?.properties.superficie_ha).toBe(983.81);
  });

  it('throws on an error response and yields 0 features on an empty one', async () => {
    const ctx = fixtureContext(layer, routes);
    expect(() =>
      adapter.normalize([{ layer: 2, pages: [{ error: { message: 'Invalid URL' } }] }], ctx),
    ).toThrow(/Invalid URL/);
    expect(() => adapter.normalize([{ layer: 2, pages: [{}] }], ctx)).toThrow(/unexpected/);
    const empty = adapter.normalize(
      [{ layer: 2, pages: [{ type: 'FeatureCollection', features: [] }] }],
      ctx,
    );
    expect(empty).toMatchObject({ collection: { features: [] } });
  });
});
