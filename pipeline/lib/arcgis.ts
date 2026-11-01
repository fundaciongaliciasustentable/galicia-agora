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

// ── `find` fallback ────────────────────────────────────────────────────────────────────────
// Some IDEG sublayers (Augas de Galicia protected zones, checked 2026-11-01) answer `query`
// with `geometry: null` for every feature, while the standard MapServer `find` operation
// returns the shapes. `find` has no paging, so the result size is checked against the
// `query` count, which works on those layers.

export interface EsriGeometry {
  rings?: number[][][];
  paths?: number[][][];
  x?: number;
  y?: number;
}

export interface FindResult {
  layerId: number;
  attributes: Record<string, unknown>;
  geometry?: EsriGeometry | null;
}

/** Signed area (shoelace); Esri outer rings are clockwise (negative here). */
function signedArea(ring: number[][]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j] as number[];
    const b = ring[i] as number[];
    s += ((a[0] as number) - (b[0] as number)) * ((a[1] as number) + (b[1] as number));
  }
  return s / 2;
}

function inRing(pt: number[], ring: number[][]): boolean {
  const [x, y] = pt as [number, number];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Esri JSON geometry → GeoJSON geometry (Point, LineString/MultiLineString, Polygon/MultiPolygon). */
export function esriToGeoJSON(g: EsriGeometry | null | undefined): ArcFeature['geometry'] {
  if (!g) return null;
  if (typeof g.x === 'number' && typeof g.y === 'number') {
    return { type: 'Point', coordinates: [g.x, g.y] };
  }
  if (g.paths?.length) {
    return g.paths.length === 1
      ? { type: 'LineString', coordinates: g.paths[0] }
      : { type: 'MultiLineString', coordinates: g.paths };
  }
  if (g.rings?.length) {
    const outers: number[][][][] = [];
    const holes: number[][][] = [];
    for (const r of g.rings) {
      if (r.length < 4) continue;
      // Esri: clockwise = outer ring, counter-clockwise = hole. GeoJSON wants the reverse.
      if (signedArea(r) < 0) outers.push([[...r].reverse()]);
      else holes.push([...r].reverse());
    }
    for (const h of holes) {
      const owner = outers.find((p) => inRing(h[0] as number[], p[0] as number[][]));
      if (owner) owner.push(h);
    }
    if (outers.length === 0) return null;
    return outers.length === 1
      ? { type: 'Polygon', coordinates: outers[0] }
      : { type: 'MultiPolygon', coordinates: outers };
  }
  return null;
}

export function countUrl(layerUrl: string, where = '1=1'): string {
  return `${layerUrl}/query?${new URLSearchParams({ where, returnCountOnly: 'true', f: 'json' })}`;
}

export function findUrl(
  mapServerUrl: string,
  layer: number,
  searchField: string,
  searchText: string,
  maxAllowableOffset?: number,
): string {
  const q = new URLSearchParams({
    searchText,
    contains: 'true',
    searchFields: searchField,
    layers: String(layer),
    returnGeometry: 'true',
    sr: '4326',
    ...(maxAllowableOffset ? { maxAllowableOffset: String(maxAllowableOffset) } : {}),
    geometryPrecision: '5',
    f: 'json',
  });
  return `${mapServerUrl}/find?${q}`;
}

async function getJson(ctx: AdapterContext, url: string, what: string): Promise<unknown> {
  try {
    return JSON.parse((await ctx.get(url)).body.toString('utf8'));
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(`ArcGIS ${what}: response is not JSON`);
    throw err;
  }
}

/**
 * Every feature of one sublayer through `find` (a text match on a field all features share),
 * checked against the sublayer's `query` count so a truncated answer fails.
 */
export async function fetchByFind(
  ctx: AdapterContext,
  mapServerUrl: string,
  layer: number,
  searchField: string,
  searchText: string,
  maxAllowableOffset?: number,
): Promise<{ count: number; results: FindResult[] }> {
  const what = `${mapServerUrl.replace(IDEG, '')}/${layer}`;
  const c = (await getJson(ctx, countUrl(`${mapServerUrl}/${layer}`), `${what} count`)) as {
    count?: number;
    error?: { message?: string };
  };
  if (c?.error || typeof c?.count !== 'number') {
    throw new Error(`ArcGIS ${what}: no count (${c?.error?.message ?? 'unexpected response'})`);
  }
  const f = (await getJson(
    ctx,
    findUrl(mapServerUrl, layer, searchField, searchText, maxAllowableOffset),
    `${what} find`,
  )) as { results?: FindResult[]; error?: { message?: string } };
  if (f?.error || !Array.isArray(f?.results)) {
    throw new Error(`ArcGIS ${what} find: ${f?.error?.message ?? 'unexpected response'}`);
  }
  const results = f.results.filter((r) => r.layerId === layer);
  if (results.length !== c.count) {
    throw new Error(
      `ArcGIS ${what}: find gave ${results.length} features, query counts ${c.count}`,
    );
  }
  return { count: c.count, results };
}
