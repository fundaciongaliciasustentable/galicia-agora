import { describe, expect, it } from 'vitest';
import { boundsOf, coverAtZoom, coverTiles, project, type Rings, tileBounds } from './tiles.ts';

/** A lon/lat rectangle as a polygon. */
const rect = (w: number, s: number, e: number, n: number): Rings => [
  [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ],
];

describe('project and tileBounds', () => {
  it('agree with each other around Santiago', () => {
    const [x, y] = project(-8.54, 42.88, 16);
    const b = tileBounds({ z: 16, x: Math.floor(x), y: Math.floor(y) });
    expect(b.west).toBeLessThanOrEqual(-8.54);
    expect(b.east).toBeGreaterThan(-8.54);
    expect(b.south).toBeLessThanOrEqual(42.88);
    expect(b.north).toBeGreaterThan(42.88);
  });
});

describe('coverAtZoom', () => {
  it('keeps the tiles a rectangle touches, plus the edge margin, and nothing far away', () => {
    const poly = rect(-8.6, 42.8, -8.4, 42.95);
    const [x0, y0] = project(-8.6, 42.95, 14).map(Math.floor) as [number, number];
    const [x1, y1] = project(-8.4, 42.8, 14).map(Math.floor) as [number, number];
    const exact = coverAtZoom([poly], 14, 0);
    expect(exact.length).toBe((x1 - x0 + 1) * (y1 - y0 + 1));
    const buffered = coverAtZoom([poly], 14, 1);
    expect(buffered.length).toBe((x1 - x0 + 3) * (y1 - y0 + 3));
    expect(exact.some(([x, y]) => x === x1 + 5 && y === y0)).toBe(false);
  });

  it('fills the interior of large polygons, not only their edges', () => {
    const tiles = coverAtZoom([rect(-8, 42, -7, 43)], 16, 0);
    const [cx, cy] = project(-7.5, 42.5, 16).map(Math.floor) as [number, number];
    expect(tiles.some(([x, y]) => x === cx && y === cy)).toBe(true);
  });

  it('leaves no gap along a border shared by two concellos', () => {
    const west = rect(-8.2, 42.4, -8.0, 42.6);
    const east = rect(-8.0, 42.4, -7.8, 42.6);
    const both = coverAtZoom([west, east], 15, 0);
    const whole = coverAtZoom([rect(-8.2, 42.4, -7.8, 42.6)], 15, 0);
    expect(both).toEqual(whole);
  });

  it('respects holes (an enclave not in the mask stays out)', () => {
    const outer = rect(-8.2, 42.4, -7.8, 42.8)[0] as number[][];
    const hole = rect(-8.1, 42.5, -7.9, 42.7)[0] as number[][];
    const tiles = coverAtZoom([[outer, hole]], 14, 0);
    const [cx, cy] = project(-8.0, 42.6, 14).map(Math.floor) as [number, number];
    expect(tiles.some(([x, y]) => x === cx && y === cy)).toBe(false);
  });
});

describe('coverTiles', () => {
  it('derives each zoom from the deepest one, lowest zoom first', () => {
    const tiles = coverTiles([rect(-8.6, 42.8, -8.4, 42.95)], 10, 15);
    expect(tiles[0]?.z).toBe(10);
    expect(tiles[tiles.length - 1]?.z).toBe(15);
    const keys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
    // Every tile below the deepest zoom has at least one child in the set, and every child its parent.
    for (const t of tiles) {
      if (t.z < 15) {
        const kids = [0, 1].flatMap((dx) =>
          [0, 1].map((dy) => `${t.z + 1}/${2 * t.x + dx}/${2 * t.y + dy}`),
        );
        expect(kids.some((k) => keys.has(k))).toBe(true);
      }
      if (t.z > 10) expect(keys.has(`${t.z - 1}/${t.x >> 1}/${t.y >> 1}`)).toBe(true);
    }
    const b = boundsOf(tiles.filter((t) => t.z === 15));
    expect(b.west).toBeLessThan(-8.6);
    expect(b.north).toBeGreaterThan(42.95);
  });
});
