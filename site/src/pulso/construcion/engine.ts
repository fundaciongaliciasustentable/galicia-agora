// Pure helpers of /pulso/construcion/: decoding the compact layer, Web Mercator for drawing
// cells without asking the map for each one, and the per-decade table.

import { utmToLonLat } from '../../../../pipeline/lib/utm.ts';

/** Number of uses in the layer: v = buildings × USES + use. */
const USES = 5;

export interface YearCells {
  /** Index of each entry's cell. */
  c: Int32Array;
  u: Uint8Array;
  n: Int32Array;
}

/** Longitude to Web Mercator x in [0, 1). */
export function mercX(lon: number): number {
  return (lon + 180) / 360;
}

/** Latitude to Web Mercator y in [0, 1) (north at 0). */
export function mercY(lat: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

/** Opacity of a cell with `n` buildings when it is `size` px wide on screen. */
export function cellAlpha(n: number, size: number): number {
  const a = 0.16 + 0.12 * Math.log2(1 + n);
  return Math.min(0.95, a * Math.min(1, size ** 0.6));
}

/**
 * Buildings per decade and use from yearly series that start at `first`. Rows are decades
 * (1900, 1910…), columns the uses in their order.
 */
export function byDecade(series: number[][], first: number): Array<[number, number[]]> {
  const out = new Map<number, number[]>();
  series.forEach((ys, u) => {
    ys.forEach((n, i) => {
      const d = Math.floor((first + i) / 10) * 10;
      let row = out.get(d);
      if (!row) {
        row = series.map(() => 0);
        out.set(d, row);
      }
      row[u] = (row[u] ?? 0) + n;
    });
  });
  return [...out].sort((a, b) => a[0] - b[0]);
}

/** Cell centres of the «celas» feature (UTM offsets in row order) in Web Mercator. */
export function decodeCells(p: Record<string, unknown>): { mx: Float64Array; my: Float64Array } {
  const side = p.lado_m as number;
  const zone = p.fuso as number;
  const x0 = p.x0 as number;
  const y0 = p.y0 as number;
  const xs = p.x as number[];
  const ys = p.y as number[];
  const mx = new Float64Array(xs.length);
  const my = new Float64Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    const [lon, lat] = utmToLonLat(
      (x0 + (xs[i] as number) + 0.5) * side,
      (y0 + (ys[i] as number) + 0.5) * side,
      zone,
    );
    mx[i] = mercX(lon);
    my[i] = mercY(lat);
  }
  return { mx, my };
}

/** The cells of one «ano» feature: d holds gaps between cell indices, v buildings and use. */
export function decodeYear(p: Record<string, unknown>): YearCells {
  const d = p.d as number[];
  const v = p.v as number[];
  const out: YearCells = {
    c: new Int32Array(d.length),
    u: new Uint8Array(d.length),
    n: new Int32Array(d.length),
  };
  let ci = 0;
  for (let k = 0; k < d.length; k++) {
    ci += d[k] as number;
    out.c[k] = ci;
    out.u[k] = (v[k] as number) % USES;
    out.n[k] = Math.floor((v[k] as number) / USES);
  }
  return out;
}
