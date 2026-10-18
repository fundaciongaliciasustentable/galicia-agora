// Renfe GTFS-RT vehicle positions (JSON) for trains inside Galicia.
// Two feeds: AV/LD/MD and Cercanías (the latter carries the Ferrol network).
// The LD feed repeats the same train once per tripId; we keep one entry per
// vehicle, preferring the newest vehicle.timestamp.

import {
  type Adapter,
  type Feature,
  type FeatureCollection,
  inGalicia,
  point,
} from '../../lib/adapter.ts';

export const FEEDS = {
  ld: 'https://gtfsrt.renfe.com/vehicle_positions_LD.json',
  cercanias: 'https://gtfsrt.renfe.com/vehicle_positions.json',
} as const;

type FeedKey = keyof typeof FEEDS;

const REDE: Record<FeedKey, string> = { ld: 'AV/LD/MD', cercanias: 'Cercanías' };

/** Bbox padding used to keep trains near the Galician border. */
// 0.05° keeps border stations (A Gudiña, Ribadeo) without taking in the Bierzo or Asturias.
export const PAD = 0.05;

interface GtfsVehicle {
  trip?: { tripId?: string };
  position?: { latitude?: number; longitude?: number };
  currentStatus?: string;
  stopId?: string;
  timestamp?: string | number;
  vehicle?: { id?: string; label?: string };
}

interface GtfsFeed {
  header?: { timestamp?: string | number };
  entity?: Array<{ id?: string; vehicle?: GtfsVehicle }>;
}

/** Cercanías is optional: if it fails, the AV/LD/MD trains are still published. */
export type Raw = { ld: string; cercanias: string | null };

function epochToIso(v: string | number | undefined): string | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function parseFeed(text: string, key: FeedKey): GtfsFeed {
  const feed = JSON.parse(text) as GtfsFeed;
  if (!feed || typeof feed !== 'object' || !feed.header || !Array.isArray(feed.entity)) {
    throw new Error(`Renfe ${key}: unexpected GTFS-RT JSON (no header/entity)`);
  }
  return feed;
}

/** Cercanías labels look like "C1-71801-PLATF.(1)"; drop the platform suffix. */
function cleanLabel(label: string): string {
  return label.replace(/-PLATF\.\(\d+\)$/, '').trim();
}

export function normalizeFeeds(raw: Raw): {
  collection: FeatureCollection;
  publishedAt: string | null;
} {
  const best = new Map<string, { ts: number; feature: Feature }>();
  const headerTimes: string[] = [];

  for (const key of Object.keys(FEEDS) as FeedKey[]) {
    const text = raw[key];
    if (text === null) continue;
    const feed = parseFeed(text, key);
    const headerIso = epochToIso(feed.header?.timestamp);
    if (headerIso) headerTimes.push(headerIso);

    for (const ent of feed.entity ?? []) {
      const v = ent.vehicle;
      const lat = v?.position?.latitude;
      const lon = v?.position?.longitude;
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;
      if (!inGalicia(lon, lat, PAD)) continue;

      const vehId = v?.vehicle?.id ?? v?.vehicle?.label ?? ent.id;
      if (!vehId) continue;
      const label = cleanLabel(v?.vehicle?.label ?? vehId);
      const dataPosicion = epochToIso(v?.timestamp);
      // Missing vehicle timestamp ranks lowest; on ties the first entry wins.
      const ts = dataPosicion ? Date.parse(dataPosicion) : 0;

      const feature: Feature = {
        type: 'Feature',
        id: vehId,
        geometry: point(lon, lat),
        properties: {
          tren: label,
          rede: REDE[key],
          viaxe: v?.trip?.tripId ?? null,
          data_posicion: dataPosicion,
          estado: v?.currentStatus ?? null,
          parada: v?.stopId ?? null,
        },
      };
      const prev = best.get(vehId);
      if (!prev || ts > prev.ts) best.set(vehId, { ts, feature });
    }
  }

  // Oldest header: a stale feed must not make the layer look newer than it is.
  const publishedAt = headerTimes.length ? (headerTimes.sort()[0] ?? null) : null;
  return {
    collection: { type: 'FeatureCollection', features: [...best.values()].map((b) => b.feature) },
    publishedAt,
  };
}

export default {
  async fetch(ctx) {
    const ld = await ctx.get(FEEDS.ld);
    let cercanias: string | null = null;
    try {
      cercanias = (await ctx.get(FEEDS.cercanias)).body.toString('utf8');
    } catch {
      // Ferrol Cercanías is a handful of trains; losing it must not block the rest.
    }
    return { ld: ld.body.toString('utf8'), cercanias };
  },
  normalize(raw) {
    return normalizeFeeds(raw);
  },
} satisfies Adapter<Raw>;
