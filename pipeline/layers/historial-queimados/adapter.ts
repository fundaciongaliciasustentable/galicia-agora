// Copernicus EFFIS burnt areas (MODIS) for each completed year since 2016, in
// the four Galician provinces. One GetCapabilities per run lists the yearly
// typeNames (ms:modis.ba.poly.YYYY); then one GetFeature per year with the
// Galicia bbox. The bbox also returns Portugal, Asturias and Castilla y León,
// so features are kept only when PROVINCE is Galician.
// Province filter, time parsing and ring cleaning follow perimetros-queimados
// (copied, not imported, so each layer can change on its own), with a coarser
// geometry: 4 decimals (~10 m), near-duplicate and collinear vertices dropped.

import { type Adapter, type AdapterContext, type Feature, round } from '../../lib/adapter.ts';

const BASE = 'https://maps.effis.emergency.copernicus.eu/effis';
export const CAPABILITIES_URL = `${BASE}?service=WFS&request=GetCapabilities&version=2.0.0`;
export const FIRST_YEAR = 2016;
/** Pause between yearly requests (ms); EFFIS labels the WFS as a test service. */
const PAUSE_MS = 2000;

// WFS 2.0 with urn:ogc:def:crs:EPSG::4326 uses lat,lon axis order in the bbox;
// checked against real calls (longitudes in the responses stay within -9.35…-6.6).
export function yearUrl(year: number): string {
  return (
    `${BASE}?service=WFS&request=GetFeature&version=2.0.0` +
    `&typeNames=ms:modis.ba.poly.${year}&outputFormat=geojson` +
    '&bbox=41.8,-9.35,43.8,-6.7,urn:ogc:def:crs:EPSG::4326'
  );
}

/** Yearly typeNames advertised in GetCapabilities, limited to FIRST_YEAR..lastYear. */
export function yearsFromCapabilities(xml: string, lastYear: number): number[] {
  if (!/<(?:wfs:)?WFS_Capabilities\b/.test(xml)) {
    throw new Error('EFFIS: response is not a WFS GetCapabilities document');
  }
  const years = new Set<number>();
  for (const m of xml.matchAll(
    /<(?:wfs:)?Name>\s*ms:modis\.ba\.poly\.(\d{4})\s*<\/(?:wfs:)?Name>/g,
  )) {
    const y = Number(m[1]);
    if (y >= FIRST_YEAR && y <= lastYear) years.add(y);
  }
  return [...years].sort((a, b) => a - b);
}

// Spellings seen in the EFFIS data are the first of each list; the rest are
// defensive aliases in case the source switches to Spanish exonyms.
const PROVINCES: Record<string, string> = {
  'a coruña': 'A Coruña',
  'la coruña': 'A Coruña',
  'coruña, a': 'A Coruña',
  lugo: 'Lugo',
  ourense: 'Ourense',
  orense: 'Ourense',
  pontevedra: 'Pontevedra',
};

export function galicianProvince(province: unknown, country: unknown): string | null {
  if (country !== undefined && country !== 'ES') return null;
  if (typeof province !== 'string') return null;
  return PROVINCES[province.trim().toLowerCase()] ?? null;
}

/**
 * EFFIS timestamps ("2026-01-07 16:09:52.041906") carry no offset; they are
 * treated as UTC (not documented by the source).
 */
export function effisTime(value: unknown): string {
  const m =
    typeof value === 'string'
      ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?$/.exec(value.trim())
      : null;
  const ms = m ? Date.parse(`${m[1]}T${m[2]}${(m[3] ?? '').slice(0, 4)}Z`) : Number.NaN;
  if (Number.isNaN(ms)) throw new Error(`Unrecognised EFFIS time: ${String(value)}`);
  return new Date(ms).toISOString();
}

type Position = [number, number];
type Ring = Position[];

const DECIMALS = 4;
/** One step of the 4-decimal grid (~8–11 m in Galicia). */
const STEP = 10 ** -DECIMALS;

function near(a: Position, b: Position): boolean {
  return Math.abs(a[0] - b[0]) <= STEP * 1.01 && Math.abs(a[1] - b[1]) <= STEP * 1.01;
}

function collinear(a: Position, b: Position, c: Position): boolean {
  // Exact on the rounded grid (integers after scaling).
  const k = 10 ** DECIMALS;
  const cross =
    Math.round((b[0] - a[0]) * k) * Math.round((c[1] - a[1]) * k) -
    Math.round((b[1] - a[1]) * k) * Math.round((c[0] - a[0]) * k);
  return cross === 0;
}

/**
 * Round to 4 decimals, drop vertices within one grid step of the previous kept
 * vertex and vertices on a straight line, keep the ring closed; null if degenerate.
 */
export function simplifyRing(ring: unknown): Ring | null {
  if (!Array.isArray(ring)) throw new Error('EFFIS: ring is not an array');
  const pts: Ring = [];
  for (const p of ring) {
    if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') {
      throw new Error('EFFIS: bad coordinate');
    }
    const q: Position = [round(p[0], DECIMALS), round(p[1], DECIMALS)];
    const prev = pts.at(-1);
    if (!prev || !near(prev, q)) pts.push(q);
  }
  // Open the ring (the closing vertex is re-added at the end).
  while (pts.length > 1 && near(pts[0] as Position, pts.at(-1) as Position)) pts.pop();
  const out: Ring = [];
  for (const q of pts) {
    while (out.length >= 2 && collinear(out.at(-2) as Position, out.at(-1) as Position, q)) {
      out.pop();
    }
    out.push(q);
  }
  // Wrap-around: the last or the first vertex may sit on a straight line across the seam.
  let changed = true;
  while (changed && out.length >= 3) {
    changed = false;
    if (collinear(out.at(-2) as Position, out.at(-1) as Position, out[0] as Position)) {
      out.pop();
      changed = true;
    } else if (collinear(out.at(-1) as Position, out[0] as Position, out[1] as Position)) {
      out.shift();
      changed = true;
    }
  }
  if (out.length < 3) return null;
  out.push([...(out[0] as Position)]);
  return out;
}

function simplifyPolygon(rings: unknown): Ring[] | null {
  if (!Array.isArray(rings) || rings.length === 0) throw new Error('EFFIS: bad polygon');
  const outer = simplifyRing(rings[0]);
  if (!outer) return null;
  const holes = rings
    .slice(1)
    .map(simplifyRing)
    .filter((r): r is Ring => r !== null);
  return [outer, ...holes];
}

/** Polygon parts of a geometry (GeometryCollection members that are lines or points are ignored). */
function polygonParts(g: unknown): unknown[] {
  const geom = g as { type?: string; coordinates?: unknown; geometries?: unknown } | null;
  if (geom?.type === 'Polygon') return [geom.coordinates];
  if (geom?.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) return geom.coordinates;
  // Seen in 2017 (id 11138): a MultiPolygon plus a MultiLineString sliver.
  if (geom?.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    return geom.geometries.flatMap((m: { type?: string }) =>
      m?.type === 'Polygon' || m?.type === 'MultiPolygon' ? polygonParts(m) : [],
    );
  }
  throw new Error(`EFFIS: unexpected geometry ${geom?.type ?? 'null'}`);
}

export function simplifyGeometry(g: unknown): Feature['geometry'] {
  const polys = polygonParts(g)
    .map(simplifyPolygon)
    .filter((p): p is Ring[] => p !== null);
  if (polys.length === 0) return null;
  return polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0] }
    : { type: 'MultiPolygon', coordinates: polys };
}

// Main land-cover shares (% of the burnt area, rounded to whole points).
const LAND_COVER: Record<string, string> = {
  BROADLEA: 'pct_frondosas',
  CONIFER: 'pct_coniferas',
  MIXED: 'pct_mixto',
  SCLEROPH: 'pct_esclerofilas',
  TRANSIT: 'pct_transicion',
  AGRIAREAS: 'pct_agricola',
  PERCNA2K: 'pct_natura2000',
};

/** "Gudiña, A" → "A Gudiña" (EFFIS writes some Galician names with the article last). */
export function concelloName(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const m = /^(.+),\s*(A|O|As|Os)$/.exec(v.trim());
  return m ? `${m[2]} ${m[1]}` : v.trim();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface YearCollection {
  type?: unknown;
  features?: Array<{ properties?: Record<string, unknown>; geometry?: unknown }>;
}

export interface Raw {
  years: Array<{ year: number; data: YearCollection }>;
}

function pauseMs(ctx: AdapterContext): number {
  const v = Number(ctx.env.EFFIS_PAUSE_MS ?? PAUSE_MS);
  return Number.isFinite(v) && v >= 0 ? v : PAUSE_MS;
}

export default {
  async fetch(ctx) {
    const lastYear = ctx.now.getUTCFullYear() - 1;
    const caps = (await ctx.get(CAPABILITIES_URL)).body.toString('utf8');
    const years = yearsFromCapabilities(caps, lastYear);
    if (years.length === 0)
      throw new Error('EFFIS: no yearly burnt-area layers in GetCapabilities');
    const pause = pauseMs(ctx);
    const out: Raw['years'] = [];
    for (const year of years) {
      if (pause > 0) await new Promise((r) => setTimeout(r, pause));
      const text = (await ctx.get(yearUrl(year), { timeoutMs: 120_000 })).body.toString('utf8');
      try {
        out.push({ year, data: JSON.parse(text) as YearCollection });
      } catch {
        throw new Error(`EFFIS ${year}: response is not JSON: ${text.slice(0, 80)}`);
      }
    }
    return { years: out };
  },

  normalize(raw, _ctx) {
    if (!raw || !Array.isArray(raw.years) || raw.years.length === 0) {
      throw new Error('EFFIS: no yearly responses');
    }
    const features: Feature[] = [];
    let publishedAt: string | null = null;
    for (const { year, data } of raw.years) {
      if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error(`EFFIS ${year}: response is not a GeoJSON FeatureCollection`);
      }
      for (const f of data.features) {
        const p = f.properties ?? {};
        const provincia = galicianProvince(p.PROVINCE, p.COUNTRY);
        if (!provincia) continue;
        const updated = effisTime(p.LASTUPDATE);
        if (!publishedAt || updated > publishedAt) publishedAt = updated;
        const geometry = simplifyGeometry(f.geometry);
        if (!geometry) continue;
        const area = num(p.AREA_HA);
        if (area === null) throw new Error(`EFFIS ${year}: bad AREA_HA for ${String(p.id)}`);
        const props: Record<string, unknown> = {
          id: String(p.id),
          ano: year,
          data_lume: effisTime(p.FIREDATE).slice(0, 10),
          provincia,
          concello: concelloName(p.COMMUNE),
          area_ha: area,
        };
        for (const [src, dst] of Object.entries(LAND_COVER)) {
          if (src in p) {
            const v = num(p[src]);
            props[dst] = v === null ? null : Math.min(100, Math.max(0, Math.round(v)));
          }
        }
        features.push({
          type: 'Feature',
          id: `${year}-${String(p.id)}`,
          geometry,
          properties: props,
        });
      }
    }
    return { collection: { type: 'FeatureCollection', features }, publishedAt };
  },
} satisfies Adapter<Raw>;
