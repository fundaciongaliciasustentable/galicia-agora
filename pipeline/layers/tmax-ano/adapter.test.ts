import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PublishedLayer } from '../../lib/adapter.ts';
import { validateWithSchema } from '../../lib/schemas.ts';
import { OUTLINE_FILE } from '../../satelite/outline.ts';
import { build, GRID, utm29ToLonLat } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const fx = (f: string) => join(import.meta.dirname, 'fixtures', f);

describe('tmax-ano', () => {
  it('converts UTM 29N to lon/lat', () => {
    // Mabegondo: utmx 559899, utmy 4787883 in the daily answer; estacions-meteo -8.26223, 43.24137.
    const [lon, lat] = utm29ToLonLat(559899, 4787883);
    expect(lon).toBeCloseTo(-8.2622, 3);
    expect(lat).toBeCloseTo(43.2414, 3);
  });

  it('builds a year of daily maxima per station and the height grid', async () => {
    const stations: PublishedLayer = {
      collection: JSON.parse(await readFile(fx('estacions-meteo.geojson'), 'utf8')),
      meta: JSON.parse(await readFile(fx('estacions-meteo.meta.json'), 'utf8')),
    };
    const { features, grid } = build({
      year: 2025,
      months: [
        await readFile(fx('diarios-2025-01.json'), 'utf8'),
        await readFile(fx('diarios-2025-07.json'), 'utf8'),
      ],
      stations,
      mdt: await readFile(fx('mdt-1000.txt'), 'latin1'),
      outline: await readFile(OUTLINE_FILE, 'utf8'),
    });
    expect(features.map((f) => f.properties.id)).toEqual([10045, 10052, 10148]);
    for (const f of features) expect(validateWithSchema(schema, f.properties)).toEqual([]);
    const ourense = features.find((f) => f.properties.id === 10148)?.properties as Record<
      string,
      unknown
    >;
    const tmax = ourense.tmax as Array<number | null>;
    expect(tmax).toHaveLength(365);
    // July in Ourense is hotter than January; February to June were not given.
    expect(tmax[195]).toBeGreaterThan((tmax[10] as number) + 10);
    expect(tmax[60]).toBeNull();
    // Height from the MDT (Ourense sits around 130–150 m).
    expect(ourense.altitude as number).toBeGreaterThan(80);
    expect(ourense.altitude as number).toBeLessThan(400);
    const heights = new Int16Array(Buffer.from(String(grid.alturas), 'base64').buffer.slice(0));
    expect(heights.length).toBe(GRID.nx * GRID.ny);
    expect(heights.some((h) => h > 0)).toBe(true);
    expect(heights.some((h) => h === -1)).toBe(true);
  });
});
