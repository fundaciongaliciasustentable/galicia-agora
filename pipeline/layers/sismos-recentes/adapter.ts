// EMSC SeismicPortal FDSN event service: earthquakes of the last 30 days in a box
// around Galicia (land and nearby sea). Most solutions are authored by the IGN.
// One request per run. EMSC terms forbid bulk copies of the database, so the
// layer only keeps this rolling 30-day window and builds no archive.

import { type Adapter, type Feature, point } from '../../lib/adapter.ts';

export const BASE_URL = 'https://www.seismicportal.eu/fdsnws/event/1/query';
export const BOX = { minlat: 41.5, maxlat: 44.5, minlon: -10.5, maxlon: -6.5 } as const;
export const WINDOW_MS = 30 * 24 * 3600_000;

export function queryUrl(now: Date): string {
  const start = new Date(now.getTime() - WINDOW_MS).toISOString().slice(0, 19);
  return (
    `${BASE_URL}?starttime=${start}&minlatitude=${BOX.minlat}&maxlatitude=${BOX.maxlat}` +
    `&minlongitude=${BOX.minlon}&maxlongitude=${BOX.maxlon}&format=json&limit=500`
  );
}

interface EmscProps {
  unid?: string;
  time?: string;
  lastupdate?: string;
  lat?: number;
  lon?: number;
  depth?: number;
  mag?: number;
  magtype?: string;
  auth?: string;
  flynn_region?: string;
  evtype?: string;
}

/** Response body as text; empty when the service answers 204 (no events). */
export type Raw = string;

function iso(s: unknown, field: string): string {
  const t = typeof s === 'string' ? Date.parse(s) : Number.NaN;
  if (!Number.isFinite(t)) throw new Error(`EMSC: unexpected ${field}: ${String(s)}`);
  return new Date(t).toISOString();
}

const adapter = {
  async fetch(ctx) {
    const res = await ctx.get(queryUrl(ctx.now));
    // FDSN answers 204 No Content when there are no events.
    return res.status === 204 ? '' : res.body.toString('utf8');
  },

  normalize(raw, _ctx) {
    if (raw.trim() === '') {
      return { collection: { type: 'FeatureCollection', features: [] }, publishedAt: null };
    }
    const doc = JSON.parse(raw) as { type?: string; features?: unknown };
    if (doc?.type !== 'FeatureCollection' || !Array.isArray(doc.features)) {
      throw new Error('EMSC: unexpected response (not a FeatureCollection)');
    }

    const features: Feature[] = [];
    let newest = 0;
    for (const f of doc.features as Array<{ id?: string; properties?: EmscProps }>) {
      const p = f.properties;
      if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') {
        throw new Error('EMSC: event without coordinates');
      }
      if (p.lat < BOX.minlat || p.lat > BOX.maxlat || p.lon < BOX.minlon || p.lon > BOX.maxlon) {
        continue;
      }
      const unid = p.unid ?? f.id;
      if (!unid) throw new Error('EMSC: event without unid');
      const actualizado = iso(p.lastupdate, 'lastupdate');
      const props: Record<string, unknown> = {
        id: unid,
        data: iso(p.time, 'time'),
        actualizado,
        magnitude: typeof p.mag === 'number' ? p.mag : null,
        tipo_magnitude: p.magtype ?? null,
        profundidade_km: typeof p.depth === 'number' ? p.depth : null,
        autoria: p.auth ?? null,
        rexion: p.flynn_region ?? null,
        tipo_evento: p.evtype ?? null,
        fonte_url: `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(unid)}`,
      };
      // A depth of exactly 0 km is a fixed (not computed) depth in EMSC/IGN solutions.
      if (p.depth === 0) props.profundidade_fixada = true;
      features.push({
        type: 'Feature',
        id: unid,
        geometry: point(p.lon, p.lat),
        properties: props,
      });
      newest = Math.max(newest, Date.parse(actualizado));
    }

    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: newest ? new Date(newest).toISOString() : null,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
