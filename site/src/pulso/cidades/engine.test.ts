import { describe, expect, it } from 'vitest';
import { type Hourly, particlesAt, presenceAt, presenceCurve, rand, TRAVEL } from './engine.ts';

const hourly = (e: Record<number, number>, s: Record<number, number>): Hourly => ({
  entradas: Array.from({ length: 24 }, (_, h) => e[h] ?? 0),
  saidas: Array.from({ length: 24 }, (_, h) => s[h] ?? 0),
  internas: Array(24).fill(0),
});

describe('cidades engine', () => {
  const h = hourly({ 8: 1000 }, { 14: 600 });

  it('spreads each hour evenly in the running presence', () => {
    expect(presenceAt(h, 8 * 3600)).toBe(0);
    expect(presenceAt(h, 8.5 * 3600)).toBe(500);
    expect(presenceAt(h, 12 * 3600)).toBe(1000);
    expect(presenceAt(h, 24 * 3600)).toBe(400);
    expect(presenceAt(h, 30 * 3600)).toBe(400);
  });

  it('gives the curve in % of residents', () => {
    const c = presenceCurve(h, 10_000, 3600);
    expect(c).toHaveLength(25);
    expect(c[12]).toBe(10);
    expect(c[24]).toBe(4);
  });

  it('draws one particle per 0.1 % of residents and travels for TRAVEL seconds', () => {
    // 1000 trips for 100 000 residents = 1 % = 10 particles in the 08:00 hour.
    const all = new Set<number>();
    for (let s = 8 * 3600; s <= 9 * 3600 + TRAVEL; s += 60) {
      for (const p of particlesAt(h, 100_000, s, 1)) {
        expect(p.inbound).toBe(true);
        expect(p.progress).toBeGreaterThanOrEqual(0);
        expect(p.progress).toBeLessThanOrEqual(1);
        all.add(Math.round(p.angle * 1e6));
      }
    }
    expect(all.size).toBe(10);
    expect(particlesAt(h, 100_000, 7 * 3600, 1)).toEqual([]);
  });

  it('is deterministic, so scrubbing shows the same picture', () => {
    expect(particlesAt(h, 100_000, 8.6 * 3600, 3)).toEqual(particlesAt(h, 100_000, 8.6 * 3600, 3));
    expect(rand(1, 2, 3)).toBe(rand(1, 2, 3));
    expect(rand(1, 2, 3)).not.toBe(rand(1, 2, 4));
  });
});
