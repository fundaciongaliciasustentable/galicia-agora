// Every lightning strike over Galicia in the last twelve whole months, for /pulso/lostregos/.
//
// Source: the same MeteoGalicia service as the raios layer (jsonRaios.action), which answers
// any past window of up to 7 days since 2010 (datos/fontes/raios-historico). A year is ~53
// requests, spaced out: MeteoGalicia blocks IPs that poll too fast, and the layer is rebuilt
// once a month. Strikes are kept inside the Galicia box with the raios layer's margin and
// grouped by local day, in columns (time, lon, lat, kA) to keep the file small.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { inGalicia, round } from '../../lib/adapter.ts';
import { BASE_URL, PAD, utcToIso } from '../raios/adapter.ts';

const DEFAULT_PAUSE_MS = 1500;
const WINDOW_DAYS = 7;

export interface Raw {
  from: string;
  to: string;
  weeks: unknown[];
}

const LOCAL = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
});

/** Local date (aaaa-mm-dd) and seconds since local midnight of a UTC instant. */
export function local(ms: number): { day: string; second: number } {
  const p = Object.fromEntries(LOCAL.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  const utc = new Date(ms);
  const second = Number(p.hour) * 3600 + utc.getUTCMinutes() * 60 + utc.getUTCSeconds();
  return { day, second };
}

/** The last twelve whole months before `now` (local dates), as aaaa-mm-dd. */
export function period(now: Date): { from: string; to: string } {
  const today = local(now.getTime()).day;
  const [y, m] = today.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 13, 1));
  const last = new Date(Date.UTC(y, m - 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Request windows of at most 7 days covering [from, to] (inclusive, aaaa-mm-dd). */
export function windows(from: string, to: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += WINDOW_DAYS * 86_400_000) {
    const a = new Date(t).toISOString().slice(0, 10);
    const b = new Date(Math.min(end, t + (WINDOW_DAYS - 1) * 86_400_000))
      .toISOString()
      .slice(0, 10);
    out.push([a, b]);
  }
  return out;
}

export const windowUrl = ([a, b]: [string, string]) =>
  a === b ? `${BASE_URL}?data=${dmy(a)}` : `${BASE_URL}?dataIni=${dmy(a)}&dataFin=${dmy(b)}`;

interface Raio {
  fecha?: string;
  lat?: number;
  lon?: number;
  peakCurrent?: number;
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const pause = Number(ctx.env.GA_PAUSE_MS ?? DEFAULT_PAUSE_MS);
    const { from, to } = period(ctx.now);
    const weeks: unknown[] = [];
    // The service's days may be UTC: one more day each side, trimmed to local dates later.
    const prev = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const next = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    for (const w of windows(prev, next)) {
      const res = await ctx.get(windowUrl(w), { timeoutMs: 120_000 });
      weeks.push(JSON.parse(res.body.toString('utf8')));
      if (pause > 0) await new Promise((r) => setTimeout(r, pause));
    }
    return { from, to, weeks };
  },

  normalize(raw: Raw) {
    const seen = new Set<string>();
    const byDay = new Map<string, Array<[number, number, number, number | null]>>();
    for (const week of raw.weeks) {
      const days = (week as { raios?: unknown } | null)?.raios;
      if (!Array.isArray(days)) throw new Error('raios-ano: unexpected response (no "raios")');
      for (const d of days as Array<{ listaRaios?: unknown }>) {
        if (!Array.isArray(d?.listaRaios)) throw new Error('raios-ano: day without "listaRaios"');
        for (const r of d.listaRaios as Raio[]) {
          if (typeof r.lat !== 'number' || typeof r.lon !== 'number') continue;
          if (!inGalicia(r.lon, r.lat, PAD)) continue;
          const iso = utcToIso(r.fecha);
          const key = `${iso}_${r.lat}_${r.lon}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const { day, second } = local(Date.parse(iso));
          if (day < raw.from || day > raw.to) continue;
          const list = byDay.get(day) ?? [];
          list.push([
            second,
            r.lon,
            r.lat,
            typeof r.peakCurrent === 'number' ? r.peakCurrent : null,
          ]);
          byDay.set(day, list);
        }
      }
    }
    const features: Feature[] = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, list]) => {
        list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
        return {
          type: 'Feature',
          id: day,
          geometry: null,
          properties: {
            dia: day,
            periodo_inicio: raw.from,
            periodo_fin: raw.to,
            n: list.length,
            segundo: list.map((r) => r[0]),
            lon: list.map((r) => round(r[1], 3)),
            lat: list.map((r) => round(r[2], 3)),
            ka: list.map((r) => (r[3] === null ? null : Math.round(r[3]))),
          },
        };
      });
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: `${raw.to}T23:59:59Z`,
    };
  },
};

export default adapter;
