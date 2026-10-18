import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { normalizeFeeds, PAD } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

const routes = [
  { match: 'vehicle_positions_LD.json', file: fx('vehicle_positions_LD.json') },
  { match: 'vehicle_positions.json', file: fx('vehicle_positions.json') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw) };
}

describe('tren adapter', () => {
  it('fetches both feeds and normalizes real fixtures', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(2);
    expect(out.collection.features.length).toBeGreaterThan(0);
    for (const f of out.collection.features) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
  });

  it('keeps only vehicles inside the Galicia bbox (pad 0.15)', async () => {
    const { out } = await run();
    for (const f of out.collection.features) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, PAD)).toBe(true);
    }
    // The LD feed alone has 165 entities across Spain; the result is a small subset.
    expect(out.collection.features.length).toBeLessThan(40);
  });

  it('deduplicates repeated trains by vehicle id', async () => {
    const { out } = await run();
    const ids = out.collection.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Train 00621 appears five times in the LD fixture (one per tripId).
    expect(ids.filter((id) => id === '00621')).toHaveLength(1);
    // 71800 is in both feeds; the Cercanías entry has a vehicle timestamp, so it wins.
    const t = out.collection.features.find((f) => f.id === '71800');
    expect(t?.properties.rede).toBe('Cercanías');
    expect(t?.properties.tren).toBe('C1-71800');
  });

  it('keeps the newest timestamp among duplicates', () => {
    const feed = (entities: unknown[]) =>
      JSON.stringify({ header: { timestamp: '1792309925' }, entity: entities });
    const ent = (ts: string, lat: number) => ({
      id: 'VP_1',
      vehicle: {
        trip: { tripId: `t${ts}` },
        position: { latitude: lat, longitude: -8.5 },
        timestamp: ts,
        vehicle: { id: '1', label: '1' },
      },
    });
    const out = normalizeFeeds({
      ld: feed([ent('1792309000', 42.1), ent('1792309900', 42.2), ent('1792309500', 42.3)]),
      cercanias: feed([]),
    });
    expect(out.collection.features).toHaveLength(1);
    expect(out.collection.features[0]?.properties.data_posicion).toBe('2026-10-18T07:51:40.000Z');
  });

  it('parses timestamps as ISO UTC', async () => {
    const { out } = await run();
    // Oldest of the two headers: Cercanías 1792309914 vs LD 1792309925.
    expect(out.publishedAt).toBe('2026-10-18T07:51:54.000Z');
    const withTs = out.collection.features.filter((f) => f.properties.data_posicion);
    expect(withTs.length).toBeGreaterThan(0);
    for (const f of withTs) {
      expect(f.properties.data_posicion).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
    }
  });

  it('throws on a malformed response and yields 0 features on an empty one', () => {
    expect(() => normalizeFeeds({ ld: '{"foo":1}', cercanias: '{"foo":1}' })).toThrow();
    expect(() => normalizeFeeds({ ld: 'not json', cercanias: '{}' })).toThrow();
    const empty = JSON.stringify({ header: { timestamp: '1792309925' }, entity: [] });
    expect(normalizeFeeds({ ld: empty, cercanias: empty }).collection.features).toHaveLength(0);
  });
});
