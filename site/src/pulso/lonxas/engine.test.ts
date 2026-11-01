import { describe, expect, it } from 'vitest';
import { dateOf, GROUPS, indexOf, type Lonxa, perDay, radius, slices } from './engine.ts';

const zeros = () => Array(365).fill(0) as number[];
const lonxa = (eur: Partial<Record<(typeof GROUPS)[number], number[]>>): Lonxa => ({
  id: 'x',
  name: 'X',
  zone: '',
  lonlat: [0, 0],
  eur: Object.fromEntries(GROUPS.map((g) => [g, eur[g] ?? zeros()])) as Lonxa['eur'],
  kg: zeros(),
  total: 0,
  tonnes: 0,
  days: 0,
  species: [],
});

describe('lonxas engine', () => {
  it('maps days to dates and back', () => {
    expect(dateOf(0)).toEqual({ month: 0, day: 1, weekday: 3 }); // 1/1/2025 was a Wednesday
    expect(dateOf(364)).toEqual({ month: 11, day: 31, weekday: 3 });
    expect(indexOf(8, 5)).toBe(216);
    expect(dateOf(indexOf(8, 5))).toMatchObject({ month: 7, day: 5 });
    expect(indexOf(2, 30)).toBe(-1);
  });

  it('adds only the groups that are on', () => {
    const p = zeros();
    p[3] = 100;
    const b = zeros();
    b[3] = 40;
    const l = lonxa({ peixes: p, bivalvos: b });
    expect(slices(l, 3, new Set(['peixes']))).toEqual([100, 0, 0, 0, 0]);
    expect(perDay([l, l], new Set(['peixes', 'bivalvos']))[3]).toEqual([200, 80, 0, 0, 0]);
  });

  it('scales circles by area', () => {
    expect(radius(400, 1)).toBe(20);
    expect(radius(1600, 1)).toBe(2 * radius(400, 1));
    expect(radius(0, 1)).toBe(0);
  });
});
