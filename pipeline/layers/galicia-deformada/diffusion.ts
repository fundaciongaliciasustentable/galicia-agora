// Diffusion cartograms (Gastner and Newman, 2004, PNAS 101:7499): the value of each unit is
// spread over its area as a density, the density is let diffuse until it is even, and every
// vertex is carried along by the flow v = −∇ρ/ρ. The flow is smooth and never folds, so shared
// borders stay shared and units never overlap. The density is solved in cosine series on a
// square grid (reflecting borders), with radix-2 FFTs.
//
// Positions are in grid cells. The map sits in the middle of the grid with a sea of mean
// density around it, so units can grow outwards.

/** In-place radix-2 complex FFT (sign −1 forward, +1 backward, unnormalised). */
export function fft(re: Float64Array, im: Float64Array, sign: 1 | -1): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] as number) * cr - (im[b] as number) * ci;
        const xi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Reusable 1-D cosine transforms of length n (a power of two). */
export class Cosine {
  readonly n: number;
  private re: Float64Array;
  private im: Float64Array;
  private c: Float64Array;
  private s: Float64Array;
  constructor(n: number) {
    this.n = n;
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.c = new Float64Array(n);
    this.s = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      this.c[k] = Math.cos((Math.PI * k) / (2 * n));
      this.s[k] = Math.sin((Math.PI * k) / (2 * n));
    }
  }

  /** Coefficients a with x[m] = Σ_k a[k] cos(πk(m+½)/n) (a[0] is the mean). */
  analyse(x: Float64Array, a: Float64Array): void {
    const { n, re, im, c, s } = this;
    for (let m = 0; m < n / 2; m++) {
      re[m] = x[2 * m] as number;
      re[n - 1 - m] = x[2 * m + 1] as number;
    }
    im.fill(0);
    fft(re, im, -1);
    for (let k = 0; k < n; k++) {
      // DCT-II: Re(V_k e^{−iπk/2n}).
      const y = (re[k] as number) * (c[k] as number) + (im[k] as number) * (s[k] as number);
      a[k] = (k === 0 ? 1 : 2) * (y / n);
    }
  }

  /** x[m] = Σ_k a[k] cos(πk(m+½)/n). */
  cosSum(a: Float64Array, x: Float64Array): void {
    const { n, re, im, c, s } = this;
    // Z_k = (a_k − i a_{n−k}) e^{iπk/2n}, a_n = 0; then x[2m] = Re z_m, x[2m+1] = Re z_{n−1−m}.
    for (let k = 0; k < n; k++) {
      const ar = k === 0 ? (a[0] as number) : (a[k] as number) / 2;
      const ai = k === 0 ? 0 : -(a[n - k] as number) / 2;
      re[k] = ar * (c[k] as number) - ai * (s[k] as number);
      im[k] = ar * (s[k] as number) + ai * (c[k] as number);
    }
    fft(re, im, 1);
    for (let m = 0; m < n / 2; m++) {
      x[2 * m] = re[m] as number;
      x[2 * m + 1] = re[n - 1 - m] as number;
    }
  }

  /** x[m] = Σ_k b[k] sin(πk(m+½)/n) (b[0] ignored), through the cosine sum. */
  sinSum(b: Float64Array, x: Float64Array, tmp: Float64Array): void {
    const { n } = this;
    tmp[0] = 0;
    for (let j = 1; j < n; j++) tmp[j] = b[n - j] as number;
    this.cosSum(tmp, x);
    for (let m = 1; m < n; m += 2) x[m] = -(x[m] as number);
  }
}

/** 2-D transforms on an n × n grid stored row-major (index = y·n + x). */
class Grid {
  readonly n: number;
  readonly cos: Cosine;
  private row: Float64Array;
  private out: Float64Array;
  private tmp: Float64Array;
  constructor(n: number) {
    this.n = n;
    this.cos = new Cosine(n);
    this.row = new Float64Array(n);
    this.out = new Float64Array(n);
    this.tmp = new Float64Array(n);
  }

  private pass(
    src: Float64Array,
    dst: Float64Array,
    alongX: boolean,
    op: (inp: Float64Array, out: Float64Array) => void,
  ): void {
    const { n, row, out } = this;
    for (let r = 0; r < n; r++) {
      for (let i = 0; i < n; i++) row[i] = src[alongX ? r * n + i : i * n + r] as number;
      op(row, out);
      for (let i = 0; i < n; i++) dst[alongX ? r * n + i : i * n + r] = out[i] as number;
    }
  }

  analyse(src: Float64Array, dst: Float64Array): void {
    const tmp = new Float64Array(src.length);
    this.pass(src, tmp, true, (a, b) => this.cos.analyse(a, b));
    this.pass(tmp, dst, false, (a, b) => this.cos.analyse(a, b));
  }

  /** Synthesis with cosines or sines along each axis. */
  synth(
    src: Float64Array,
    dst: Float64Array,
    sinX: boolean,
    sinY: boolean,
    work: Float64Array,
  ): void {
    const c = (a: Float64Array, b: Float64Array) => this.cos.cosSum(a, b);
    const s = (a: Float64Array, b: Float64Array) => this.cos.sinSum(a, b, this.tmp);
    this.pass(src, work, true, sinX ? s : c);
    this.pass(work, dst, false, sinY ? s : c);
  }
}

export interface Shape {
  /** Rings of every unit as flat [x0, y0, x1, y1, …] arrays of vertex positions, open. */
  rings: Array<{ unit: number; sign: 1 | -1; idx: Uint32Array }>;
  units: number;
}

/** Areas of the units (grid cells²), outer rings minus holes. */
export function unitAreas(shape: Shape, pos: Float64Array): Float64Array {
  const area = new Float64Array(shape.units);
  for (const { unit, sign, idx } of shape.rings) {
    let a = 0;
    for (let i = 0, j = idx.length - 1; i < idx.length; j = i++) {
      const pj = 2 * (idx[j] as number);
      const pi = 2 * (idx[i] as number);
      a +=
        (pos[pj] as number) * (pos[pi + 1] as number) -
        (pos[pi] as number) * (pos[pj + 1] as number);
    }
    area[unit] = (area[unit] as number) + sign * Math.abs(a / 2);
  }
  return area;
}

/** Density per cell: each unit's value over its area, mean density elsewhere (even-odd fill). */
function rasterise(
  shape: Shape,
  pos: Float64Array,
  n: number,
  density: Float64Array,
  mean: number,
) {
  const out = new Float64Array(n * n).fill(mean);
  // Per unit, crossings of each row's centre line, filled pairwise.
  const byUnit = new Map<number, Array<Uint32Array>>();
  for (const r of shape.rings) byUnit.set(r.unit, [...(byUnit.get(r.unit) ?? []), r.idx]);
  for (const [unit, rings] of byUnit) {
    const d = density[unit] as number;
    let y0 = Number.POSITIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const idx of rings) {
      for (const p of idx) {
        const y = pos[2 * p + 1] as number;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    for (let row = Math.max(0, Math.floor(y0)); row <= Math.min(n - 1, Math.ceil(y1)); row++) {
      const yc = row + 0.5;
      const xs: number[] = [];
      for (const idx of rings) {
        for (let i = 0, j = idx.length - 1; i < idx.length; j = i++) {
          const ax = pos[2 * (idx[j] as number)] as number;
          const ay = pos[2 * (idx[j] as number) + 1] as number;
          const bx = pos[2 * (idx[i] as number)] as number;
          const by = pos[2 * (idx[i] as number) + 1] as number;
          if (ay > yc !== by > yc) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil((xs[k] as number) - 0.5));
        const to = Math.min(n - 1, Math.floor((xs[k + 1] as number) - 0.5));
        for (let x = from; x <= to; x++) out[row * n + x] = d;
      }
    }
  }
  return out;
}

/** Bilinear sample of a cell-centred grid at (x, y), clamped to the edge. */
function sample(g: Float64Array, n: number, x: number, y: number): number {
  const fx = Math.min(n - 1.000001, Math.max(0, x - 0.5));
  const fy = Math.min(n - 1.000001, Math.max(0, y - 0.5));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const a = g[j * n + i] as number;
  const b = g[j * n + i + 1] as number;
  const c = g[(j + 1) * n + i] as number;
  const d = g[(j + 1) * n + i + 1] as number;
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/**
 * One diffusion pass: move `pos` (grid cells, in place) so unit areas approach `values`.
 * `maxStep` caps the displacement of any vertex per step, in cells.
 */
export function diffuse(
  shape: Shape,
  pos: Float64Array,
  values: Float64Array,
  n: number,
  { maxStep = 0.25, maxSteps = 600, tEnd = (n * n) / 4 } = {},
): void {
  const area = unitAreas(shape, pos);
  let totalV = 0;
  let totalA = 0;
  for (let u = 0; u < shape.units; u++) {
    totalV += values[u] as number;
    totalA += area[u] as number;
  }
  const density = new Float64Array(shape.units);
  for (let u = 0; u < shape.units; u++)
    density[u] = (values[u] as number) / Math.max(area[u] as number, 1e-9);
  const rho0 = rasterise(shape, pos, n, density, totalV / totalA);

  const grid = new Grid(n);
  const coef = new Float64Array(n * n);
  grid.analyse(rho0, coef);

  const scaled = new Float64Array(n * n);
  const rho = new Float64Array(n * n);
  const gx = new Float64Array(n * n);
  const gy = new Float64Array(n * n);
  const work = new Float64Array(n * n);
  const k2 = new Float64Array(n);
  for (let k = 0; k < n; k++) k2[k] = (Math.PI * k) / n;

  const verts = pos.length / 2;
  const vx = new Float64Array(verts);
  const vy = new Float64Array(verts);
  let t = 0;
  let dt = 0.01;
  for (let step = 0; step < maxSteps && t < tEnd; step++) {
    // ρ(t) and its gradient at the current time.
    for (let ky = 0; ky < n; ky++) {
      for (let kx = 0; kx < n; kx++) {
        const e = Math.exp(-((k2[kx] as number) ** 2 + (k2[ky] as number) ** 2) * t);
        scaled[ky * n + kx] = (coef[ky * n + kx] as number) * e;
      }
    }
    grid.synth(scaled, rho, false, false, work);
    for (let ky = 0; ky < n; ky++) {
      for (let kx = 0; kx < n; kx++)
        work[ky * n + kx] = -(k2[kx] as number) * (scaled[ky * n + kx] as number);
    }
    const sx = Float64Array.from(work);
    grid.synth(sx, gx, true, false, work);
    for (let ky = 0; ky < n; ky++) {
      for (let kx = 0; kx < n; kx++)
        work[ky * n + kx] = -(k2[ky] as number) * (scaled[ky * n + kx] as number);
    }
    const sy = Float64Array.from(work);
    grid.synth(sy, gy, false, true, work);

    let vmax = 0;
    for (let p = 0; p < verts; p++) {
      const x = pos[2 * p] as number;
      const y = pos[2 * p + 1] as number;
      const r = sample(rho, n, x, y);
      vx[p] = -sample(gx, n, x, y) / r;
      vy[p] = -sample(gy, n, x, y) / r;
      vmax = Math.max(vmax, Math.hypot(vx[p] as number, vy[p] as number));
    }
    if (vmax * dt > maxStep) dt = maxStep / vmax;
    for (let p = 0; p < verts; p++) {
      pos[2 * p] = (pos[2 * p] as number) + (vx[p] as number) * dt;
      pos[2 * p + 1] = (pos[2 * p + 1] as number) + (vy[p] as number) * dt;
    }
    t += dt;
    if (vmax * dt < 1e-4) break;
    dt *= 1.4;
  }
}

/** Share of the total area that is misplaced: Σ|area − target| / Σ target (0 = exact). */
export function areaError(shape: Shape, pos: Float64Array, values: Float64Array): number {
  const area = unitAreas(shape, pos);
  let totalV = 0;
  let totalA = 0;
  for (let u = 0; u < shape.units; u++) {
    totalV += values[u] as number;
    totalA += area[u] as number;
  }
  let e = 0;
  for (let u = 0; u < shape.units; u++) {
    e += Math.abs((area[u] as number) - ((values[u] as number) / totalV) * totalA);
  }
  return e / totalA;
}

type Geometry = { type: string; coordinates: unknown } | null;

/**
 * Shared-vertex topology of GeoJSON polygons (identical coordinates become one vertex), with
 * the vertices fitted into the middle half of an n × n grid (y grows southwards).
 */
export function topology(geometries: Geometry[], n: number): Shape & { base: Float64Array } {
  const kx = Math.cos((42.75 * Math.PI) / 180);
  const index = new Map<string, number>();
  const xy: number[] = [];
  const rings: Shape['rings'] = [];
  geometries.forEach((g, unit) => {
    const polys = (
      g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []
    ) as number[][][][];
    for (const poly of polys) {
      poly.forEach((ring, r) => {
        const ids: number[] = [];
        for (let i = 0; i < ring.length - 1; i++) {
          const [lon, lat] = ring[i] as [number, number];
          const k = `${lon},${lat}`;
          let id = index.get(k);
          if (id === undefined) {
            id = xy.length / 2;
            index.set(k, id);
            xy.push(lon * kx, -lat);
          }
          ids.push(id);
        }
        rings.push({ unit, sign: r === 0 ? 1 : -1, idx: Uint32Array.from(ids) });
      });
    }
  });
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < xy.length; i += 2) {
    x0 = Math.min(x0, xy[i] as number);
    x1 = Math.max(x1, xy[i] as number);
    y0 = Math.min(y0, xy[i + 1] as number);
    y1 = Math.max(y1, xy[i + 1] as number);
  }
  const s = n / 2 / Math.max(x1 - x0, y1 - y0);
  const base = new Float64Array(xy.length);
  for (let i = 0; i < xy.length; i += 2) {
    base[i] = n / 2 + ((xy[i] as number) - (x0 + x1) / 2) * s;
    base[i + 1] = n / 2 + ((xy[i + 1] as number) - (y0 + y1) / 2) * s;
  }
  return { rings, units: geometries.length, base };
}
