// Concello profile: one row per concello with a representative point (for the dot views of
// the /retrato page) and the median straight-line distance from its places to each service.
// Derived layer: no network. It reads the last good published output of concellos-parroquias
// and distancia-servizos through ctx.readLayer, which throws when an input is missing or
// stale, so publish keeps the previous good file.
//
// Distances are medians over the places (entities) of the concello, NOT weighted by
// population: the population field of entidades-poboacion is incomplete (see its layer.yaml),
// so a weighted figure would be wrong. Galicia's value is the median over all places.
//
// The representative point is the area centroid of the concello's largest polygon, or, when
// that centroid falls outside it (concave shapes, rías), the inside grid point nearest to it.

import type {
  Adapter,
  AdapterContext,
  Feature,
  FeatureCollection,
  PublishedLayer,
} from '../../lib/adapter.ts';
import { compareWithGalicia, round } from '../../lib/adapter.ts';

export const INPUTS = ['concellos-parroquias', 'distancia-servizos'] as const;
export type InputId = (typeof INPUTS)[number];
export type Raw = Record<InputId, PublishedLayer>;

/** Services from distancia-servizos shown as profile indicators. */
export const SERVICES = ['centro_saude', 'hospital', 'farmacia', 'escola', 'instituto'] as const;

type Ring = Array<[number, number]>;
type Polygon = Ring[];

const RAD = Math.PI / 180;
const KM_PER_DEG = 111.19;

/** Polygons of a Polygon or MultiPolygon geometry. */
export function polygons(geometry: Feature['geometry']): Polygon[] {
  if (geometry?.type === 'Polygon') return [geometry.coordinates as Polygon];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates as Polygon[];
  return [];
}

/**
 * Signed planar area of a ring in km² (equirectangular at lat0) and its centroid in lon/lat
 * degrees.
 */
function ringStats(ring: Ring, lat0: number): { area: number; cx: number; cy: number } {
  const kx = KM_PER_DEG * Math.cos(lat0 * RAD);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j] as [number, number];
    const [x1, y1] = ring[i] as [number, number];
    const cross = x0 * kx * (y1 * KM_PER_DEG) - x1 * kx * (y0 * KM_PER_DEG);
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a /= 2;
  return a === 0 ? { area: 0, cx: 0, cy: 0 } : { area: a, cx: cx / (6 * a), cy: cy / (6 * a) };
}

/** Area of a polygon (outer ring minus holes) in km². */
export function polygonAreaKm2(poly: Polygon): number {
  const lat0 = poly[0]?.[0]?.[1] ?? 43;
  const [outer, ...holes] = poly.map((r) => Math.abs(ringStats(r, lat0).area));
  return (outer ?? 0) - holes.reduce((s, h) => s + h, 0);
}

export function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPolygon(lon: number, lat: number, poly: Polygon): boolean {
  const [outer, ...holes] = poly;
  return !!outer && inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h));
}

/** Representative point inside the largest polygon (see the header comment). */
export function representativePoint(geometry: Feature['geometry']): [number, number] | null {
  const polys = polygons(geometry);
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const p of polys) {
    const a = polygonAreaKm2(p);
    if (a > bestArea) {
      bestArea = a;
      best = p;
    }
  }
  const outer = best?.[0];
  if (!best || !outer || outer.length < 4) return null;
  const lat0 = outer[0]?.[1] ?? 43;
  const kx = KM_PER_DEG * Math.cos(lat0 * RAD);
  // ringStats weights by km² but sums plain lon/lat, so the centroid comes out in degrees.
  const s = ringStats(outer, lat0);
  const c: [number, number] = [s.cx, s.cy];
  if (inPolygon(c[0], c[1], best)) return c;
  // Fallback: a 40 × 40 grid over the bounding box; nearest inside point to the centroid.
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let pick: [number, number] | null = null;
  let pickD = Number.POSITIVE_INFINITY;
  const n = 40;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / (n + 1);
      const y = y0 + ((y1 - y0) * (j + 0.5)) / (n + 1);
      if (!inPolygon(x, y, best)) continue;
      const d = ((x - c[0]) * kx) ** 2 + ((y - c[1]) * KM_PER_DEG) ** 2;
      if (d < pickD) {
        pickD = d;
        pick = [x, y];
      }
    }
  }
  return pick;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** Per input: published_at if the source gives one, else the last good download; the latest wins. */
export function inputsTime(raw: Raw): string | null {
  let max: number | null = null;
  for (const input of INPUTS) {
    const m = raw[input].meta;
    const t = Date.parse(m.published_at ?? m.last_success_at ?? '');
    if (Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  return max === null ? null : new Date(max).toISOString();
}

/** One row per concello (no completeness check; normalize adds it). */
export function profile(raw: Raw): Feature[] {
  // Distances of every place, by concello and for all of Galicia.
  const byConcello = new Map<string, Record<string, number[]>>();
  const galicia = Object.fromEntries(SERVICES.map((s) => [s, [] as number[]]));
  for (const f of raw['distancia-servizos'].collection.features) {
    const cod = f.properties.codigo_ine;
    if (typeof cod !== 'string') continue;
    let acc = byConcello.get(cod);
    if (!acc) {
      acc = Object.fromEntries(SERVICES.map((s) => [s, [] as number[]]));
      byConcello.set(cod, acc);
    }
    for (const s of SERVICES) {
      const km = f.properties[`dist_${s}`];
      if (typeof km !== 'number') continue;
      acc[s]?.push(km);
      galicia[s]?.push(km);
    }
  }
  const galiciaMedian = Object.fromEntries(
    SERVICES.map((s) => [s, median(galicia[s] ?? [])]),
  ) as Record<string, number | null>;

  const publishedAt = inputsTime(raw);
  const periodo = publishedAt ? publishedAt.slice(0, 10) : '';
  const features: Feature[] = [];
  for (const f of raw['concellos-parroquias'].collection.features) {
    const p = f.properties;
    if (p.nivel !== 'concello' || typeof p.codigo_ine !== 'string') continue;
    const point = representativePoint(f.geometry);
    if (!point) throw new Error(`no representative point for concello ${p.codigo_ine}`);
    const area = polygons(f.geometry).reduce((s, poly) => s + polygonAreaKm2(poly), 0);
    const dists = byConcello.get(p.codigo_ine);
    const props: Record<string, unknown> = {
      codigo_ine: p.codigo_ine,
      nome: p.nome,
      provincia: p.provincia ?? null,
      lon: round(point[0], 4),
      lat: round(point[1], 4),
      superficie_km2: round(area, 1),
      lugares: dists?.centro_saude?.length ?? 0,
    };
    for (const s of SERVICES) {
      const m = median(dists?.[s] ?? []);
      const id = `dist_${s}`;
      const value = m === null ? null : round(m, 1);
      const gal = galiciaMedian[s] === null ? null : round(galiciaMedian[s] as number, 1);
      props[id] = value;
      props[`${id}_galicia`] = gal;
      props[`${id}_rel`] = compareWithGalicia(value, gal, 'points');
      props[`${id}_periodo`] = periodo;
    }
    features.push({ type: 'Feature', geometry: null, properties: props });
  }
  return features.sort((a, b) =>
    String(a.properties.codigo_ine).localeCompare(String(b.properties.codigo_ine)),
  );
}

/** Fewer concellos than this means a truncated input, not a real change (Galicia has 313). */
export const MIN_CONCELLOS = 300;

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('perfil-concellos needs ctx.readLayer (derived layer)');
    const raw = {} as Raw;
    for (const id of INPUTS) raw[id] = await ctx.readLayer(id);
    return raw;
  },

  normalize(raw) {
    const features = profile(raw);
    if (features.length < MIN_CONCELLOS) throw new Error(`only ${features.length} concellos`);
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    return { collection, publishedAt: inputsTime(raw) };
  },
};

export default adapter;
