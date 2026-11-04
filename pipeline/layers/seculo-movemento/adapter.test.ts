import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PublishedLayer } from '../../lib/adapter.ts';
import { validateWithSchema } from '../../lib/schemas.ts';
import { ANCHORS, build, INPUTS, type Raw } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const fx = (f: string) => join(import.meta.dirname, 'fixtures', f);
async function raw(): Promise<Raw> {
  const r = {} as Raw;
  for (const id of INPUTS) {
    r[id] = {
      collection: JSON.parse(await readFile(fx(`${id}.geojson`), 'utf8')),
      meta: JSON.parse(await readFile(fx(`${id}.meta.json`), 'utf8')),
    } as PublishedLayer;
  }
  return r;
}

describe('seculo-movemento', () => {
  it('gives every concello its censuses and where its people live', async () => {
    const features = build(await raw());
    expect(features.map((f) => f.properties.codigo_ine).sort()).toEqual(['15030', '27034']);
    for (const f of features) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      const anchors = f.properties.anclas as number[][];
      expect(anchors.length).toBeGreaterThan(0);
      expect(anchors.length).toBeLessThanOrEqual(ANCHORS);
      // Anchors sorted by population, inside Galicia.
      for (const [lon, lat] of anchors) {
        expect(lon).toBeGreaterThan(-9.4);
        expect(lat).toBeGreaterThan(41.7);
      }
    }
    const navia = features.find((f) => f.properties.codigo_ine === '27034')?.properties;
    expect((navia?.poboacion as number[])[0]).toBeGreaterThan(
      (navia?.poboacion as number[])[12] as number,
    );
  });
});
