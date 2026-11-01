import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LayerDef, PublishedLayer } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import type { DayRecord } from './adapter.ts';
import adapter, {
  estimate,
  hoursToSample,
  jetstream,
  mondayOf,
  offsetOf,
  sampleWindow,
  timing,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Twenty seconds of the real Jetstream replay from cursor 1793530367163572 (1/11/2026),
// recorded with only the fields the adapter reads: time, kind, operation, collection and
// langs (no text, no account). 646 new posts, 1 tagged gl, 33 tagged es.
const T0 = 1793530367163572;
const lines = (await readFile(fx('jetstream-20s.ndjson'), 'utf8')).trim().split('\n');
const asRecorded = async function* () {
  yield* lines;
};
// For the adapter: the same 20 s moved to whatever cursor is asked, then a later event that
// closes the 6-minute window, so every sampled hour counts the fixture once.
const atCursor = async function* (cursor: number) {
  for (const l of lines) {
    const e = JSON.parse(l) as { time_us: number };
    yield JSON.stringify({ ...e, time_us: e.time_us - T0 + cursor });
  }
  yield JSON.stringify({ time_us: cursor + 600_000_000, kind: 'identity' });
};
timing.searchGapMs = 0;

describe('Jetstream sample', () => {
  beforeEach(() => {
    jetstream.open = asRecorded;
  });
  it('counts new posts and their declared languages in a window', async () => {
    expect(await sampleWindow(T0, T0 + 20_000_000)).toEqual({ posts: 646, gl: 1, es: 33 });
  });

  it('gives no sample when the replay starts after the window (buffer too short)', async () => {
    expect(await sampleWindow(T0 - 3_600_000_000, T0 - 3_000_000_000)).toBeNull();
  });

  it('gives no sample when the replay ends inside the window', async () => {
    expect(await sampleWindow(T0, T0 + 60_000_000)).toBeNull();
  });
});

describe('sampling plan', () => {
  it('samples the complete hours of the last 30, moving the window inside the hour', () => {
    const h = hoursToSample(new Date('2026-11-01T21:40:00Z'));
    expect(h).toHaveLength(30);
    expect(new Date(h[0] as number).toISOString()).toBe('2026-10-31T15:00:00.000Z');
    expect(new Date(h[29] as number).toISOString()).toBe('2026-11-01T20:00:00.000Z');
    expect(offsetOf(Date.parse('2026-11-01T20:00:00Z'))).toBe((20 * 7 + 3) % 54);
  });

  it('scales a sampled day or week to its full length, only if half was sampled', () => {
    const full: DayRecord = [0xffffff, 144, 300_000, 150, 6_000];
    expect(estimate([full], 1)).toEqual({ gl: 1500, posts: 3_000_000, minutes: 144 });
    expect(estimate([[0xfff, 66, 1, 1, 1]], 1)).toBeNull();
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
  });
});

describe('bluesky-galego adapter', () => {
  // search-few.json stands for every other week: a total under the threshold.
  it('keeps only counters and thresholds weekly mentions', async () => {
    const c = fixtureContext(
      layer,
      [
        { match: 'q=Vigo&since=2026-10-19', file: fx('search-Vigo-2026-10-19.json') },
        { match: 'q=Lugo&since=2026-10-19', file: fx('search-Lugo-2026-10-19.json') },
        { match: 'searchPosts', file: fx('search-few.json') },
      ],
      { now: new Date('2026-11-01T21:40:00Z') },
    );
    c.readPrevious = async () => null;
    c.readLayer = async () => ({
      collection: JSON.parse(await readFile(fx('poboacion-seculo.geojson'), 'utf8')),
      meta: JSON.parse(await readFile(fx('poboacion-seculo.meta.json'), 'utf8')),
    });
    jetstream.open = atCursor;
    const out = await adapter.normalize(await adapter.fetch(c), c);
    // 7 cities × 52 weeks of search, nothing else but the replay.
    expect(c.requested).toHaveLength(364);
    expect(c.requested.every((u) => u.includes('limit=1'))).toBe(true);
    const m = new Map(out.collection.features.map((f) => [String(f.id), f.properties]));
    for (const p of m.values()) expect(validateWithSchema(schema, p)).toEqual([]);
    const vigo = m.get('36057') as Record<string, unknown>;
    expect(vigo.desde).toBe('2025-10-27');
    const weeks = vigo.mencions as Array<number | null>;
    expect(weeks).toHaveLength(52);
    expect(weeks[51]).toBe(1639); // week of 19/10/2026
    expect(weeks[0]).toBeNull(); // 7 hits: under 10
    expect((vigo.valor as Array<number | null>)[51]).toBe(55.6);
    expect((m.get('27028')?.mencions as number[] | undefined)?.[51]).toBe(448);
    // The fixture is replayed for each of the 30 hours and counted once per hour (647 posts:
    // the 646 of the 20 s and the event recorded just after them).
    const days = vigo.mostras as Record<string, DayRecord>;
    expect(Object.keys(days)).toEqual(['2026-10-31', '2026-11-01']);
    expect(days['2026-11-01']?.slice(1)).toEqual([21 * 6, 21 * 647, 21, 21 * 33]);
    expect(JSON.stringify(out)).not.toMatch(/did:|at:\/\/|"text"/);
  });

  it('does not count an hour twice across runs', async () => {
    const prev: PublishedLayer = {
      collection: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: '15030',
            geometry: null,
            properties: {
              desde: '2025-10-27',
              mencions: Array(52).fill(20),
              mostras: { '2026-11-01': [(1 << 21) - 1, 126, 1, 1, 1] },
            },
          },
        ],
      },
      meta: JSON.parse(await readFile(fx('poboacion-seculo.meta.json'), 'utf8')),
    };
    const c = fixtureContext(layer, [{ match: 'searchPosts', file: fx('search-few.json') }], {
      now: new Date('2026-11-01T21:40:00Z'),
    });
    c.readPrevious = async () => prev;
    c.readLayer = async () => ({
      collection: JSON.parse(await readFile(fx('poboacion-seculo.geojson'), 'utf8')),
      meta: prev.meta,
    });
    jetstream.open = atCursor;
    const raw = await adapter.fetch(c);
    // Hours 0–20 of 1/11 were counted before; only the 9 of 31/10 are new.
    expect(raw.days['2026-11-01']).toEqual([(1 << 21) - 1, 126, 1, 1, 1]);
    expect(raw.days['2026-10-31']?.[1]).toBe(9 * 6);
    // A Coruña asks only its last two weeks again; the other cities, all 52.
    expect(c.requested.filter((u) => u.includes('q=Coru'))).toHaveLength(2);
  });
});
