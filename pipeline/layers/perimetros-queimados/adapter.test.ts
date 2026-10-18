import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { effisTime, galicianProvince, simplifyRing } from './adapter.ts';

const dir = 'pipeline/layers/perimetros-queimados';
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));
const routes = [
  {
    match: 'typeNames=ms:modis.ba.poly.season',
    file: join(dir, 'fixtures', 'modis_ba_poly_season_galicia.geojson'),
  },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  return adapter.normalize(await adapter.fetch(ctx));
}

type Pos = [number, number];

function rings(geometry: { type: string; coordinates: unknown }): Pos[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates as Pos[][];
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as Pos[][][]).flat();
  throw new Error(`unexpected ${geometry.type}`);
}

describe('perimetros-queimados', () => {
  it('normalizes the real season fixture', async () => {
    const { collection, publishedAt } = await run();
    expect(collection.features).toHaveLength(47);
    expect(publishedAt).toBe('2026-09-24T07:47:07.789Z');
    for (const f of collection.features) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
  });

  it('keeps only the four Galician provinces', async () => {
    const { collection } = await run();
    const counts: Record<string, number> = {};
    for (const f of collection.features) {
      const p = String(f.properties.provincia);
      counts[p] = (counts[p] ?? 0) + 1;
    }
    expect(counts).toEqual({ 'A Coruña': 14, Ourense: 13, Pontevedra: 12, Lugo: 8 });
    expect(galicianProvince('Alto Minho', 'PT')).toBeNull();
    expect(galicianProvince('León', 'ES')).toBeNull();
    expect(galicianProvince('Ourense', 'PT')).toBeNull();
    expect(galicianProvince(' ourense ', 'ES')).toBe('Ourense');
    expect(galicianProvince('La Coruña', 'ES')).toBe('A Coruña');
  });

  it('parses LASTUPDATE and FIREDATE as UTC', () => {
    expect(effisTime('2026-09-24 07:47:07.789512')).toBe('2026-09-24T07:47:07.789Z');
    expect(effisTime('2026-01-06 02:06:00')).toBe('2026-01-06T02:06:00.000Z');
    expect(() => effisTime('24/09/2026')).toThrow();
    expect(() => effisTime(undefined)).toThrow();
  });

  it('produces valid, closed polygons rounded to 5 decimals inside Galicia', async () => {
    const { collection } = await run();
    for (const f of collection.features) {
      expect(f.geometry).not.toBeNull();
      for (const ring of rings(f.geometry as { type: string; coordinates: unknown })) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring.at(-1));
        for (const [lon, lat] of ring) {
          expect(inGalicia(lon, lat, 0.1)).toBe(true);
          expect(Math.round(lon * 1e5) / 1e5).toBe(lon);
          expect(Math.round(lat * 1e5) / 1e5).toBe(lat);
        }
      }
    }
  });

  it('drops degenerate rings after rounding', () => {
    const tiny = [
      [-8.000001, 42.000001],
      [-8.000002, 42.000002],
      [-8.000001, 42.000003],
      [-8.000001, 42.000001],
    ];
    expect(simplifyRing(tiny)).toBeNull();
  });

  it('throws on a non-GeoJSON response and yields 0 features with none in Galicia', async () => {
    expect(() => adapter.normalize({ type: 'ExceptionReport' })).toThrow();
    const out = await adapter.normalize({ type: 'FeatureCollection', features: [] });
    expect(out.collection.features).toHaveLength(0);
    expect(out.publishedAt).toBeNull();
  });
});
