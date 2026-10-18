import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { isArchaeological, normalizeFeatures } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

const routes = [
  { match: 'resultOffset=0&', file: fx('bic-page1.geojson') },
  { match: 'resultOffset=5&', file: fx('bic-page2.geojson') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, raw, out: await adapter.normalize(raw) };
}

const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;

describe('patrimonio adapter', () => {
  it('follows pagination across two pages', async () => {
    const { ctx, raw } = await run();
    expect(ctx.requested).toHaveLength(2);
    expect(ctx.requested[0]).toContain('/MapServer/2/query?');
    expect(ctx.requested[0]).toContain('resultRecordCount=1000');
    expect(ctx.requested[0]).toContain('outSR=4326');
    expect(raw).toHaveLength(5 + 139);
  });

  it('normalizes real fixtures into valid features inside Galicia', async () => {
    const { out } = await run();
    expect(out.collection.features).toHaveLength(144);
    expect(out.publishedAt).toBeNull();
    for (const f of out.collection.features) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, 0.05)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    const ids = out.collection.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const neixon = out.collection.features.find((f) => f.id === 'BIC.000.625');
    expect(neixon?.properties).toMatchObject({
      nome: 'Castros de Neixón',
      data_declaracion: '2011-05-19',
      dog: 'DOG 103 - 30.05.2011',
      boe: 'BOE 150 - 24.06.2011',
    });
    // "-" placeholders become null.
    const altamira = out.collection.features.find((f) => f.id === 'BIC.000.400');
    expect(altamira?.properties.dog).toBeNull();
  });

  it('generalises archaeological sites to 2 decimals and keeps others precise', async () => {
    const { out } = await run();
    const gen = out.collection.features.filter((f) => f.properties.localizacion_xeneralizada);
    const precise = out.collection.features.filter((f) => !f.properties.localizacion_xeneralizada);
    expect(gen.length).toBeGreaterThan(0);
    expect(precise.length).toBeGreaterThan(0);
    for (const f of gen) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(decimals(lon)).toBeLessThanOrEqual(2);
      expect(decimals(lat)).toBeLessThanOrEqual(2);
    }
    // Every ARQ or archaeological category in the fixture is generalised.
    for (const f of out.collection.features) {
      const arq =
        f.properties.interese === 'ARQ' || /arqueol/i.test(String(f.properties.categoria ?? ''));
      if (arq) expect(f.properties.localizacion_xeneralizada).toBe(true);
    }
    // Castros de Neixón (-8.84241, 42.66354) → (-8.84, 42.66).
    const neixon = out.collection.features.find((f) => f.id === 'BIC.000.625');
    expect(neixon?.geometry?.coordinates).toEqual([-8.84, 42.66]);
    // Fortaleza de Altamira (ART, Castelo) keeps full precision.
    const altamira = out.collection.features.find((f) => f.id === 'BIC.000.400');
    expect(altamira?.geometry?.coordinates).toEqual([-8.68757, 42.87739]);
  });

  it('classifies archaeology from CATEGORIA and XENERICO too', () => {
    expect(isArchaeological({ INTERESE: 'ART', CATEGORIA: 'Xacemento arqueolóxico' })).toBe(true);
    expect(isArchaeological({ INTERESE: 'ART', XENERICO: 'Arte rupestre' })).toBe(true);
    expect(isArchaeological({ INTERESE: 'ART', CATEGORIA: 'Monumento', XENERICO: 'Castelo' })).toBe(
      false,
    );
  });

  it('throws on a malformed response and yields 0 features on an empty one', async () => {
    const bad = fixtureContext(layer, [{ match: 'query', file: fx('README.md') }]);
    await expect(adapter.fetch(bad)).rejects.toThrow();
    expect(normalizeFeatures([]).features).toHaveLength(0);
  });
});
