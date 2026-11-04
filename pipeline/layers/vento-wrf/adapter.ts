// Wind forecast for the particle map (/pulso/vento/): 10 m wind of the latest MeteoGalicia
// WRF run at 4 km (THREDDS, OPeNDAP ASCII), every STEP_H hours up to HOURS ahead.
//
// The model grid is Lambert conformal (117 × 126 points with 2-D lon/lat); u and v are already
// eastward and northward. The adapter resamples them to a regular lon/lat grid over Galicia and
// its sea (inverse-distance weighting of the 4 nearest model points) so the browser can sample
// the field with a simple bilinear lookup, and packs each step as signed bytes in steps of
// QUANT m/s (±31.75 m/s), base64.

import type { Adapter, AdapterContext, Feature, FeatureCollection } from '../../lib/adapter.ts';

export const THREDDS = 'https://thredds.meteogalicia.gal/thredds';
export const CATALOG = `${THREDDS}/catalog/wrf_2d_04km/fmrc/files/catalog.xml`;
export const HOURS = 72;
export const STEP_H = 3;
export const QUANT = 0.25;
/** Regular output grid: Galicia and its sea. */
export const GRID = { lon0: -10.2, lat0: 41.5, dlon: 0.03, dlat: 0.03, nx: 140, ny: 90 };

export interface Raw {
  path: string;
  dds: string;
  coords: string;
  u: string;
  v: string;
}

/** Runs listed in the catalog, newest first. */
export function runs(catalogXml: string): string[] {
  const paths = [
    ...catalogXml.matchAll(/urlPath="([^"]*wrf_arw_det_history_d03_\d{8}_\d{4}\.nc4)"/g),
  ].map((m) => m[1] as string);
  if (paths.length === 0) throw new Error('WRF catalog: no runs listed');
  return [...new Set(paths)].sort().reverse();
}

/** Run start (UTC) from a file name. */
export function runTime(path: string): Date {
  const m = /_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.nc4$/.exec(path);
  if (!m) throw new Error(`WRF: no run time in ${path}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi));
}

/** Number of time steps in a dataset, from its DDS. */
export function timeSteps(dds: string): number {
  const m = /Int32 time\[time = (\d+)\];/.exec(dds);
  return m ? Number(m[1]) : 0;
}

/** Values of one variable in an OPeNDAP ASCII response, in order. */
export function asciiValues(text: string, name: string): Float64Array {
  const start = text.indexOf(`${name}.${name}[`);
  if (start < 0) throw new Error(`OPeNDAP: no ${name} in the response`);
  const out: number[] = [];
  for (const line of text.slice(start).split('\n').slice(1)) {
    if (!line.startsWith('[')) {
      if (out.length) break;
      continue;
    }
    const parts = line.split(',');
    for (let i = 1; i < parts.length; i++) out.push(Number(parts[i]));
  }
  return Float64Array.from(out);
}

const ascii = (path: string, query: string) => `${THREDDS}/dodsC/${path}.ascii?${query}`;
const range = (a: number, step: number, b: number) => `%5B${a}:${step}:${b}%5D`;

export function resample(
  lon: Float64Array,
  lat: Float64Array,
  fields: Float64Array[],
  grid = GRID,
): Float64Array[] {
  // Bucket the model points on a 0.1° lattice to find neighbours fast.
  const B = 0.1;
  const buckets = new Map<string, number[]>();
  for (let k = 0; k < lon.length; k++) {
    const key = `${Math.floor((lon[k] as number) / B)},${Math.floor((lat[k] as number) / B)}`;
    const list = buckets.get(key) ?? [];
    list.push(k);
    buckets.set(key, list);
  }
  const kx = Math.cos((43 * Math.PI) / 180);
  const out = fields.map(() => new Float64Array(grid.nx * grid.ny));
  for (let j = 0; j < grid.ny; j++) {
    const y = grid.lat0 + j * grid.dlat;
    for (let i = 0; i < grid.nx; i++) {
      const x = grid.lon0 + i * grid.dlon;
      const bx = Math.floor(x / B);
      const by = Math.floor(y / B);
      const near: Array<[number, number]> = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const k of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
            const d = Math.hypot(((lon[k] as number) - x) * kx, (lat[k] as number) - y);
            near.push([d, k]);
          }
        }
      }
      near.sort((a, b) => a[0] - b[0]);
      const four = near.slice(0, 4);
      if (four.length === 0) continue;
      let wsum = 0;
      const acc = fields.map(() => 0);
      for (const [d, k] of four) {
        const w = 1 / Math.max(d, 1e-6) ** 2;
        wsum += w;
        fields.forEach((f, n) => {
          acc[n] = (acc[n] as number) + w * (f[k] as number);
        });
      }
      fields.forEach((_, n) => {
        (out[n] as Float64Array)[j * grid.nx + i] = (acc[n] as number) / wsum;
      });
    }
  }
  return out;
}

/** u and v of one step as interleaved signed bytes (QUANT m/s), base64. */
export function pack(u: Float64Array, v: Float64Array): string {
  const bytes = new Int8Array(u.length * 2);
  const q = (x: number) => Math.max(-127, Math.min(127, Math.round(x / QUANT)));
  for (let k = 0; k < u.length; k++) {
    bytes[2 * k] = q(u[k] as number);
    bytes[2 * k + 1] = q(v[k] as number);
  }
  return Buffer.from(bytes.buffer).toString('base64');
}

export function build(raw: Raw): Feature {
  const lon = asciiValues(raw.coords, 'lon');
  const lat = asciiValues(raw.coords, 'lat');
  const u = asciiValues(raw.u, 'u');
  const v = asciiValues(raw.v, 'v');
  const cells = lon.length;
  // Steps of STEP_H hours, as many as came (the request asks for HOURS / STEP_H + 1).
  const steps = cells ? u.length / cells : 0;
  if (!Number.isInteger(steps) || steps < 1 || lat.length !== cells || v.length !== u.length) {
    throw new Error(`WRF: sizes do not match (${cells} points, ${u.length} u, ${v.length} v)`);
  }
  const start = runTime(raw.path);
  const times: string[] = [];
  const uv: string[] = [];
  let max = 0;
  for (let s = 0; s < steps; s++) {
    const us = u.subarray(s * cells, (s + 1) * cells);
    const vs = v.subarray(s * cells, (s + 1) * cells);
    const [ru, rv] = resample(lon, lat, [us, vs]) as [Float64Array, Float64Array];
    for (let k = 0; k < ru.length; k++)
      max = Math.max(max, Math.hypot(ru[k] as number, rv[k] as number));
    uv.push(pack(ru, rv));
    times.push(new Date(start.getTime() + s * STEP_H * 3_600_000).toISOString());
  }
  return {
    type: 'Feature',
    id: 'wrf',
    geometry: null,
    properties: {
      execucion: start.toISOString(),
      ficheiro: raw.path,
      horas: times,
      grella: GRID,
      cuantizacion_ms: QUANT,
      vento_max_ms: Math.round(max * 10) / 10,
      uv,
    },
  };
}

const adapter = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const catalog = (await ctx.get(CATALOG, { timeoutMs: 60_000 })).body.toString('utf8');
    const last = Math.floor(HOURS / STEP_H) * STEP_H;
    // The newest run may still be being written: take the first one with every step.
    for (const path of runs(catalog).slice(0, 3)) {
      const dds = (
        await ctx.get(`${THREDDS}/dodsC/${path}.dds`, { timeoutMs: 60_000 })
      ).body.toString('utf8');
      if (timeSteps(dds) <= last) continue;
      const t = range(0, STEP_H, last);
      const all = `${range(0, 1, 125)}${range(0, 1, 116)}`;
      const coords = (
        await ctx.get(ascii(path, `lon${all},lat${all}`), { timeoutMs: 120_000 })
      ).body.toString('utf8');
      const u = (await ctx.get(ascii(path, `u${t}${all}`), { timeoutMs: 180_000 })).body.toString(
        'utf8',
      );
      const v = (await ctx.get(ascii(path, `v${t}${all}`), { timeoutMs: 180_000 })).body.toString(
        'utf8',
      );
      return { path, dds, coords, u, v };
    }
    throw new Error('WRF: no complete run among the three newest');
  },

  normalize(raw) {
    const collection: FeatureCollection = { type: 'FeatureCollection', features: [build(raw)] };
    return { collection, publishedAt: runTime(raw.path).toISOString() };
  },
} satisfies Adapter<Raw>;

export default adapter;
