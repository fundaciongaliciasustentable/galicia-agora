// Shared reader for ArcGIS REST MapServer layers (IDEG, ideg.xunta.gal): paginated
// `query` with GeoJSON output in EPSG:4326. Polygons and lines can be generalised on the
// server with maxAllowableOffset (in output degrees). Coordinates are cut to 2D and
// rounded to 5 decimals (≈ 1 m), so Z/M values some services send are dropped.

import { type AdapterContext, round } from './adapter.ts';

export const IDEG = 'https://ideg.xunta.gal/servizos/rest/services';

export interface ArcFeature {
  id?: number | string;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> | null;
}

export interface ArcPage {
  type?: string;
  features?: ArcFeature[];
  exceededTransferLimit?: boolean;
  properties?: { exceededTransferLimit?: boolean };
  error?: { message?: string };
}

export interface QueryOptions {
  where?: string;
  outFields?: string;
  /** Server-side generalisation tolerance in output degrees (0.0001 ≈ 10 m). */
  maxAllowableOffset?: number;
  /** Must not exceed the layer's maxRecordCount (1000 on most IDEG services). */
  pageSize?: number;
  maxPages?: number;
  orderByFields?: string;
}

export function queryUrl(layerUrl: string, offset: number, o: QueryOptions = {}): string {
  const q = new URLSearchParams({
    resultOffset: String(offset),
    resultRecordCount: String(o.pageSize ?? 1000),
    where: o.where ?? '1=1',
    outFields: o.outFields ?? '*',
    outSR: '4326',
    ...(o.maxAllowableOffset ? { maxAllowableOffset: String(o.maxAllowableOffset) } : {}),
    geometryPrecision: '5',
    ...(o.orderByFields ? { orderByFields: o.orderByFields } : {}),
    f: 'geojson',
  });
  return `${layerUrl}/query?${q}`;
}

/** Features of one page, or a thrown error for a service error or a non-GeoJSON answer. */
export function pageFeatures(page: ArcPage, what: string): ArcFeature[] {
  if (page?.error) throw new Error(`ArcGIS ${what}: ${page.error.message ?? 'service error'}`);
  if (page?.type !== 'FeatureCollection' || !Array.isArray(page.features)) {
    throw new Error(`ArcGIS ${what}: unexpected response (no FeatureCollection)`);
  }
  return page.features;
}

/** All pages of one layer query. Refuses partial downloads (too many or empty pages). */
export async function fetchLayer(
  ctx: AdapterContext,
  layerUrl: string,
  o: QueryOptions = {},
): Promise<ArcPage[]> {
  const pages: ArcPage[] = [];
  const maxPages = o.maxPages ?? 20;
  let offset = 0;
  for (let i = 0; i < maxPages; i++) {
    const what = `${layerUrl.replace(IDEG, '')} offset ${offset}`;
    let page: ArcPage;
    try {
      page = JSON.parse((await ctx.get(queryUrl(layerUrl, offset, o))).body.toString('utf8'));
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(`ArcGIS ${what}: response is not JSON`);
      throw err;
    }
    const features = pageFeatures(page, what);
    pages.push(page);
    const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit ?? false;
    if (!more) return pages;
    if (features.length === 0) throw new Error(`ArcGIS ${what}: empty page with more to come`);
    offset += features.length;
  }
  throw new Error(`ArcGIS ${layerUrl}: more than ${maxPages} pages; refusing a partial download`);
}

/** Every feature of a list of pages (each page checked). */
export function allFeatures(pages: ArcPage[], what: string): ArcFeature[] {
  return pages.flatMap((p) => pageFeatures(p, what));
}

/** Round to 5 decimals and keep only x, y of each position. */
export function roundCoords(c: unknown): unknown {
  if (Array.isArray(c) && typeof c[0] === 'number') {
    return [round(c[0] as number), round(c[1] as number)];
  }
  if (Array.isArray(c)) return c.map(roundCoords);
  return c;
}

/** Drop consecutive repeated positions that rounding can create. */
function dedupe(c: unknown): unknown {
  if (!Array.isArray(c)) return c;
  if (Array.isArray(c[0]) && typeof (c[0] as unknown[])[0] === 'number') {
    const out: unknown[] = [];
    for (const p of c as number[][]) {
      const prev = out[out.length - 1] as number[] | undefined;
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
    }
    return out;
  }
  return c.map(dedupe);
}

/** 2D, rounded geometry without repeated vertices; null when there is none. */
export function cleanGeometry(
  g: ArcFeature['geometry'],
): { type: string; coordinates: unknown } | null {
  if (!g || !Array.isArray(g.coordinates)) return null;
  const coords = roundCoords(g.coordinates);
  return { type: g.type, coordinates: g.type === 'Point' ? coords : dedupe(coords) };
}

/** Trimmed string with inner whitespace collapsed; null for empty values and placeholders. */
export function str(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s === '' || s === '-' || s === ' ' ? null : s;
}

/** Finite number or null (ArcGIS sends null, strings or floating noise). */
export function num(v: unknown, decimals = 2): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? round(n, decimals) : null;
}
