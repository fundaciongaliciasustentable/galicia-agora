// Sentinel-2 L2A scenes for one month from the Earth Search STAC API
// (Element84, public, no account) and the choice of scenes per MGRS tile.

import type { Bbox } from '../lib/raster.ts';

export const STAC_SEARCH = 'https://earth-search.aws.element84.com/v1/search';
export const COLLECTION = 'sentinel-2-l2a';

/** Assets read per scene (Earth Search v1 names): true colour, near infrared, scene classes. */
export const BANDS = ['red', 'green', 'blue', 'nir'] as const;
export type Band = (typeof BANDS)[number];

export interface Scene {
  id: string;
  /** MGRS tile, e.g. "29TNH". */
  tile: string;
  datetime: string;
  epsg: number;
  cloud: number;
  nodata: number;
  sequence: number;
  hrefs: Record<Band | 'scl', string>;
  /** Reflectance = DN × scale + offset, per band (from raster:bands). */
  scale: Record<Band, number>;
  offset: Record<Band, number>;
}

interface StacItem {
  id: string;
  properties: Record<string, unknown>;
  assets: Record<
    string,
    { href: string; 'raster:bands'?: Array<{ scale?: number; offset?: number }> }
  >;
}

interface StacPage {
  features: StacItem[];
  links?: Array<{ rel: string; href: string; method?: string }>;
}

/** First and last instant of a month "YYYY-MM", as a STAC datetime interval. */
export function monthInterval(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`month must be YYYY-MM: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error(`month must be YYYY-MM: ${month}`);
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 1) - 1000);
  const iso = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;
  return `${iso(start)}/${iso(end)}`;
}

/** The month before the given date, "YYYY-MM" (the monthly job builds the month just ended). */
export function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

export function searchUrl(month: string, bbox: Bbox, limit = 100): string {
  const q = new URLSearchParams({
    collections: COLLECTION,
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north].join(','),
    datetime: monthInterval(month),
    limit: String(limit),
  });
  return `${STAC_SEARCH}?${q}`;
}

/** Item → Scene, or null when an asset or property the build needs is missing. */
export function toScene(item: StacItem): Scene | null {
  const p = item.properties;
  const tile =
    typeof p['grid:code'] === 'string'
      ? (p['grid:code'] as string).replace(/^MGRS-/, '')
      : `${p['mgrs:utm_zone']}${p['mgrs:latitude_band']}${p['mgrs:grid_square']}`;
  const epsg = Number(p['proj:epsg']);
  if (!/^\d{2}[A-Z]{3}$/.test(tile) || !Number.isFinite(epsg)) return null;
  const hrefs = {} as Scene['hrefs'];
  const scale = {} as Scene['scale'];
  const offset = {} as Scene['offset'];
  for (const b of [...BANDS, 'scl'] as const) {
    const a = item.assets[b];
    if (!a?.href?.startsWith('https://')) return null;
    hrefs[b] = a.href;
    if (b !== 'scl') {
      const rb = a['raster:bands']?.[0];
      scale[b] = rb?.scale ?? 0.0001;
      // Earth Search already subtracted the −1000 DN of baseline 04.00+ when
      // earthsearch:boa_offset_applied is true, yet raster:bands still lists
      // offset −0.1 (checked 2026-11-01: vegetation red DN ≈ 260, i.e. 0.026).
      offset[b] = p['earthsearch:boa_offset_applied'] === true ? 0 : (rb?.offset ?? 0);
    }
  }
  return {
    id: item.id,
    tile,
    datetime: String(p.datetime),
    epsg,
    cloud: Number(p['eo:cloud_cover'] ?? 100),
    nodata: Number(p['s2:nodata_pixel_percentage'] ?? 0),
    sequence: Number(p['s2:sequence'] ?? 0),
    hrefs,
    scale,
    offset,
  };
}

/** Every scene of the month over the bbox, following the API's `next` links. */
export async function searchScenes(
  month: string,
  bbox: Bbox,
  getJson: (url: string) => Promise<unknown>,
): Promise<Scene[]> {
  const out: Scene[] = [];
  let url: string | undefined = searchUrl(month, bbox);
  for (let page = 0; url && page < 50; page++) {
    const body = (await getJson(url)) as StacPage;
    if (!Array.isArray(body.features)) throw new Error('STAC search: no features array');
    for (const f of body.features) {
      const s = toScene(f);
      if (s) out.push(s);
    }
    const next = body.links?.find((l) => l.rel === 'next' && (l.method ?? 'GET') === 'GET');
    url = body.features.length > 0 ? next?.href : undefined;
  }
  return out;
}

/** Expected share of the tile that is valid and cloud-free (0–1). */
export function clearShare(s: Pick<Scene, 'cloud' | 'nodata'>): number {
  return Math.max(0, 1 - s.nodata / 100) * Math.max(0, 1 - s.cloud / 100);
}

export interface SelectOptions {
  /** Scenes kept per tile, clearest first. */
  maxScenes: number;
  /** Scenes expected to add less than this clear share are not worth reading. */
  minClear: number;
}

/**
 * Pick the clearest scenes of each MGRS tile. Reprocessed copies of the same
 * acquisition (same tile and datetime) keep only the highest s2:sequence.
 * Ties go to the later date, so the mosaic leans towards the end of the month.
 */
export function selectScenes(
  scenes: Scene[],
  opts: SelectOptions = { maxScenes: 8, minClear: 0.03 },
): Map<string, Scene[]> {
  const latest = new Map<string, Scene>();
  for (const s of scenes) {
    const key = `${s.tile}|${s.datetime}`;
    const prev = latest.get(key);
    if (!prev || s.sequence > prev.sequence) latest.set(key, s);
  }
  const byTile = new Map<string, Scene[]>();
  for (const s of latest.values()) {
    if (clearShare(s) < opts.minClear) continue;
    byTile.set(s.tile, [...(byTile.get(s.tile) ?? []), s]);
  }
  for (const [tile, list] of byTile) {
    list.sort((a, b) => clearShare(b) - clearShare(a) || b.datetime.localeCompare(a.datetime));
    byTile.set(tile, list.slice(0, opts.maxScenes));
  }
  return new Map([...byTile].sort(([a], [b]) => a.localeCompare(b)));
}
