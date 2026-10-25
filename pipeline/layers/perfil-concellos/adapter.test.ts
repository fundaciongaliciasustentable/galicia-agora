import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef, PublishedLayer } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  INPUTS,
  inPolygon,
  inputsTime,
  median,
  polygonAreaKm2,
  polygons,
  profile,
  type Raw,
  representativePoint,
  SERVICES,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const NOW = new Date('2026-10-25T12:00:00Z');

async function readFixture(id: string): Promise<PublishedLayer> {
  return {
    collection: JSON.parse(await readFile(fx(`${id}.geojson`), 'utf8')),
    meta: JSON.parse(await readFile(fx(`${id}.meta.json`), 'utf8')),
  };
}

async function raw(): Promise<Raw> {
  const r = {} as Raw;
  for (const id of INPUTS) r[id] = await readFixture(id);
  return r;
}

describe('perfil-concellos adapter', () => {
  it('declares every input in depends_on and every indicator', () => {
    expect(layer.depends_on).toEqual([...INPUTS]);
    expect(layer.indicators?.map((i) => i.id)).toEqual(SERVICES.map((s) => `dist_${s}`));
  });

  it('computes one valid row per concello, with null medians where there are no places', async () => {
    const rows = profile(await raw()).map((f) => f.properties);
    expect(rows.map((r) => r.codigo_ine)).toEqual(['15078', '27034', '27056']);
    for (const r of rows) expect(validateWithSchema(schema, r)).toEqual([]);

    const navia = rows.find((r) => r.codigo_ine === '27034');
    expect(navia?.lugares).toBeGreaterThan(30);
    // Navia de Suarna is far from everything: above the fixture's Galicia median.
    expect(navia?.dist_hospital_rel).toBeGreaterThan(0);

    // Rábade has no places in entidades-poboacion: no data, never 0.
    const rabade = rows.find((r) => r.codigo_ine === '27056');
    expect(rabade).toMatchObject({
      lugares: 0,
      dist_centro_saude: null,
      dist_centro_saude_rel: null,
    });
  });

  it('places the representative point inside the concello', async () => {
    const r = await raw();
    for (const f of r['concellos-parroquias'].collection.features) {
      const p = representativePoint(f.geometry);
      expect(p).not.toBeNull();
      const [lon, lat] = p as [number, number];
      expect(polygons(f.geometry).some((poly) => inPolygon(lon, lat, poly))).toBe(true);
    }
  });

  it('falls back to an inside point for a concave shape', () => {
    // A "C": its centroid lies in the notch, outside the polygon.
    const c = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [3, 0],
          [3, 1],
          [1, 1],
          [1, 2],
          [3, 2],
          [3, 3],
          [0, 3],
          [0, 0],
        ],
      ],
    };
    const p = representativePoint(c) as [number, number];
    expect(inPolygon(p[0], p[1], c.coordinates as never)).toBe(true);
  });

  it('measures area in km² (1° × 1° at the equator ≈ 12,363 km²)', () => {
    const sq = [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ] as never;
    expect(polygonAreaKm2(sq)).toBeCloseTo(12363, -1);
  });

  it('takes the median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('rejects a truncated input instead of publishing a partial profile', async () => {
    const c = { ...fixtureContext(layer, [], { now: NOW }), readLayer: readFixture };
    const fetched = await adapter.fetch(c);
    await expect(async () => adapter.normalize(fetched, c)).rejects.toThrow(/only 3 concellos/);
  });

  it('dates the layer with the newest input', async () => {
    const r = await raw();
    const times = INPUTS.map((id) => r[id].meta.published_at ?? r[id].meta.last_success_at);
    expect(inputsTime(r)).toBe(
      new Date(Math.max(...times.map((t) => Date.parse(t ?? '')))).toISOString(),
    );
  });
});
