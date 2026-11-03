import { describe, expect, it } from 'vitest';
import { group, terciles } from './classes.ts';

describe('bivariate classes', () => {
  it('cuts values in three equal groups', () => {
    const values = Array.from({ length: 9 }, (_, i) => i + 1);
    const cuts = terciles(values);
    expect(values.map((v) => group(v, cuts, false))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it('inverts the order when asked', () => {
    expect(group(1, [3, 6], true)).toBe(2);
    expect(group(9, [3, 6], true)).toBe(0);
  });
});
