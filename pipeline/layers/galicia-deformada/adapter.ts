// Galicia deformada: the concellos with a handful of counts each (people, GDP, births, deaths,
// young and old, two censuses), for the cartograms of /deformada/. The browser deforms the
// shapes so each concello's area matches one count (Dougenik, Chrisman and Niemeyer, 1985);
// this layer gives it light shapes whose shared borders stay shared.
//
// Mostly derived: shapes from concellos-parroquias, births and deaths from nacementos-mortes,
// the 1950 and 2021 censuses from poboacion-seculo (all read with ctx.readLayer). Three small
// IGE requests add the 2025 population, the age shares and the municipal GDP.
//
// Simplification keeps the topology: every point on a border between concellos, or where a
// border meets the coast, is a junction; the stretches between junctions are simplified once
// (Douglas–Peucker) and reused by both sides, so neighbours still share every vertex and the
// cartogram moves them together. Islets under MIN_PART_KM2 are dropped.
//
// The cartograms themselves (diffusion.ts) are computed here, not in the browser: each
// feature carries `formas`, its rings in every variable (and in its real shape, `superficie`)
// on a common grid, so the page only interpolates between two of them.

import type {
  Adapter,
  AdapterContext,
  Feature,
  FeatureCollection,
  PublishedLayer,
} from '../../lib/adapter.ts';
import { round } from '../../lib/adapter.ts';
import {
  BASE,
  EXTINCT,
  GALICIA,
  parseIgeCsv,
  type Row,
  series,
} from '../indicadores-concellos/adapter.ts';
import { areaError, diffuse, topology } from './diffusion.ts';

export { BASE };

export const INPUTS = ['concellos-parroquias', 'nacementos-mortes', 'poboacion-seculo'] as const;
export type InputId = (typeof INPUTS)[number];

/** One filtered request per IGE table. */
export const REQUESTS = {
  // Municipal register, latest year.
  t1558: '1558/T%5B1:a%5D',
  // Population indicators: 9 % aged 20–64, 10 % aged 65+; sex 2 = Total.
  t723: '723/T%5B1:a%5D,1:9:10,2:2',
  // Municipal GDP, unit 1 = thousands of euros.
  t9958: '9958/T%5B1:a%5D,1:1',
} as const;
export type TableKey = keyof typeof REQUESTS;

export type Raw = Record<InputId, PublishedLayer> & Record<TableKey, string>;

/** Counts carried by every concello (the cartogram variables). */
export const VARIABLES = [
  'poboacion',
  'pib',
  'nacementos',
  'defuncions',
  'menores_20',
  'maiores_65',
  'poboacion_1950',
  'poboacion_2021',
] as const;
export type Variable = (typeof VARIABLES)[number];

export const PAUSE_MS = 1000;
/** Cartogram grid side (cells); the real map fills its middle half. */
export const GRID = 256;
/** Output coordinates: quarter cells, as integers. */
export const QUANT = 4;
/** Diffusion passes stop when the misplaced area falls under this share, or after MAX_PASSES. */
export const TARGET_ERROR = 0.015;
export const MAX_PASSES = 6;
/** Missing or zero values count as this share of the mean, so a concello never vanishes. */
export const FLOOR_SHARE = 0.002;
/** Douglas–Peucker tolerance in km. */
export const TOLERANCE_KM = 0.12;
/** Islets smaller than this are dropped (never a concello's largest part). */
export const MIN_PART_KM2 = 0.05;

const RAD = Math.PI / 180;
const KM_PER_DEG = 111.19;
const LAT0 = 42.75;
const KX = KM_PER_DEG * Math.cos(LAT0 * RAD);

type Pt = [number, number];
type Ring = Pt[];
type Polygon = Ring[];

const keyOf = (p: Pt) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
const ptOf = (k: string): Pt => k.split(',').map(Number) as Pt;
const cmpKey = (a: string, b: string) => {
  const [ax, ay] = ptOf(a);
  const [bx, by] = ptOf(b);
  return ax - bx || ay - by;
};

function polygonsOf(geometry: Feature['geometry']): Polygon[] {
  if (geometry?.type === 'Polygon') return [geometry.coordinates as Polygon];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates as Polygon[];
  return [];
}

/** Planar area of a ring in km² (unsigned). */
export function ringAreaKm2(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j] as Pt;
    const [x1, y1] = ring[i] as Pt;
    a += x0 * KX * y1 * KM_PER_DEG - x1 * KX * y0 * KM_PER_DEG;
  }
  return Math.abs(a / 2);
}

function polygonAreaKm2(poly: Polygon): number {
  const [outer, ...holes] = poly.map(ringAreaKm2);
  return (outer ?? 0) - holes.reduce((s, h) => s + h, 0);
}

/** Douglas–Peucker over projected points; keeps both ends. */
function douglasPeucker(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const xy = pts.map(([x, y]) => [x * KX, y * KM_PER_DEG] as Pt);
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = xy[a] as Pt;
    const [bx, by] = xy[b] as Pt;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i] as Pt;
      let d: number;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      }
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Simplify the polygons of many units together so shared borders stay identical.
 * Input and output rings are closed (first point repeated at the end).
 */
export function simplifyShared(
  units: Map<string, Polygon[]>,
  tol = TOLERANCE_KM,
  minPart = MIN_PART_KM2,
): Map<string, Polygon[]> {
  // Drop islets (and holes of the same size, which are the islets of a neighbour).
  const kept = new Map<string, Array<Array<string[]>>>();
  for (const [code, polys] of units) {
    const areas = polys.map(polygonAreaKm2);
    const biggest = areas.indexOf(Math.max(...areas));
    const out: Array<string[][]> = [];
    polys.forEach((poly, i) => {
      if (i !== biggest && (areas[i] as number) < minPart) return;
      const rings = poly
        .filter((r, j) => j === 0 || ringAreaKm2(r) >= minPart)
        .map((r) => {
          const keys = r.map(keyOf);
          // Open ring without repeated consecutive points.
          const open = keys.filter((k, n) => n === 0 || k !== keys[n - 1]);
          if (open.length > 1 && open[0] === open[open.length - 1]) open.pop();
          return open;
        })
        .filter((r) => r.length >= 3);
      if (rings.length && (rings[0] as string[]).length >= 3) out.push(rings);
    });
    kept.set(code, out);
  }

  // Owners of every point and every edge.
  const pointOwners = new Map<string, Set<string>>();
  const edgeOwners = new Map<string, Set<string>>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const add = (m: Map<string, Set<string>>, k: string, code: string) => {
    const s = m.get(k) ?? new Set<string>();
    s.add(code);
    m.set(k, s);
  };
  for (const [code, polys] of kept) {
    for (const ring of polys.flat()) {
      ring.forEach((k, i) => {
        add(pointOwners, k, code);
        add(edgeOwners, edgeKey(k, ring[(i + 1) % ring.length] as string), code);
      });
    }
  }
  const ownersOf = (m: Map<string, Set<string>>, k: string) => [...(m.get(k) ?? [])].sort().join();

  const memo = new Map<string, string[]>();
  const simplifyChain = (chain: string[]): string[] => {
    const reversed = cmpKey(chain[0] as string, chain[chain.length - 1] as string) > 0;
    const canon = reversed ? [...chain].reverse() : chain;
    const id = canon.join(';');
    let done = memo.get(id);
    if (!done) {
      done = douglasPeucker(canon.map(ptOf), tol).map(keyOf);
      memo.set(id, done);
    }
    return reversed ? [...done].reverse() : done;
  };

  const result = new Map<string, Polygon[]>();
  for (const [code, polys] of kept) {
    const outPolys: Polygon[] = [];
    for (const poly of polys) {
      const outRings: Ring[] = [];
      for (const ring of poly) {
        const n = ring.length;
        const fixed: number[] = [];
        for (let i = 0; i < n; i++) {
          const k = ring[i] as string;
          const prev = ring[(i - 1 + n) % n] as string;
          const next = ring[(i + 1) % n] as string;
          if (
            (pointOwners.get(k)?.size ?? 0) >= 3 ||
            ownersOf(edgeOwners, edgeKey(prev, k)) !== ownersOf(edgeOwners, edgeKey(k, next))
          ) {
            fixed.push(i);
          }
        }
        // Rings with fewer than two junctions: the lowest and highest points, which both
        // sides of a fully shared ring pick alike.
        if (fixed.length < 2) {
          const order = ring
            .map((_, i) => i)
            .sort((a, b) => cmpKey(ring[a] as string, ring[b] as string));
          for (const i of [order[0] as number, order[n - 1] as number])
            if (!fixed.includes(i)) fixed.push(i);
          fixed.sort((a, b) => a - b);
        }
        const out: string[] = [];
        for (let f = 0; f < fixed.length; f++) {
          const a = fixed[f] as number;
          const b = fixed[(f + 1) % fixed.length] as number;
          const chain: string[] = [];
          for (let i = a; ; i = (i + 1) % n) {
            chain.push(ring[i] as string);
            if (i === b && chain.length > 1) break;
          }
          out.push(...simplifyChain(chain).slice(0, -1));
        }
        const pts = (out.length >= 3 ? out : ring).map(ptOf);
        pts.push(pts[0] as Pt);
        outRings.push(pts);
      }
      outPolys.push(outRings);
    }
    result.set(code, outPolys);
  }
  return result;
}

interface Census {
  censos: number[];
  poboacion: Array<number | null>;
}
interface Vital {
  periodos: string[];
  provisional: string | null;
  nacementos: Array<number | null>;
  defuncions: Array<number | null>;
}

/** Value of a column of the IGE indicator table 723 for one place. */
function indicator(rows: Row[], label: string, table: string) {
  const sel = rows.filter((r) => Object.values(r.dims).some((d) => d.startsWith(label)));
  if (sel.length === 0) throw new Error(`${table}: no rows for "${label}"`);
  return series(sel, undefined, table);
}

export function build(raw: Raw, grid = GRID): Feature[] {
  const pop = series(parseIgeCsv(raw.t1558, 't1558'), undefined, 't1558');
  const t723 = parseIgeCsv(raw.t723, 't723');
  const adults = indicator(t723, 'Porcentaxe de poboación entre 20 e 64', 't723');
  const old = indicator(t723, 'Porcentaxe de poboación de 65', 't723');
  const pib = series(parseIgeCsv(raw.t9958, 't9958'), undefined, 't9958');
  if (adults.periodo !== pop.periodo || old.periodo !== pop.periodo) {
    throw new Error(`t723 ${old.periodo} and t1558 ${pop.periodo} are not the same year`);
  }

  const vital = new Map<string, Vital>();
  for (const f of raw['nacementos-mortes'].collection.features) {
    vital.set(String(f.properties.codigo_ine), f.properties as unknown as Vital);
  }
  const anyVital = vital.values().next().value as Vital | undefined;
  if (!anyVital) throw new Error('nacementos-mortes is empty');
  // The latest year that is not provisional.
  let vi = anyVital.periodos.length - 1;
  if (anyVital.periodos[vi] === anyVital.provisional) vi--;
  const vitalYear = anyVital.periodos[vi] as string;

  const census = new Map<string, Census>();
  for (const f of raw['poboacion-seculo'].collection.features) {
    census.set(String(f.properties.codigo_ine), f.properties as unknown as Census);
  }
  const anyCensus = census.values().next().value as Census | undefined;
  const i1950 = anyCensus?.censos.indexOf(1950) ?? -1;
  const i2021 = anyCensus?.censos.indexOf(2021) ?? -1;
  if (i1950 < 0 || i2021 < 0) throw new Error('poboacion-seculo lacks the 1950 or 2021 census');

  const shapes = new Map<string, Polygon[]>();
  const info = new Map<string, { nome: string; provincia: string }>();
  for (const f of raw['concellos-parroquias'].collection.features) {
    const p = f.properties;
    if (p.nivel !== 'concello') continue;
    const code = String(p.codigo_ine);
    shapes.set(code, [...(shapes.get(code) ?? []), ...polygonsOf(f.geometry)]);
    info.set(code, { nome: String(p.nome), provincia: String(p.provincia) });
  }
  const area = new Map(
    [...shapes].map(([c, ps]) => [c, ps.reduce((s, p) => s + polygonAreaKm2(p), 0)]),
  );
  const simple = simplifyShared(shapes);

  const share = (cod: string, s: { values: Map<string, number | null> }) =>
    s.values.get(cod) ?? null;
  const features: Feature[] = [];
  for (const [code, polys] of [...simple].sort(([a], [b]) => a.localeCompare(b))) {
    if (EXTINCT.has(code) || code === GALICIA) continue;
    const p = pop.values.get(code) ?? null;
    const a = share(code, adults);
    const o = share(code, old);
    const v = vital.get(code);
    const c = census.get(code);
    const properties: Record<string, unknown> = {
      codigo_ine: code,
      ...info.get(code),
      superficie_km2: round(area.get(code) ?? 0, 2),
      poboacion: p,
      pib: share(code, pib),
      nacementos: v?.nacementos[vi] ?? null,
      defuncions: v?.defuncions[vi] ?? null,
      // Own calculation: register population times the IGE shares.
      menores_20:
        p !== null && a !== null && o !== null ? Math.round((p * (100 - a - o)) / 100) : null,
      maiores_65: p !== null && o !== null ? Math.round((p * o) / 100) : null,
      poboacion_1950: c?.poboacion[i1950] ?? null,
      poboacion_2021: c?.poboacion[i2021] ?? null,
      periodos: {
        poboacion: pop.periodo,
        pib: pib.periodo,
        nacementos: vitalYear,
        defuncions: vitalYear,
        menores_20: pop.periodo,
        maiores_65: pop.periodo,
        poboacion_1950: '1950',
        poboacion_2021: '2021',
      },
    };
    features.push({
      type: 'Feature',
      id: code,
      geometry:
        polys.length === 1
          ? { type: 'Polygon', coordinates: polys[0] }
          : { type: 'MultiPolygon', coordinates: polys },
      properties,
    });
  }
  addShapes(features, grid);
  return features;
}

/**
 * Ring positions as integers: first vertex, then differences to the previous one
 * ([x0, y0, dx1, dy1, …], open ring), in 1/QUANT cells.
 */
function encode(idx: Uint32Array, pos: Float64Array): number[] {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  for (const p of idx) {
    const x = Math.round((pos[2 * p] as number) * QUANT);
    const y = Math.round((pos[2 * p + 1] as number) * QUANT);
    out.push(x - px, y - py);
    px = x;
    py = y;
  }
  return out;
}

/** Cartogram of every variable, written to each feature as `formas` (and its error). */
export function addShapes(features: Feature[], grid = GRID): Record<string, number> {
  const shape = topology(
    features.map((f) => f.geometry),
    grid,
  );
  const shapes: Record<string, Float64Array> = { superficie: shape.base };
  const errors: Record<string, number> = {};
  for (const v of VARIABLES) {
    const raw = features.map((f) => f.properties[v] as number | null);
    const mean = raw.reduce<number>((s, x) => s + Math.max(0, x ?? 0), 0) / raw.length;
    const values = Float64Array.from(raw, (x) => Math.max(x ?? 0, mean * FLOOR_SHARE));
    const pos = Float64Array.from(shape.base);
    let error = areaError(shape, pos, values);
    for (let pass = 0; pass < MAX_PASSES && error > TARGET_ERROR; pass++) {
      diffuse(shape, pos, values, grid);
      error = areaError(shape, pos, values);
    }
    shapes[v] = pos;
    errors[v] = round(error, 4);
  }
  const ringsOf = new Map<number, Uint32Array[]>();
  for (const r of shape.rings) ringsOf.set(r.unit, [...(ringsOf.get(r.unit) ?? []), r.idx]);
  features.forEach((f, unit) => {
    const formas: Record<string, number[][]> = {};
    for (const [name, pos] of Object.entries(shapes)) {
      formas[name] = (ringsOf.get(unit) ?? []).map((idx) => encode(idx, pos));
    }
    f.properties.formas = formas;
    f.properties.erro_area = errors;
  });
  return errors;
}

/** Per input: published_at if given, else the last good download; the latest wins. */
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
    if (!ctx.readLayer) throw new Error('galicia-deformada needs ctx.readLayer (derived layer)');
    const raw = {} as Raw;
    for (const id of INPUTS) raw[id] = await ctx.readLayer(id);
    const pause = Number(ctx.env.IGE_PAUSE_MS ?? PAUSE_MS);
    const decoder = new TextDecoder('latin1');
    let first = true;
    for (const [key, query] of Object.entries(REQUESTS) as Array<[TableKey, string]>) {
      if (!first && pause > 0) await new Promise((r) => setTimeout(r, pause));
      first = false;
      const res = await ctx.get(BASE + query, { timeoutMs: 60_000 });
      raw[key] = decoder.decode(res.body);
    }
    return raw;
  },

  normalize(raw, ctx) {
    // Tests use a coarser grid (CARTOGRAM_GRID) to run fast.
    const grid = Number(ctx.env.CARTOGRAM_GRID ?? GRID);
    const collection: FeatureCollection = { type: 'FeatureCollection', features: build(raw, grid) };
    return { collection, publishedAt: inputsTime(raw) };
  },
} satisfies Adapter<Raw>;

export default adapter;
