import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  concelloName,
  galicianProvince,
  simplifyGeometry,
  simplifyRing,
  yearsFromCapabilities,
} from './adapter.ts';

const dir = 'pipeline/layers/historial-queimados';
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));
const capsFile = join(dir, 'fixtures', 'wfs_capabilities.xml');
const routes = [
  { match: 'request=GetCapabilities', file: capsFile },
  {
    match: 'typeNames=ms:modis.ba.poly.2017&',
    file: join(dir, 'fixtures', 'modis_ba_poly_2017_galicia.geojson'),
  },
  {
    match: 'typeNames=ms:modis.ba.poly.2025&',
    file: join(dir, 'fixtures', 'modis_ba_poly_2025_galicia.geojson'),
  },
];
const env = { EFFIS_PAUSE_MS: '0' };

async function run(now?: Date) {
  const ctx = fixtureContext(layer, routes, { env, now });
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

type Pos = [number, number];

function rings(geometry: { type: string; coordinates: unknown }): Pos[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates as Pos[][];
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as Pos[][][]).flat();
  throw new Error(`unexpected ${geometry.type}`);
}

describe('historial-queimados', () => {
  it('requests capabilities once, then one GetFeature per completed year', async () => {
    const { ctx } = await run();
    expect(ctx.requested).toHaveLength(3);
    expect(ctx.requested[0]).toContain('request=GetCapabilities');
    expect(ctx.requested[1]).toContain('typeNames=ms:modis.ba.poly.2017&');
    expect(ctx.requested[2]).toContain('typeNames=ms:modis.ba.poly.2025&');
    for (const u of ctx.requested.slice(1)) {
      expect(u).toContain('bbox=41.8,-9.35,43.8,-6.7,urn:ogc:def:crs:EPSG::4326');
    }
  });

  it('skips the current (incomplete) year', async () => {
    const { ctx, out } = await run(new Date('2025-08-01T00:00:00Z'));
    expect(ctx.requested).toHaveLength(2);
    expect(new Set(out.collection.features.map((f) => f.properties.ano))).toEqual(new Set([2017]));
  });

  it('normalizes the real fixtures', async () => {
    const { out } = await run();
    const { collection, publishedAt } = out;
    // 2017: 5 Galician; 2025: 6 Galician (the 0 ha and 1 ha areas survive at 4 decimals).
    const byYear: Record<string, number> = {};
    for (const f of collection.features) {
      byYear[String(f.properties.ano)] = (byYear[String(f.properties.ano)] ?? 0) + 1;
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(byYear).toEqual({ '2017': 5, '2025': 6 });
    // Latest LASTUPDATE in Galicia; the later Portuguese update (288116) is ignored.
    expect(publishedAt).toBe('2025-11-05T08:23:32.541Z');
    const ids = new Set(collection.features.map((f) => f.id));
    expect(ids.size).toBe(collection.features.length);
  });

  it('keeps only Galician provinces and maps fields', async () => {
    const { out } = await run();
    const provinces = new Set(out.collection.features.map((f) => f.properties.provincia));
    expect(provinces).toEqual(new Set(['A Coruña', 'Lugo', 'Ourense', 'Pontevedra']));
    const big = out.collection.features.find((f) => f.properties.id === '11138');
    expect(big?.properties).toMatchObject({
      ano: 2017,
      data_lume: '2017-10-13',
      provincia: 'Ourense',
      concello: 'Carballeda de Avia',
      area_ha: 5223,
    });
    const gudina = out.collection.features.find((f) => f.properties.id === '11994');
    expect(gudina?.properties.concello).toBe('A Gudiña');
    expect(galicianProvince('Alto Minho', 'PT')).toBeNull();
    expect(galicianProvince('Ourense', 'PT')).toBeNull();
    expect(galicianProvince('La Coruña', 'ES')).toBe('A Coruña');
    expect(concelloName('Estrada, A')).toBe('A Estrada');
    expect(concelloName('Vilalba')).toBe('Vilalba');
    expect(concelloName('  ')).toBeNull();
  });

  it('produces closed polygons rounded to 4 decimals inside Galicia', async () => {
    const { out } = await run();
    for (const f of out.collection.features) {
      expect(f.geometry).not.toBeNull();
      for (const ring of rings(f.geometry as { type: string; coordinates: unknown })) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
        for (const [lon, lat] of ring) {
          expect(inGalicia(lon, lat, 0.1)).toBe(true);
          expect(Math.round(lon * 1e4) / 1e4).toBe(lon);
          expect(Math.round(lat * 1e4) / 1e4).toBe(lat);
        }
      }
    }
  });

  it('keeps the polygon parts of a GeometryCollection and simplifies them', async () => {
    const raw = JSON.parse(
      await readFile(join(dir, 'fixtures', 'modis_ba_poly_2017_galicia.geojson'), 'utf8'),
    );
    const src = raw.features.find(
      (f: { properties: { id: string } }) => f.properties.id === '11138',
    );
    expect(src.geometry.type).toBe('GeometryCollection');
    // 16 parts: one main polygon (3610 vertices) and 15 slivers of a few metres
    // that collapse at 4 decimals; the MultiLineString member is ignored.
    const g = simplifyGeometry(src.geometry);
    expect(g?.type).toBe('Polygon');
    const before = JSON.stringify(src.geometry.geometries[0].coordinates).length;
    expect(JSON.stringify(g?.coordinates).length).toBeLessThan(before / 2);
    expect(() => simplifyGeometry({ type: 'Point', coordinates: [-8, 42] })).toThrow();
  });

  it('drops near-duplicate and collinear vertices', () => {
    const square = [
      [-8, 42],
      [-8.00001, 42.00002], // near-duplicate
      [-7.999, 42],
      [-7.998, 42], // collinear
      [-7.998, 42.001],
      [-8, 42.001],
      [-8, 42.0005], // collinear
      [-8, 42],
    ];
    expect(simplifyRing(square)).toEqual([
      [-8, 42],
      [-7.998, 42],
      [-7.998, 42.001],
      [-8, 42.001],
      [-8, 42],
    ]);
    const tiny = [
      [-8.00001, 42.00001],
      [-8.00005, 42.00002],
      [-8.00001, 42.00004],
      [-8.00001, 42.00001],
    ];
    expect(simplifyRing(tiny)).toBeNull();
  });

  it('reads the yearly typeNames from GetCapabilities', async () => {
    const xml = await readFile(capsFile, 'utf8');
    expect(yearsFromCapabilities(xml, 2025)).toEqual([2017, 2025]);
    expect(yearsFromCapabilities(xml, 2024)).toEqual([2017]);
    expect(() => yearsFromCapabilities('<html>error</html>', 2025)).toThrow();
  });

  it('throws on malformed responses and yields 0 features with none in Galicia', async () => {
    expect(() => adapter.normalize({ years: [] }, fixtureContext(layer, []))).toThrow();
    expect(() =>
      adapter.normalize(
        { years: [{ year: 2020, data: { type: 'ExceptionReport' } }] },
        fixtureContext(layer, []),
      ),
    ).toThrow();
    const out = await adapter.normalize(
      { years: [{ year: 2020, data: { type: 'FeatureCollection', features: [] } }] },
      fixtureContext(layer, []),
    );
    expect(out.collection.features).toHaveLength(0);
    expect(out.publishedAt).toBeNull();
  });
});
