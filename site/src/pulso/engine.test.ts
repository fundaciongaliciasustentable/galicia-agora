import { describe, expect, it } from 'vitest';
import { clock, positionAt, runningCurve, toTrips } from './engine.ts';

const feature = (t: number[], dia = 'laborable', modo = 'bus') => ({
  geometry: {
    type: 'LineString',
    coordinates: t.map((_, i) => [-8 + i, 42 + i]),
  },
  properties: { modo, dia, lina: 'L1', t },
});

describe('pulso engine', () => {
  it('skips malformed features and sorts by start', () => {
    const trips = toTrips([
      feature([500, 600]),
      feature([100, 200]),
      { geometry: null, properties: {} },
      { ...feature([1, 2]), properties: { modo: 'avion', dia: 'laborable', t: [1, 2] } },
    ]);
    expect(trips.map((t) => t.t[0])).toEqual([100, 500]);
  });

  it('interpolates between stops and waits at a dwell', () => {
    // Stops at -8/42 (t 0), -7/43 (t 100, waits to 200), -6/44 (t 300).
    const [trip] = toTrips([feature([0, 100, 200, 300])]);
    if (!trip) throw new Error('no trip');
    // With dwell the second vertex repeats in real data; here vertices differ, so check maths.
    expect(positionAt(trip, -1)).toBeNull();
    expect(positionAt(trip, 301)).toBeNull();
    expect(positionAt(trip, 0)).toEqual([-8, 42]);
    expect(positionAt(trip, 50)).toEqual([-7.5, 42.5]);
    expect(positionAt(trip, 300)).toEqual([-5, 45]);
    const [dwell] = toTrips([
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
            [1, 1],
            [2, 2],
          ],
        },
        properties: { modo: 'tren', dia: 'domingo', t: [0, 100, 200, 300] },
      },
    ]);
    if (!dwell) throw new Error('no trip');
    expect(positionAt(dwell, 150)).toEqual([1, 1]);
  });

  it('counts vehicles running through the day', () => {
    const trips = toTrips([feature([0, 600]), feature([300, 900]), feature([86400, 87000])]);
    const c = runningCurve(trips, 300);
    expect([...c.slice(0, 5)]).toEqual([1, 2, 2, 1, 0]);
    // Night service after midnight is counted at 24:00.
    expect(c[288]).toBe(1);
  });

  it('formats the clock and wraps past midnight', () => {
    expect(clock(29100)).toBe('08:05');
    expect(clock(90000)).toBe('01:00');
  });
});
