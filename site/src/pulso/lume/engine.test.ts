import { describe, expect, it } from 'vitest';
import { type Detection, ember, passes, perDay, secondsOf, upTo } from './engine.ts';

const d = (t: number, product = 'VIIRS S-NPP'): Detection => ({
  t,
  lonlat: [0, 0],
  frp: 1,
  product,
  concello: 'x',
});

describe('lume engine', () => {
  it('counts time from 1 June 00:00 in Galicia', () => {
    expect(secondsOf('2025-05-31T22:00:00Z')).toBe(0);
    // 15 August is day 75 of the season (30 + 31 + 14 days before it).
    expect(secondsOf('2025-08-15T13:19:00Z')).toBe(75 * 86400 + 15 * 3600 + 19 * 60);
  });

  it('finds what has been seen so far', () => {
    const ds = [d(10), d(20), d(30)];
    expect(upTo(ds, 5)).toBe(0);
    expect(upTo(ds, 20)).toBe(2);
    expect(upTo(ds, 99)).toBe(3);
  });

  it('groups detections into passes', () => {
    const ps = passes([d(100), d(100), d(130), d(100, 'MODIS'), d(5000)]);
    expect(ps.map((p) => p.count)).toEqual([3, 1, 1]);
  });

  it('counts per local day and cools embers', () => {
    expect(perDay([d(10), d(86400 + 5), d(86400 * 30 + 1)])).toEqual(expect.arrayContaining([1]));
    expect(perDay([d(10), d(86401)]).slice(0, 2)).toEqual([1, 1]);
    expect(ember(0).glow).toBe(1);
    expect(ember(100 * 3600)).toEqual({ r: 200, g: 45, b: 20, a: 0.6, glow: 0 });
  });
});
