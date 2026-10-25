import { describe, expect, it } from 'vitest';
import { beeswarm, fitGeo, position, valueScale } from './layout.ts';

describe('retrato layout', () => {
  it('fits Galicia into a box, north up and inside', () => {
    const pts: Array<[number, number]> = [
      [-9.3, 42.9],
      [-6.8, 42.4],
      [-8.0, 43.7],
      [-7.9, 41.9],
    ];
    const box = { x: 10, y: 20, width: 300, height: 400 };
    const p = fitGeo(pts, box);
    for (const [lon, lat] of pts) {
      const { x, y } = p(lon, lat);
      expect(x).toBeGreaterThanOrEqual(box.x - 1e-9);
      expect(x).toBeLessThanOrEqual(box.x + box.width + 1e-9);
      expect(y).toBeGreaterThanOrEqual(box.y - 1e-9);
      expect(y).toBeLessThanOrEqual(box.y + box.height + 1e-9);
    }
    expect(p(-8, 43.7).y).toBeLessThan(p(-7.9, 41.9).y);
  });

  it('picks log, square-root or linear scales from the spread', () => {
    expect(valueScale([1, 2, 3], 0, 100).kind).toBe('linear');
    expect(valueScale([-5, 10], 0, 100).kind).toBe('linear');
    const log = valueScale([1, 10, 100], 0, 100);
    expect(log.kind).toBe('log');
    expect(log(10)).toBeCloseTo(50);
    const sqrt = valueScale([0, 1, 1, 2, 100], 0, 100);
    expect(sqrt.kind).toBe('sqrt');
    expect(sqrt(25)).toBeCloseTo(50);
  });

  it('places beeswarm dots without overlaps', () => {
    const xs = Array.from({ length: 200 }, (_, i) => (i * 7919) % 97);
    const r = 3;
    const ys = beeswarm(xs, r);
    for (let i = 0; i < xs.length; i++) {
      for (let j = i + 1; j < xs.length; j++) {
        const d2 =
          ((xs[i] as number) - (xs[j] as number)) ** 2 +
          ((ys[i] as number) - (ys[j] as number)) ** 2;
        expect(d2).toBeGreaterThanOrEqual(4 * r * r - 1e-6);
      }
    }
    // An isolated dot stays on the centre line.
    expect(beeswarm([0, 100], 3)).toEqual([0, 0]);
  });

  it('describes position neutrally', () => {
    const vs = [1, 2, 3, 4, 5];
    expect(position(5, vs)).toEqual({ side: 'above', pct: 100 });
    expect(position(1, vs)).toEqual({ side: 'below', pct: 100 });
    expect(position(3, vs)).toEqual({ side: 'middle', pct: 50 });
    expect(position(4, vs)).toEqual({ side: 'above', pct: 75 });
  });
});
