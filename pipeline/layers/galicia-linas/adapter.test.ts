import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LayerDef, PublishedLayer } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { COLS, crossings, FRAME, INPUTS, MDT_URL, parseArcGrid, ROWS } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

async function readFixture(id: string): Promise<PublishedLayer> {
  return {
    collection: JSON.parse(await readFile(fx(`${id}.geojson`), 'utf8')),
    meta: JSON.parse(await readFile(fx(`${id}.meta.json`), 'utf8')),
  };
}

let rows: Array<Record<string, unknown>> = [];
beforeAll(async () => {
  const ctx = {
    ...fixtureContext(layer, [{ match: 'wcs-inspire/mdt', file: fx('mdt.txt') }], {
      now: new Date('2026-11-03T18:00:00Z'),
    }),
    readLayer: readFixture,
  };
  const { collection } = await adapter.normalize(await adapter.fetch(ctx));
  rows = collection.features.map((f) => f.properties);
}, 60_000);

const heights = (r: Record<string, unknown>) => Buffer.from(String(r.perfis), 'base64');
const rowOf = (lat: number) => Math.floor(((FRAME.lat1 - lat) / (FRAME.lat1 - FRAME.lat0)) * ROWS);
const colOf = (lon: number) => Math.floor(((lon - FRAME.lon0) / (FRAME.lon1 - FRAME.lon0)) * COLS);

describe('galicia-linas adapter', () => {
  it('declares its inputs and the IGN terrain model', () => {
    expect(layer.depends_on).toEqual([...INPUTS]);
    expect(layer.source_url).toBe(MDT_URL);
  });

  it('publishes nine valid posters of ROWS × COLS heights', () => {
    expect(rows.map((r) => r.id)).toEqual([
      'relevo',
      'poboacion',
      'poboacion_1950',
      'poboacion_2021',
      'menores_20',
      'maiores_65',
      'pib',
      'raios',
      'lume',
    ]);
    for (const r of rows) {
      expect(validateWithSchema(schema, r)).toEqual([]);
      expect(heights(r)).toHaveLength(ROWS * COLS);
    }
  });

  it('raises the population lines over Santiago and A Coruña, not over the sea', () => {
    const pop = heights(rows.find((r) => r.id === 'poboacion') as Record<string, unknown>);
    const at = (lon: number, lat: number) => pop[rowOf(lat) * COLS + colOf(lon)] as number;
    expect(at(-8.545, 42.88)).toBeGreaterThan(50);
    expect(at(-9.3, 43.6)).toBe(0);
    // 1950 and 2021 share one scale: the higher of the two reaches 255.
    const top = (id: string) =>
      Math.max(...heights(rows.find((r) => r.id === id) as Record<string, unknown>));
    expect(Math.max(top('poboacion_1950'), top('poboacion_2021'))).toBe(255);
  });

  it('draws the relief only where the terrain model has data', () => {
    const rel = heights(rows.find((r) => r.id === 'relevo') as Record<string, unknown>);
    expect(rel[rowOf(42.88) * COLS + colOf(-8.54)]).toBeGreaterThan(0);
    expect(rel[rowOf(43.5) * COLS + colOf(-7.5)]).toBe(0);
  });
});

describe('parseArcGrid', () => {
  it('reads the WCS multipart grid', async () => {
    const g = parseArcGrid(await readFile(fx('mdt.txt'), 'latin1'));
    expect([g.nc, g.nr]).toEqual([67, 44]);
    expect(g.at(-8.54, 42.88, 0)).toBeGreaterThan(150);
  });
});

describe('crossings', () => {
  it('finds where a parallel cuts a square', () => {
    expect(
      crossings(
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
        1,
      ),
    ).toEqual([0, 2]);
  });
});
