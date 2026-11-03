import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LayerDef, PublishedLayer } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import { ROWS } from '../galicia-linas/adapter.ts';
import adapter, { COLS, INPUTS } from './adapter.ts';
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
  const ctx = { ...fixtureContext(layer, []), readLayer: readFixture };
  const { collection } = await adapter.normalize(await adapter.fetch(ctx));
  rows = collection.features.map((f) => f.properties);
}, 60_000);

const frame = (r: Record<string, unknown>, i: number) =>
  Buffer.from((r.perfis as string[])[i] as string, 'base64');

describe('galicia-linas-tempo adapter', () => {
  it('declares its inputs', () => {
    expect(layer.depends_on).toEqual([...INPUTS]);
  });

  it('publishes three valid sequences with one profile per frame', () => {
    expect(rows.map((r) => r.id)).toEqual(['seculo', 'raios', 'lume']);
    for (const r of rows) {
      expect(validateWithSchema(schema, r)).toEqual([]);
      const frames = r.fotogramas as string[];
      expect((r.perfis as string[]).length).toBe(frames.length);
      expect((r.totais as number[]).length).toBe(frames.length);
      for (let i = 0; i < frames.length; i++) expect(frame(r, i)).toHaveLength(ROWS * COLS);
    }
  });

  it('plays the censuses from 1900 to 2021 on one scale, and twelve months of lightning', () => {
    const seculo = rows.find((r) => r.id === 'seculo') as Record<string, unknown>;
    expect(seculo.fotogramas).toEqual([
      '1900',
      '1910',
      '1920',
      '1930',
      '1940',
      '1950',
      '1960',
      '1970',
      '1981',
      '1991',
      '2001',
      '2011',
      '2021',
    ]);
    // A Coruña and Santiago grow: the peak frame is a late one and reaches 255.
    const peaks = (seculo.perfis as string[]).map((_, i) => Math.max(...frame(seculo, i)));
    expect(Math.max(...peaks)).toBe(255);
    expect(peaks[0]).toBeLessThan(peaks[12] as number);
    const raios = rows.find((r) => r.id === 'raios') as Record<string, unknown>;
    expect(raios.fotogramas).toHaveLength(12);
  });
});
