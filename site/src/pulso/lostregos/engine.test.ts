import { describe, expect, it } from 'vitest';
import { busiestHour, datesBetween, flash, perDay, upTo } from './engine.ts';

describe('lostregos engine', () => {
  it('lists every date of the period, leap years included', () => {
    const d = datesBetween('2025-11-01', '2026-10-31');
    expect(d).toHaveLength(365);
    expect(d[0]).toBe('2025-11-01');
    expect(d.at(-1)).toBe('2026-10-31');
    expect(datesBetween('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });

  it('counts strikes per date, zero on quiet days', () => {
    const storms = [{ day: '2025-11-02', t: [1, 2, 3], lon: [], lat: [], ka: [] }];
    expect(perDay(['2025-11-01', '2025-11-02'], storms)).toEqual([0, 3]);
  });

  it('finds the strikes seen so far', () => {
    expect(upTo([10, 20, 20, 30], 20)).toBe(3);
    expect(upTo([10, 20], 5)).toBe(0);
  });

  it('flashes, cools and stays as a faint mark', () => {
    expect(flash(0)).toEqual({ glow: 1, alpha: 1 });
    expect(flash(30 * 60).glow).toBe(0);
    expect(flash(30 * 60).alpha).toBeLessThan(1);
    expect(flash(3 * 3600)).toEqual({ glow: 0, alpha: 0.25 });
  });

  it('finds the busiest hour', () => {
    expect(busiestHour([100, 3700, 3800, 3900, 7300])).toEqual([1, 3]);
  });
});
