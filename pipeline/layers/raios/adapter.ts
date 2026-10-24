// MeteoGalicia lightning detection network: strikes of the last 24 hours in Galicia.
// Exactly one request per run (MeteoGalicia blocks IPs that poll inefficiently).
// jsonRaios.action returns today by default; its documentation (JSON_RaiosHistorico_gl.pdf)
// also accepts dataIni/dataFin (dd/MM/yyyy, at most 7 days), so a single call covering
// yesterday and today is enough for a rolling 24 h window.

import { type Adapter, type Feature, inGalicia, point } from '../../lib/adapter.ts';

export const BASE_URL = 'https://servizos.meteogalicia.gal/mgrss/observacion/jsonRaios.action';
export const WINDOW_MS = 24 * 3600_000;
/** Bbox padding: the network covers more than Galicia (up to 37.6–44.4 N). */
export const PAD = 0.1;

const MADRID_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function ddmmyyyy(parts: { y: string; m: string; d: string }): string {
  return `${parts.d}/${parts.m}/${parts.y}`;
}

function utcDate(t: Date) {
  const s = t.toISOString();
  return { y: s.slice(0, 4), m: s.slice(5, 7), d: s.slice(8, 10) };
}

function madridDate(t: Date) {
  const p = Object.fromEntries(MADRID_DATE.formatToParts(t).map((x) => [x.type, x.value]));
  return { y: p.year as string, m: p.month as string, d: p.day as string };
}

/**
 * The documentation does not say whether "days" are UTC or local. Madrid is ahead of UTC,
 * so starting at the UTC date of now − 24 h and ending at the Madrid date of now covers
 * the window under either convention.
 */
export function queryUrl(now: Date): string {
  const from = ddmmyyyy(utcDate(new Date(now.getTime() - WINDOW_MS)));
  const to = ddmmyyyy(madridDate(now));
  return `${BASE_URL}?dataIni=${from}&dataFin=${to}`;
}

interface Raio {
  fecha?: string;
  lat?: number;
  lon?: number;
  peakCurrent?: number;
}
export type Raw = unknown;

/** "fecha" is UTC without a zone designator ("2026-10-17T05:29:48"). */
export function utcToIso(s: unknown): string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    throw new Error(`Raios: unexpected fecha: ${String(s)}`);
  }
  return new Date(`${s}Z`).toISOString();
}

const adapter = {
  async fetch(ctx) {
    const res = await ctx.get(queryUrl(ctx.now));
    return JSON.parse(res.body.toString('utf8'));
  },

  normalize(raw, ctx) {
    const days = (raw as { raios?: unknown } | null)?.raios;
    if (!Array.isArray(days)) throw new Error('Raios: unexpected response (no "raios" array)');

    const end = ctx.now.getTime();
    const start = end - WINDOW_MS;
    const seen = new Set<string>();
    const features: Feature[] = [];
    let newest = 0;

    for (const day of days as Array<{ listaRaios?: unknown }>) {
      if (!Array.isArray(day?.listaRaios)) {
        throw new Error('Raios: unexpected response (day without "listaRaios")');
      }
      for (const r of day.listaRaios as Raio[]) {
        const data = utcToIso(r.fecha);
        const t = Date.parse(data);
        if (t < start || t > end) continue;
        if (typeof r.lat !== 'number' || typeof r.lon !== 'number') continue;
        if (!inGalicia(r.lon, r.lat, PAD)) continue;
        const id = `${data}_${r.lat}_${r.lon}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const ka = typeof r.peakCurrent === 'number' ? r.peakCurrent : null;
        features.push({
          type: 'Feature',
          id,
          geometry: point(r.lon, r.lat),
          properties: {
            data,
            intensidade_ka: ka,
            polaridade: ka === null || ka === 0 ? null : ka > 0 ? 'positivo' : 'negativo',
          },
        });
        newest = Math.max(newest, t);
      }
    }

    features.sort((a, b) => String(a.properties.data).localeCompare(String(b.properties.data)));
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: newest ? new Date(newest).toISOString() : null,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
