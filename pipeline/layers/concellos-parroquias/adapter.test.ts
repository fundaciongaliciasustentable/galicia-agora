import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Feature, inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { code, editionFromName } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

const routes = [
  { match: 'MapServer/12/query?resultOffset=0&', file: fx('concellos-offset0.json') },
  { match: 'MapServer/18/query?resultOffset=0&', file: fx('parroquias-offset0.json') },
  // The next offset is the number of features already returned (3 in the trimmed fixture).
  { match: 'MapServer/18/query?resultOffset=3&', file: fx('parroquias-page2.json') },
  { match: 'MapServer?f=json', file: fx('mapserver.json') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

function positions(c: unknown): Array<[number, number]> {
  if (Array.isArray(c) && typeof c[0] === 'number') return [c as [number, number]];
  return Array.isArray(c) ? c.flatMap(positions) : [];
}

const byNivel = (fs: Feature[], n: string) => fs.filter((f) => f.properties.nivel === n);

describe('concellos-parroquias adapter', () => {
  it('normalizes real fixtures into valid features inside Galicia', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs.length).toBeGreaterThan(0);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry?.type);
      for (const [lon, lat] of positions(f.geometry?.coordinates)) {
        expect(inGalicia(lon, lat, 0.05)).toBe(true);
        expect(round5(lon)).toBe(lon);
      }
    }
  });

  it('pages parroquias while exceededTransferLimit is true', async () => {
    const { ctx, out } = await run();
    const parroquiaCalls = ctx.requested.filter((u) => u.includes('/18/query'));
    expect(parroquiaCalls).toHaveLength(2);
    expect(parroquiaCalls[1]).toContain('resultOffset=3&');
    // The concellos page has no exceededTransferLimit, so one call only.
    expect(ctx.requested.filter((u) => u.includes('/12/query'))).toHaveLength(1);
    // 3 parroquias on the first page + 2 on the second.
    expect(byNivel(out.collection.features, 'parroquia')).toHaveLength(5);
    for (const u of ctx.requested.filter((x) => x.includes('/query'))) {
      expect(u).toContain('outSR=4326');
      expect(u).toContain('maxAllowableOffset=0.0005');
      expect(u).toContain('f=geojson');
    }
  });

  it('tags each feature with nivel and keeps official Galician names', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(byNivel(fs, 'concello')).toHaveLength(3);
    expect(fs.every((f) => ['concello', 'parroquia'].includes(f.properties.nivel as string))).toBe(
      true,
    );
    const baña = fs.find((f) => f.id === 'concello-15007');
    // NAMEUNIT ("A Baña"), not the inverted CONCELLO field ("Baña, A").
    expect(baña?.properties).toMatchObject({ nome: 'A Baña', provincia: 'A Coruña' });
    const santaia = fs.find((f) => f.id === 'parroquia-1500101');
    expect(santaia?.properties).toMatchObject({
      nivel: 'parroquia',
      nome: 'Abegondo (Santaia)',
      codigo_parroquia: '1500101',
      codigo_concello: '15001',
      concello: 'Abegondo',
      codigo_ine: '15001',
      capital: 'San Marco',
    });
  });

  it('keeps codes as fixed-width strings with leading zeros', async () => {
    const { out } = await run();
    for (const f of out.collection.features) {
      expect(typeof f.properties.codigo_concello).toBe('string');
      expect(typeof f.properties.codigo_ine).toBe('string');
    }
    expect(code(1001, 5, 'CODCONC')).toBe('01001');
    expect(code(102001, 7, 'CODPARRO')).toBe('0102001');
    expect(code('01001', 5, 'CODIGOINE')).toBe('01001');
    expect(code(15001.0, 5, 'CODCONC')).toBe('15001');
    expect(() => code(null, 5, 'CODCONC')).toThrow();
    expect(() => code(123456, 5, 'CODCONC')).toThrow();
  });

  it('takes publishedAt from the edition month in the layer name', async () => {
    const { out } = await run();
    expect(out.publishedAt).toBe('2026-01-31T23:00:00.000Z');
    expect(editionFromName('Concellos (Febreiro 2026)')).toBe('2026-01-31T23:00:00.000Z');
    expect(editionFromName('Provincias (Xuño 2025)')).toBe('2025-05-31T22:00:00.000Z');
    expect(editionFromName('Parroquias')).toBeNull();
  });

  it('throws on a malformed or error response', () => {
    const ctx = fixtureContext(layer, routes);
    expect(() =>
      adapter.normalize(
        { service: {}, concellos: [{ error: { message: 'Invalid query' } }], parroquias: [] },
        ctx,
      ),
    ).toThrow(/Invalid query/);
    expect(() => adapter.normalize({ service: {}, concellos: [{}], parroquias: [] }, ctx)).toThrow(
      /unexpected response/,
    );
    const empty = adapter.normalize(
      { service: {}, concellos: [{ type: 'FeatureCollection', features: [] }], parroquias: [] },
      ctx,
    );
    expect(empty).toMatchObject({ collection: { features: [] }, publishedAt: null });
  });
});

function round5(n: number) {
  return Math.round(n * 1e5) / 1e5;
}
