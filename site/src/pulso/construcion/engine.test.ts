import { describe, expect, it } from 'vitest';
import { byDecade, cellAlpha, decodeCells, decodeYear, mercX, mercY } from './engine.ts';

describe('construcion engine', () => {
  it('projects to Web Mercator', () => {
    expect(mercX(-180)).toBe(0);
    expect(mercX(0)).toBe(0.5);
    expect(mercY(0)).toBeCloseTo(0.5, 12);
    // Latitude 42.88°: EPSG:3857 y = R·ln(tan(π/4 + φ/2)) = 5,293,724 m on a 40,075,016.686 m world.
    expect((0.5 - mercY(42.88)) * 40_075_016.686).toBeCloseTo(5_293_724, -1);
  });

  it('makes crowded cells brighter and tiny ones fainter', () => {
    expect(cellAlpha(10, 4)).toBeGreaterThan(cellAlpha(1, 4));
    expect(cellAlpha(10, 0.2)).toBeLessThan(cellAlpha(10, 4));
    expect(cellAlpha(1e6, 10)).toBe(0.95);
  });

  it('sums years into decades per use', () => {
    const series = [
      [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 5],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1],
    ];
    expect(byDecade(series, 1900)).toEqual([
      [1900, [3, 3]],
      [1910, [5, 1]],
    ]);
  });

  it('decodes the compact layer', () => {
    const y = decodeYear({ d: [0, 0, 3], v: [20 * 5, 4 * 5 + 3, 7 * 5 + 2] });
    expect([...y.c]).toEqual([0, 0, 3]);
    expect([...y.u]).toEqual([0, 3, 2]);
    expect([...y.n]).toEqual([20, 4, 7]);
    // Cell (2600, 18600) of 250 m in UTM 29N: 650,125 E, 4,650,125 N; reference lon/lat from the
    // separate Python conversion in datos/fontes/catastro-edificios/descargar.py.
    const { mx, my } = decodeCells({ lado_m: 250, fuso: 29, x0: 2600, y0: 18600, x: [0], y: [0] });
    expect(mx[0]).toBeCloseTo(mercX(-7.18763), 7);
    expect(my[0]).toBeCloseTo(mercY(41.98883), 7);
  });
});
