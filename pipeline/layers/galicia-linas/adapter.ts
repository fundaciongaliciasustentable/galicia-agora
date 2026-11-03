// Galicia en liñas: ridgeline posters in the manner of the Unknown Pleasures cover. Each poster
// is a stack of parallels (ROWS lines from north to south, COLS samples from west to east);
// the line rises with the value under it. The page draws them and offers them for download.
//
// Mostly derived: counts per concello from galicia-deformada, spread inside each concello by the
// population of its places (entidades-poboacion: only the places with a figure; a concello with
// none goes to its centroid), lightning strikes from raios-ano, burnt areas from
// historial-queimados. The relief comes from the IGN terrain model (WCS, 200 m), fetched here.
// The Galicia outline (IGN, kept in pipeline/satelite) masks the relief and the strikes.
//
// Densities are smoothed with a Gaussian of SIGMA_KM and drawn as a square root, so the cities
// do not flatten everything else; the relief is drawn linearly and, outside Galicia, falls to
// zero over SKIRT_KM instead of dropping as a cliff. Twin posters (1950 and 2021, under 20 and
// 65 and over) share one scale. Every profile is quantised to 0–255 and stored as base64.

import { readFile } from 'node:fs/promises';
import type {
  Adapter,
  AdapterContext,
  Feature,
  FeatureCollection,
  PublishedLayer,
} from '../../lib/adapter.ts';
import { OUTLINE_FILE } from '../../satelite/outline.ts';

export const INPUTS = [
  'galicia-deformada',
  'entidades-poboacion',
  'raios-ano',
  'historial-queimados',
] as const;
export type InputId = (typeof INPUTS)[number];

/** IGN terrain model, 200 m, as ESRI ASCII grid over the poster frame. */
export const MDT_URL =
  'https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=Elevacion4258_200&SUBSET=Lat(41.78,43.82)&SUBSET=Long(-9.45,-6.65)&FORMAT=ArcGrid';

export type Raw = Record<InputId, PublishedLayer> & { mdt: string; outline: string };

/** Poster frame (lon/lat degrees), lines and samples per line. */
export const FRAME = { lon0: -9.45, lon1: -6.65, lat0: 41.78, lat1: 43.82 };
export const ROWS = 80;
export const COLS = 560;
export const SIGMA_KM = 2.2;
export const SKIRT_KM = 7;

const RAD = Math.PI / 180;
const KM_PER_DEG = 111.19;
const KX = KM_PER_DEG * Math.cos(42.8 * RAD);
const COL_KM = ((FRAME.lon1 - FRAME.lon0) * KX) / COLS;
const ROW_KM = ((FRAME.lat1 - FRAME.lat0) * KM_PER_DEG) / ROWS;

type Grid = Float64Array;
type Ring = Array<[number, number]>;

export interface Poster {
  id: string;
  scale: 'raiz' | 'lineal';
  /** Twin poster drawn at the same scale, if any. */
  twin: string | null;
  periodo: string;
  total: number | null;
  unidade: string | null;
  fonte: string;
  grid: Grid;
}

const lonOf = (c: number) => FRAME.lon0 + ((c + 0.5) * (FRAME.lon1 - FRAME.lon0)) / COLS;
const latOf = (r: number) => FRAME.lat1 - ((r + 0.5) * (FRAME.lat1 - FRAME.lat0)) / ROWS;

/** Add a Gaussian bump of `weight` at (lon, lat). */
export function splat(grid: Grid, lon: number, lat: number, weight: number, sigma = SIGMA_KM) {
  const cx = ((lon - FRAME.lon0) / (FRAME.lon1 - FRAME.lon0)) * COLS - 0.5;
  const cy = ((FRAME.lat1 - lat) / (FRAME.lat1 - FRAME.lat0)) * ROWS - 0.5;
  const rr = Math.ceil((3 * sigma) / ROW_KM);
  const rc = Math.ceil((3 * sigma) / COL_KM);
  const s2 = 2 * sigma * sigma;
  for (
    let r = Math.max(0, Math.round(cy) - rr);
    r <= Math.min(ROWS - 1, Math.round(cy) + rr);
    r++
  ) {
    const dy = (r - cy) * ROW_KM;
    const wy = Math.exp(-(dy * dy) / s2);
    for (
      let c = Math.max(0, Math.round(cx) - rc);
      c <= Math.min(COLS - 1, Math.round(cx) + rc);
      c++
    ) {
      const dx = (c - cx) * COL_KM;
      grid[r * COLS + c] = (grid[r * COLS + c] as number) + weight * wy * Math.exp(-(dx * dx) / s2);
    }
  }
}

function ringsOf(geometry: Feature['geometry']): Ring[] {
  if (geometry?.type === 'Polygon') return geometry.coordinates as Ring[];
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates as Ring[][]).flat();
  return [];
}

/** Sorted longitudes where the rings cross the parallel `lat` (even-odd). */
export function crossings(rings: Ring[], lat: number): number[] {
  const xs: number[] = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j] as [number, number];
      const [bx, by] = ring[i] as [number, number];
      if (ay > lat !== by > lat) xs.push(ax + ((lat - ay) * (bx - ax)) / (by - ay));
    }
  }
  return xs.sort((a, b) => a - b);
}

const insideAt = (xs: number[], lon: number) => {
  let n = 0;
  for (const x of xs) if (x < lon) n++;
  return n % 2 === 1;
};

/** Even-odd mask of the outline on a fine lattice, for point tests. */
class Mask {
  private readonly step = 0.005;
  private readonly rows: number[][] = [];
  constructor(rings: Ring[]) {
    for (let lat = FRAME.lat0; lat <= FRAME.lat1 + this.step; lat += this.step) {
      this.rows.push(crossings(rings, lat));
    }
  }
  has(lon: number, lat: number): boolean {
    const xs = this.rows[Math.round((lat - FRAME.lat0) / this.step)];
    return xs ? insideAt(xs, lon) : false;
  }
}

/** Area-weighted centroid of the largest polygon of a geometry. */
function centroid(geometry: Feature['geometry']): [number, number] | null {
  const polys =
    geometry?.type === 'Polygon'
      ? [geometry.coordinates as Ring[]]
      : geometry?.type === 'MultiPolygon'
        ? (geometry.coordinates as Ring[][])
        : [];
  let best: [number, number] | null = null;
  let bestA = 0;
  for (const [outer] of polys) {
    if (!outer) continue;
    let a = 0;
    let x = 0;
    let y = 0;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const [x0, y0] = outer[j] as [number, number];
      const [x1, y1] = outer[i] as [number, number];
      const c = x0 * y1 - x1 * y0;
      a += c;
      x += (x0 + x1) * c;
      y += (y0 + y1) * c;
    }
    if (Math.abs(a) > bestA) {
      bestA = Math.abs(a);
      best = [x / (3 * a), y / (3 * a)];
    }
  }
  return best;
}

/** ESRI ASCII grid, possibly wrapped in the WCS multipart response. */
export function parseArcGrid(text: string) {
  const start = text.search(/ncols\s/i);
  if (start < 0) throw new Error('MDT: no ncols header in the WCS response');
  const end = text.indexOf('--wcs', start);
  const lines = text
    .slice(start, end < 0 ? undefined : end)
    .trim()
    .split(/\r?\n/);
  const hdr: Record<string, number> = {};
  let i = 0;
  while (i < lines.length && /^[a-z_]/i.test((lines[i] as string).trim())) {
    const [k, v] = (lines[i] as string).trim().split(/\s+/);
    hdr[(k as string).toLowerCase()] = Number(v);
    i++;
  }
  const nc = hdr.ncols as number;
  const nr = hdr.nrows as number;
  const dx = (hdr.dx ?? hdr.cellsize) as number;
  const dy = (hdr.dy ?? hdr.cellsize) as number;
  const x0 = hdr.xllcorner as number;
  const y0 = hdr.yllcorner as number;
  const nodata = hdr.nodata_value ?? -9999;
  const values = lines.slice(i).join(' ').trim().split(/\s+/).map(Number);
  if (!(nc > 0 && nr > 0 && dx > 0 && dy > 0) || values.length < nc * nr) {
    throw new Error(`MDT: bad grid (${nc} × ${nr}, ${values.length} values)`);
  }
  const z = Float32Array.from(values.slice(0, nc * nr), (v) => (v === nodata || v < 0 ? 0 : v));
  /** Mean elevation in a (2k+1)² window around (lon, lat). */
  const at = (lon: number, lat: number, k = 2) => {
    const c = Math.floor((lon - x0) / dx);
    const r = Math.floor((y0 + nr * dy - lat) / dy);
    let s = 0;
    let n = 0;
    for (let rr = r - k; rr <= r + k; rr++) {
      for (let cc = c - k; cc <= c + k; cc++) {
        if (cc >= 0 && cc < nc && rr >= 0 && rr < nr) {
          s += z[rr * nc + cc] as number;
          n++;
        }
      }
    }
    return n ? s / n : 0;
  };
  return { nc, nr, at };
}

/** Relief lines: the terrain inside Galicia, a fading skirt outside it. */
export function relief(mdt: ReturnType<typeof parseArcGrid>, rings: Ring[]): Grid {
  const grid = new Float64Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r++) {
    const lat = latOf(r);
    const xs = crossings(rings, lat);
    for (let c = 0; c < COLS; c++) {
      const lon = lonOf(c);
      if (insideAt(xs, lon)) {
        grid[r * COLS + c] = mdt.at(lon, lat);
      } else if (xs.length) {
        let b = xs[0] as number;
        for (const x of xs) if (Math.abs(x - lon) < Math.abs(b - lon)) b = x;
        const d = Math.abs(b - lon) * KX;
        if (d < SKIRT_KM) {
          // Height just inside the border, fading out.
          grid[r * COLS + c] =
            mdt.at(b + (b > lon ? 0.004 : -0.004), lat) * (1 - d / SKIRT_KM) ** 2;
        }
      }
    }
  }
  return grid;
}

const COUNTS = [
  'poboacion',
  'poboacion_1950',
  'poboacion_2021',
  'menores_20',
  'maiores_65',
  'pib',
] as const;

export function build(raw: Raw): Poster[] {
  const outline = JSON.parse(raw.outline) as { features: Feature[] };
  const rings = outline.features.flatMap((f) => ringsOf(f.geometry));
  if (rings.length === 0) throw new Error('Galicia outline is empty');
  const mask = new Mask(rings);

  // Places with a population, per concello.
  const places = new Map<string, Array<[number, number, number]>>();
  for (const f of raw['entidades-poboacion'].collection.features) {
    const p = f.properties;
    const pop = Number(p.poboacion);
    if (!(pop > 0) || f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const list = places.get(String(p.codigo_ine)) ?? [];
    list.push([lon, lat, pop]);
    places.set(String(p.codigo_ine), list);
  }

  const concellos = raw['galicia-deformada'].collection.features;
  const first = concellos[0]?.properties;
  if (!first) throw new Error('galicia-deformada is empty');
  const periods = first.periodos as Record<string, string>;
  const posters: Poster[] = [];

  const SOURCES: Record<(typeof COUNTS)[number], string> = {
    poboacion: 'IGE (padrón)',
    poboacion_1950: 'INE (censo de 1950)',
    poboacion_2021: 'INE (censo de 2021)',
    menores_20: 'IGE (padrón e indicadores de poboación)',
    maiores_65: 'IGE (padrón e indicadores de poboación)',
    pib: 'IGE (PIB municipal)',
  };
  for (const v of COUNTS) {
    const grid = new Float64Array(ROWS * COLS);
    let total = 0;
    for (const f of concellos) {
      const value = Number(f.properties[v] ?? 0);
      if (!(value > 0)) continue;
      total += value;
      const list = places.get(String(f.properties.codigo_ine));
      const sum = list?.reduce((s, [, , w]) => s + w, 0) ?? 0;
      if (list && sum > 0) {
        for (const [lon, lat, w] of list) splat(grid, lon, lat, (value * w) / sum);
      } else {
        const c = centroid(f.geometry);
        if (c) splat(grid, c[0], c[1], value);
      }
    }
    posters.push({
      id: v,
      scale: 'raiz',
      twin:
        v === 'poboacion_1950'
          ? 'poboacion_2021'
          : v === 'poboacion_2021'
            ? 'poboacion_1950'
            : v === 'menores_20'
              ? 'maiores_65'
              : v === 'maiores_65'
                ? 'menores_20'
                : null,
      periodo: periods[v] ?? '',
      total,
      unidade: v === 'pib' ? 'miles de euros' : 'persoas',
      fonte: SOURCES[v],
      grid,
    });
  }

  // Lightning strikes over Galicia, last twelve months.
  {
    const grid = new Float64Array(ROWS * COLS);
    let total = 0;
    let from = '';
    let to = '';
    for (const f of raw['raios-ano'].collection.features) {
      const p = f.properties;
      from ||= String(p.periodo_inicio ?? '');
      to ||= String(p.periodo_fin ?? '');
      const lons = p.lon as number[];
      const lats = p.lat as number[];
      lons.forEach((lon, i) => {
        const lat = lats[i] as number;
        if (!mask.has(lon, lat)) return;
        total++;
        splat(grid, lon, lat, 1, 3);
      });
    }
    posters.push({
      id: 'raios',
      scale: 'raiz',
      twin: null,
      periodo: from && to ? `${from}/${to}` : '',
      total,
      unidade: 'raios',
      fonte: 'MeteoGalicia',
      grid,
    });
  }

  // Burnt area: polygons sampled on a 0.4 km lattice, each sample weighted by its area.
  {
    const grid = new Float64Array(ROWS * COLS);
    let total = 0;
    const years = new Set<string>();
    const step = 0.4 / KM_PER_DEG;
    for (const f of raw['historial-queimados'].collection.features) {
      const rs = ringsOf(f.geometry);
      if (rs.length === 0) continue;
      years.add(String(f.properties.ano));
      total += Number(f.properties.area_ha ?? 0);
      let lat0 = Infinity;
      let lat1 = -Infinity;
      for (const r of rs)
        for (const [, y] of r) [lat0, lat1] = [Math.min(lat0, y), Math.max(lat1, y)];
      for (let lat = lat0 + step / 2; lat < lat1; lat += step) {
        const xs = crossings(rs, lat);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const dlon = step * (KM_PER_DEG / KX);
          for (let lon = (xs[k] as number) + dlon / 2; lon < (xs[k + 1] as number); lon += dlon) {
            splat(grid, lon, lat, 0.16, 2);
          }
        }
      }
    }
    const ys = [...years].sort();
    posters.push({
      id: 'lume',
      scale: 'raiz',
      twin: null,
      periodo: ys.length ? `${ys[0]}–${ys[ys.length - 1]}` : '',
      total: Math.round(total),
      unidade: 'hectáreas',
      fonte: 'Copernicus EFFIS (JRC)',
      grid,
    });
  }

  posters.unshift({
    id: 'relevo',
    scale: 'lineal',
    twin: null,
    periodo: '',
    total: null,
    unidade: null,
    fonte: 'IGN (MDT de 200 m, PNOA-LiDAR)',
    grid: relief(parseArcGrid(raw.mdt), rings),
  });
  return posters;
}

/** 0–255 heights as base64: square root for densities, linear for the relief. */
export function encode(posters: Poster[]): Map<string, string> {
  const shape = (p: Poster) => (p.scale === 'raiz' ? p.grid.map(Math.sqrt) : p.grid);
  const shaped = new Map(posters.map((p) => [p.id, shape(p)]));
  const max = (g: Float64Array) => g.reduce((m, x) => Math.max(m, x), 0);
  const out = new Map<string, string>();
  for (const p of posters) {
    const g = shaped.get(p.id) as Float64Array;
    const twin = p.twin ? shaped.get(p.twin) : undefined;
    const top = Math.max(max(g), twin ? max(twin) : 0) || 1;
    const bytes = Uint8Array.from(g, (x) => Math.round((255 * x) / top));
    out.set(p.id, Buffer.from(bytes).toString('base64'));
  }
  return out;
}

function inputsTime(raw: Raw): string | null {
  let max: number | null = null;
  for (const input of INPUTS) {
    const m = raw[input].meta;
    const t = Date.parse(m.published_at ?? m.last_success_at ?? '');
    if (Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  return max === null ? null : new Date(max).toISOString();
}

const adapter = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('galicia-linas needs ctx.readLayer (derived layer)');
    const raw = {} as Raw;
    for (const id of INPUTS) raw[id] = await ctx.readLayer(id);
    // ~13 MB of text.
    const res = await ctx.get(MDT_URL, { timeoutMs: 300_000 });
    raw.mdt = new TextDecoder('latin1').decode(res.body);
    raw.outline = await readFile(OUTLINE_FILE, 'utf8');
    return raw;
  },

  normalize(raw) {
    const posters = build(raw);
    const encoded = encode(posters);
    const features: Feature[] = posters.map((p, i) => ({
      type: 'Feature',
      id: p.id,
      geometry: null,
      properties: {
        id: p.id,
        orde: i,
        filas: ROWS,
        columnas: COLS,
        escala: p.scale,
        parella: p.twin,
        periodo: p.periodo,
        total: p.total,
        unidade: p.unidade,
        fonte: p.fonte,
        perfis: encoded.get(p.id),
      },
    }));
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    return { collection, publishedAt: inputsTime(raw) };
  },
} satisfies Adapter<Raw>;

export default adapter;
