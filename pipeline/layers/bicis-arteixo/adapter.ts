// biciArteixo public bike stations (GBFS 2.3, nextbike). Two requests per run:
// station_information (names, coordinates, capacity) and station_status (availability).
// The feed URLs come from gbfs.json and have been stable; they are hard-coded here to save
// a third request. free_bike_status is never read: no individual bike ids are published.

import { type Adapter, type Feature, inGalicia, point } from '../../lib/adapter.ts';

const BASE = 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_aa/es';
export const INFO_URL = `${BASE}/station_information.json`;
export const STATUS_URL = `${BASE}/station_status.json`;

export interface Raw {
  info: unknown;
  status: unknown;
}

interface Info {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  capacity?: number;
}
interface Status {
  station_id: string;
  num_bikes_available: number;
  num_docks_available?: number;
  is_installed?: boolean;
  is_renting?: boolean;
  last_reported?: number;
}

function stations<T>(doc: unknown, what: string): { list: T[]; lastUpdated: number } {
  const d = doc as { last_updated?: unknown; data?: { stations?: unknown } } | null;
  if (!d || typeof d.last_updated !== 'number' || !Array.isArray(d.data?.stations)) {
    throw new Error(`Unexpected GBFS ${what}: missing last_updated or data.stations`);
  }
  return { list: d.data.stations as T[], lastUpdated: d.last_updated };
}

/**
 * nextbike repeats the station label: "PRAIA DE ALBA-SABÓN PRAIA DE ALBA-SABÓN Poligono 3".
 * Drop a leading run of words that is immediately repeated.
 */
export function cleanName(name: string): string {
  const words = name.trim().split(/\s+/);
  for (let n = Math.floor(words.length / 2); n >= 1; n--) {
    const a = words.slice(0, n).join(' ');
    const b = words.slice(n, 2 * n).join(' ');
    if (a === b) return words.slice(n).join(' ');
  }
  return words.join(' ');
}

const iso = (s: number) => new Date(s * 1000).toISOString();

const adapter = {
  async fetch(ctx) {
    const info = await ctx.get(INFO_URL);
    const status = await ctx.get(STATUS_URL);
    return {
      info: JSON.parse(info.body.toString('utf8')),
      status: JSON.parse(status.body.toString('utf8')),
    };
  },

  normalize(raw, _ctx) {
    const info = stations<Info>(raw.info, 'station_information');
    const status = stations<Status>(raw.status, 'station_status');
    const byId = new Map(status.list.map((s) => [String(s.station_id), s]));

    const features: Feature[] = [];
    for (const i of info.list) {
      const s = byId.get(String(i.station_id));
      // A station without status has no availability to show.
      if (!s || typeof s.num_bikes_available !== 'number') continue;
      if (typeof i.lat !== 'number' || typeof i.lon !== 'number') continue;
      if (!inGalicia(i.lon, i.lat)) continue;
      const id = String(i.station_id);
      features.push({
        type: 'Feature',
        id,
        geometry: point(i.lon, i.lat),
        properties: {
          id,
          nome: cleanName(i.name ?? '') || id,
          capacidade: typeof i.capacity === 'number' ? i.capacity : null,
          bicis_libres: s.num_bikes_available,
          ancoraxes_libres:
            typeof s.num_docks_available === 'number' ? s.num_docks_available : null,
          operativa: s.is_installed !== false && s.is_renting === true,
          actualizado: iso(
            typeof s.last_reported === 'number' ? s.last_reported : status.lastUpdated,
          ),
        },
      });
    }

    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: iso(status.lastUpdated),
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
