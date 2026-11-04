import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { asciiValues, CATALOG, GRID, QUANT, runs, runTime, timeSteps } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

describe('vento-wrf adapter', () => {
  it('reads the runs, the steps and the ASCII values', async () => {
    const list = runs(await readFile(fx('catalog.xml'), 'utf8'));
    expect(list[0]).toBe(
      'wrf_2d_04km/fmrc/files/20261104/wrf_arw_det_history_d03_20261104_0000.nc4',
    );
    expect(runTime(list[0] as string).toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(timeSteps(await readFile(fx('dds.txt'), 'utf8'))).toBe(96);
    const u = asciiValues(await readFile(fx('u.txt'), 'utf8'), 'u');
    expect(u.length).toBe(200);
    expect(layer.source_url).toBe(CATALOG);
  });

  it('builds a regular grid of packed winds from the real response', async () => {
    const ctx = fixtureContext(layer, [
      { match: 'catalog.xml', file: fx('catalog.xml') },
      { match: '.dds', file: fx('dds.txt') },
      { match: 'ascii?lon', file: fx('coords.txt') },
      { match: 'ascii?u', file: fx('u.txt') },
      { match: 'ascii?v', file: fx('v.txt') },
    ]);
    const { collection, publishedAt } = await adapter.normalize(await adapter.fetch(ctx));
    expect(publishedAt).toBe('2026-11-04T00:00:00.000Z');
    const p = collection.features[0]?.properties as Record<string, unknown>;
    expect(validateWithSchema(schema, p)).toEqual([]);
    expect(p.horas).toEqual(['2026-11-04T00:00:00.000Z', '2026-11-04T03:00:00.000Z']);
    const bytes = new Int8Array(Buffer.from((p.uv as string[])[0] as string, 'base64'));
    expect(bytes.length).toBe(GRID.nx * GRID.ny * 2);
    // The 10 × 10 sample covers part of inland Galicia: some cells get wind, within range.
    expect(bytes.some((b) => b !== 0)).toBe(true);
    expect(Math.max(...[...bytes].map(Math.abs)) * QUANT).toBeLessThanOrEqual(
      (p.vento_max_ms as number) + QUANT,
    );
  });
});
