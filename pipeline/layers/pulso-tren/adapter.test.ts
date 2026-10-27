import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import { FEEDS } from '../estacions-tren/adapter.ts';
import adapter, { dedupe } from './adapter.ts';
import { clip, gtfsSeconds, referenceDays, type Trip } from './gtfs-trips.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
// Real Renfe GTFS fixtures of estacions-tren (see its fixtures/README.md).
const fx = (f: string) => join(dir, '..', 'estacions-tren', 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
// Saturday: reference days are Wednesday 2026-10-28 and Sunday 2026-11-01.
const now = new Date('2026-10-24T08:00:00Z');

const routes = [
  { match: 'google_transit.zip', file: fx('google_transit.zip') },
  { match: 'fomento_transit.zip', file: fx('fomento_transit.zip') },
];

describe('gtfs-trips', () => {
  it('reads GTFS times past midnight', () => {
    expect(gtfsSeconds('08:05:30')).toBe(29130);
    expect(gtfsSeconds('25:00:00')).toBe(90000);
    expect(gtfsSeconds('8:05:00')).toBe(29100);
    expect(gtfsSeconds('')).toBeNull();
  });

  it('picks a Wednesday and the Sunday after it', () => {
    expect(referenceDays(now)).toEqual({ laborable: '20261028', domingo: '20261101' });
    // On a Wednesday, that same day.
    expect(referenceDays(new Date('2026-10-28T10:00:00Z')).laborable).toBe('20261028');
  });

  it('doubles dwell stops and splits a trip that leaves Galicia', () => {
    const stops = new Map<string, [number, number]>([
      ['a', [-8.5, 42.9]],
      ['b', [-8.0, 42.5]],
      ['out', [-5.0, 40.4]], // Madrid
      ['c', [-7.5, 42.3]],
      ['d', [-7.0, 42.1]],
    ]);
    const st = (stop: string, arr: number, dep = arr, seq = 0) => ({ seq, stop, arr, dep });
    const parts = clip(
      [st('a', 100), st('b', 200, 260), st('out', 900), st('c', 2000), st('d', 2100)],
      stops,
      0.05,
    );
    expect(parts).toEqual([
      {
        coords: [
          [-8.5, 42.9],
          [-8, 42.5],
          [-8, 42.5],
        ],
        t: [100, 200, 260],
      },
      {
        coords: [
          [-7.5, 42.3],
          [-7, 42.1],
        ],
        t: [2000, 2100],
      },
    ]);
    // A single stop inside Galicia is not a trajectory.
    expect(clip([st('out', 0), st('a', 10)], stops, 0.05)).toEqual([]);
  });

  it('drops a train repeated in both feeds', () => {
    const tr = (line: string): Trip => ({
      line,
      day: 'laborable',
      coords: [
        [-8.2, 43.48],
        [-8.0, 43.6],
      ],
      t: [100, 200],
    });
    expect(dedupe([tr('REGIONAL'), tr('C1')]).map((t) => t.line)).toEqual(['REGIONAL']);
  });
});

describe('pulso-tren adapter', () => {
  it('turns both real Renfe fixtures into valid timed trajectories inside Galicia', async () => {
    const ctx = fixtureContext(layer, routes, { now });
    const out = await adapter.normalize(await adapter.fetch(ctx), ctx);
    expect(ctx.requested).toEqual([FEEDS.ld, FEEDS.cercanias]);
    const fs = out.collection.features;
    expect(fs.length).toBeGreaterThan(0);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      const coords = (f.geometry as { coordinates: Array<[number, number]> }).coordinates;
      const t = f.properties.t as number[];
      expect(coords).toHaveLength(t.length);
      for (const [lon, lat] of coords) expect(inGalicia(lon, lat, 0.05)).toBe(true);
      // Times never go backwards along a trip.
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1] as number);
    }
    expect(fs.some((f) => f.properties.dia === 'laborable')).toBe(true);
    expect(new Set(fs.map((f) => f.properties.data))).toEqual(
      new Set(['2026-10-28', '2026-11-01'].filter((d) => fs.some((f) => f.properties.data === d))),
    );
  });
});
