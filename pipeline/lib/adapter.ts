// Layer adapter contract: fetch → normalize → validate → write.
// Each layer lives in pipeline/layers/<id>/ with layer.yaml and adapter.ts,
// whose default export implements Adapter. The ingest CLI does validate and
// write (via publish.ts), so adapters only fetch and normalize.

import type { FetchOptions, FetchResult } from './http.ts';

export interface Feature {
  type: 'Feature';
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

export interface LayerDef {
  id: string;
  title: { gl: string; es: string };
  source_url: string;
  licence: { spdx?: string; text_url: string; collection: 'odbl' | 'cc-by-sa-4.0' };
  attribution: string;
  stale_after?: string;
  ingest?: { every: string };
  volatile?: boolean;
  join?: { layer: string; key: string; where?: Record<string, unknown> };
  indicators?: Array<{ id: string; comparison: 'index' | 'points' }>;
  [key: string]: unknown;
}

export interface AdapterContext {
  layer: LayerDef;
  now: Date;
  /** Secrets from the environment (CI or server only). */
  env: Record<string, string | undefined>;
  /** HTTP with the project User-Agent and retries. Injected so tests can replay fixtures. */
  get(url: string, opts?: FetchOptions): Promise<FetchResult>;
}

export interface Normalized {
  collection: FeatureCollection;
  /** Publication time reported by the source (ISO 8601), or null if it gives none. */
  publishedAt: string | null;
}

export interface Adapter<Raw = unknown> {
  fetch(ctx: AdapterContext): Promise<Raw>;
  normalize(raw: Raw, ctx: AdapterContext): Normalized | Promise<Normalized>;
}

/** Round to a fixed number of decimals (6 ≈ 0.1 m) to keep files small. */
export function round(n: number, decimals = 5): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function point(lon: number, lat: number): Feature['geometry'] {
  return { type: 'Point', coordinates: [round(lon), round(lat)] };
}

/** Galicia bounding box used to clip wider sources (lon/lat, WGS84). */
export const GALICIA_BBOX = { west: -9.35, south: 41.8, east: -6.7, north: 43.8 } as const;

export function inGalicia(lon: number, lat: number, pad = 0): boolean {
  return (
    lon >= GALICIA_BBOX.west - pad &&
    lon <= GALICIA_BBOX.east + pad &&
    lat >= GALICIA_BBOX.south - pad &&
    lat <= GALICIA_BBOX.north + pad
  );
}

/**
 * Convert a local Europe/Madrid wall-clock time ("2026-10-18 09:00") to ISO UTC.
 * Several Galician services publish local times without an offset.
 */
export function madridToIso(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) throw new Error(`Unrecognised local time: ${local}`);
  const [, y, mo, d, h, mi, s = '00'] = m;
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  // Offset of Europe/Madrid (CET +1 / CEST +2). Computed twice: the first
  // guess uses the wrong instant near a clock change, the second corrects it.
  const first = madridOffsetMs(asUtc);
  const offset = madridOffsetMs(asUtc - first);
  return new Date(asUtc - offset).toISOString();
}

const MADRID = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset of Europe/Madrid from UTC, in ms, at the given UTC instant. */
function madridOffsetMs(utcMs: number): number {
  const parts = Object.fromEntries(
    MADRID.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  );
  const p = (k: string) => Number(parts[k]);
  return Date.UTC(p('year'), p('month') - 1, p('day'), p('hour'), p('minute'), p('second')) - utcMs;
}

/** Comparison with the Galicia value: index (Galicia = 100) or difference in points. */
export function compareWithGalicia(
  value: number | null,
  galicia: number | null,
  comparison: 'index' | 'points',
): number | null {
  if (value === null || galicia === null || !Number.isFinite(value) || !Number.isFinite(galicia)) {
    return null;
  }
  if (comparison === 'points') return round(value - galicia, 2);
  if (galicia === 0) return null;
  return round((value / galicia) * 100, 1);
}
