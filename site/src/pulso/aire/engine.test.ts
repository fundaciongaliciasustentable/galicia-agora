import { describe, expect, it } from 'vitest';
import { band, bandCounts } from './engine.ts';

describe('aire engine', () => {
  it('bands ICA values as MeteoGalicia does', () => {
    expect(band(0.86)).toBe(0);
    expect(band(1)).toBe(1);
    expect(band(5.3)).toBe(5);
    expect(band(7)).toBe(5);
  });
  it('counts stations per band and hour, skipping gaps', () => {
    const c = bandCounts(
      [
        [0.5, null],
        [2.2, 3.1],
      ],
      2,
    );
    expect(c[0]).toEqual([1, 0, 1, 0, 0, 0]);
    expect(c[1]).toEqual([0, 0, 0, 1, 0, 0]);
  });
});
