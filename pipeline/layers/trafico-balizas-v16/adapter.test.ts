import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import { clearSituationsCache } from '../trafico-incidencias/situations.ts';
import adapter, { floor5 } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fixture = join(dir, 'fixtures', 'datex2_v37.xml');
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [{ match: 'datex2_v37.xml', file: fixture }];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

beforeEach(() => clearSituationsCache());

describe('trafico-balizas-v16 adapter', () => {
  it('keeps only V16 beacons in Galicia', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    expect(out.publishedAt).toBe('2026-10-24T08:11:15.501Z');
    const fs = out.collection.features;
    expect(fs).toHaveLength(4);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
    expect(fs.map((f) => f.properties.estrada)).toEqual([
      'AC-840',
      'DP-5903',
      'LU-P-2602',
      'SC-20',
    ]);
  });

  it('publishes no identifier: ids are 1..n and no source id survives', async () => {
    const { out } = await run();
    expect(out.collection.features.map((f) => f.id)).toEqual([1, 2, 3, 4]);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/V16|REDACTED/);
    // Situation and record ids of the fixture must not appear either.
    expect(json).not.toMatch(/2497\d{4}|2934\d{4}/);
    for (const f of out.collection.features) {
      expect(Object.keys(f.properties).sort()).toEqual([
        'concello',
        'desde',
        'estrada',
        'pk',
        'provincia',
      ]);
    }
  });

  it('coarsens time, km point and coordinates', async () => {
    const { out } = await run();
    const ordes = out.collection.features.find((f) => f.properties.estrada === 'DP-5903');
    expect(ordes?.properties).toMatchObject({
      pk: 0.1,
      concello: 'Ordes',
      provincia: 'A Coruña',
      desde: '2026-10-24T07:05:00.000Z',
    });
    expect(ordes?.geometry).toEqual({ type: 'Point', coordinates: [-8.409, 43.0764] });
    expect(floor5('2026-10-24T09:09:40.000+02:00')).toBe('2026-10-24T07:05:00.000Z');
    expect(floor5(null)).toBeNull();
  });

  it('the id does not depend on the source ids (same output after reordering input)', async () => {
    const { readFile } = await import('node:fs/promises');
    const xml = (await readFile(fixture, 'utf8')).replace(/V16_REDACTED-\d+/g, 'V16_other');
    const a = await adapter.normalize(Buffer.from(xml), fixtureContext(layer, []));
    const { out } = await run();
    expect(a).toEqual(out);
  });
});
