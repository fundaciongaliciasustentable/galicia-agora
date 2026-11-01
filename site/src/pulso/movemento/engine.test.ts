import { describe, expect, it } from 'vitest';
import { along, hourlyTotals, particlesInHour, progressAt, travelSeconds, UNIT } from './engine.ts';

describe('movemento engine', () => {
  it('keeps the expected number of particles for small flows', () => {
    // 30 trips an hour = 0.3 particles: over many hours, about 30 % of them get one.
    let n = 0;
    for (let seed = 0; seed < 2000; seed++) n += particlesInHour(30, seed, 8);
    expect(n / 2000).toBeGreaterThan(0.26);
    expect(n / 2000).toBeLessThan(0.34);
    expect(particlesInHour(3 * UNIT, 1, 8)).toBe(3);
  });

  it('travels longer for longer flows', () => {
    expect(travelSeconds(1)).toBe(360);
    expect(travelSeconds(40)).toBe(3600);
  });

  it('places every particle of an hour inside its travel window', () => {
    const hours = Array(24).fill(0);
    hours[8] = 5 * UNIT;
    const seen = new Set<number>();
    for (let s = 8 * 3600; s < 10 * 3600; s += 30) {
      const ps = progressAt(hours, 20, s, 4);
      for (const p of ps) expect(p).toBeGreaterThanOrEqual(0);
      seen.add(ps.length);
    }
    expect(Math.max(...seen)).toBeLessThanOrEqual(5);
    expect(progressAt(hours, 20, 7 * 3600, 4)).toEqual([]);
  });

  it('runs the two directions of a pair on separate lanes', () => {
    const a: [number, number] = [0, 0];
    const b: [number, number] = [100, 0];
    expect(along(a, b, 0)).toEqual([0, 0]);
    expect(along(a, b, 1)).toEqual([100, 0]);
    const there = along(a, b, 0.5)[1];
    const back = along(b, a, 0.5)[1];
    expect(Math.sign(there)).toBe(-Math.sign(back));
  });

  it('adds up the hours of all flows', () => {
    const f = (v: number) => ({
      from: [0, 0] as [number, number],
      to: [1, 1] as [number, number],
      km: 1,
      hours: { mercores: Array(24).fill(v), domingo: Array(24).fill(0) },
    });
    expect(hourlyTotals([f(2), f(3)], 'mercores')[5]).toBe(5);
  });
});
