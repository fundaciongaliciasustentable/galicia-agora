// River gauges of the MeteoGalicia–Augas de Galicia network: current flow and level.
// Exactly one request per run (MeteoGalicia blocks IPs that poll inefficiently).
// The service needs a personal key in the "cod" query parameter. The key must never
// reach meta.json, logs or errors: source_url in layer.yaml has no key, and every
// error raised here is redacted.

import {
  type Adapter,
  type AdapterContext,
  type Feature,
  inGalicia,
  point,
} from '../../lib/adapter.ts';

export const SOURCE_URL = 'https://servizos.meteogalicia.gal/mgafos/json/estadoActual.action';
export const KEY_ENV = 'METEOGALICIA_AFOROS_KEY';

/** Readings older than this, relative to the newest reading in the response, are dropped. */
export const MAX_LAG_MS = 3 * 60 * 60_000;

/** Bbox padding: the network is inside Galicia; the pad only absorbs coordinate noise. */
export const PAD = 0.1;

/** "No data" sentinel seen in valorCaudal and valorNivel (sample of 2026-10-24). */
const NO_DATA = -9999;

interface EstadoActual {
  idEstacion: number;
  estacion: string;
  concello?: string;
  provincia?: string;
  dataUTC: string;
  lat: number;
  lon: number;
  valorCaudal?: number | null;
  valorNivel?: number | null;
}

export function requestUrl(key: string): string {
  return `${SOURCE_URL}?cod=${encodeURIComponent(key)}`;
}

/** Replace every occurrence of the key (raw and URL-encoded) so it never leaks. */
export function redact(text: string, key: string | undefined): string {
  if (!key) return text;
  let out = text.split(key).join(`[${KEY_ENV}]`);
  const enc = encodeURIComponent(key);
  if (enc !== key) out = out.split(enc).join(`[${KEY_ENV}]`);
  return out;
}

function keyOf(ctx: AdapterContext): string | undefined {
  return ctx.env[KEY_ENV]?.trim() || undefined;
}

/** dataUTC is UTC without a zone designator ("2026-10-24T07:10:00"). */
export function utcToIso(s: string): string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    throw new Error(`Unexpected dataUTC: ${String(s)}`);
  }
  return new Date(`${s}Z`).toISOString();
}

function value(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > NO_DATA ? v : null;
}

const adapter = {
  async fetch(ctx) {
    const key = keyOf(ctx);
    if (!key) throw new Error(`${KEY_ENV} is not set: the aforos service needs a key`);
    let text: string;
    try {
      text = (await ctx.get(requestUrl(key))).body.toString('utf8');
    } catch (err) {
      throw new Error(redact(err instanceof Error ? err.message : String(err), key));
    }
    // Without a valid key the service answers 200 with an HTML error page.
    if (/^\s*</.test(text)) {
      throw new Error('MeteoGalicia aforos: HTML page instead of JSON (missing or invalid key?)');
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (err) {
      throw new Error(redact(`MeteoGalicia aforos: invalid JSON (${(err as Error).message})`, key));
    }
  },

  normalize(raw, _ctx) {
    const list = (raw as Record<string, unknown> | null)?.listEstadoActual;
    if (!Array.isArray(list))
      throw new Error('Unexpected response: missing array "listEstadoActual"');
    const rows = list as EstadoActual[];

    const times = rows.map((r) => Date.parse(utcToIso(r.dataUTC)));
    const newest = times.length ? Math.max(...times) : 0;

    const features: Feature[] = [];
    let published = 0;
    rows.forEach((r, i) => {
      const t = times[i] as number;
      if (newest - t > MAX_LAG_MS) return;
      if (typeof r.lat !== 'number' || typeof r.lon !== 'number') return;
      if (!inGalicia(r.lon, r.lat, PAD)) return;
      const caudal = value(r.valorCaudal);
      const nivel = value(r.valorNivel);
      // A station with neither value has nothing to show.
      if (caudal === null && nivel === null) return;
      features.push({
        type: 'Feature',
        id: r.idEstacion,
        geometry: point(r.lon, r.lat),
        properties: {
          id: r.idEstacion,
          nome: r.estacion,
          concello: r.concello ?? '',
          provincia: r.provincia ?? '',
          caudal_m3s: caudal,
          nivel_m: nivel,
          data_medida: new Date(t).toISOString(),
        },
      });
      published = Math.max(published, t);
    });

    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: published ? new Date(published).toISOString() : null,
    };
  },
} satisfies Adapter<unknown>;

export default adapter;
