// Airports, airfields and heliports in Galicia (OurAirports, public domain) with monthly
// passenger totals for the three commercial airports (Eurostat avia_paoa, JSON-stat 2.0).
// Two requests per run. airports.csv is ~13 MB worldwide: it is scanned line by line and
// only rows whose text contains "ES-GA" are parsed.

import {
  type Adapter,
  type AdapterContext,
  type Feature,
  inGalicia,
  point,
} from '../../lib/adapter.ts';

export const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const EUROSTAT_BASE =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/avia_paoa';
/** Commercial airports with Eurostat data (ICAO). */
export const COMMERCIAL = ['LECO', 'LEST', 'LEVX'] as const;
/** Months of history requested (enough for a 12-month total despite Eurostat's lag). */
const HISTORY_MONTHS = 24;
export const PAD = 0.05;

export interface Raw {
  csv: Buffer;
  eurostat: unknown;
}

/** Eurostat query: total passengers carried, all schedules and coverages, monthly. */
export function eurostatUrl(now: Date): string {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - HISTORY_MONTHS, 1));
  const p = new URLSearchParams({
    format: 'JSON',
    lang: 'EN',
    freq: 'M',
    unit: 'PAS',
    tra_meas: 'PAS_CRD',
    schedule: 'TOTAL',
    tra_cov: 'TOTAL',
  });
  for (const icao of COMMERCIAL) p.append('rep_airp', `ES_${icao}`);
  p.append('sinceTimePeriod', since.toISOString().slice(0, 7));
  return `${EUROSTAT_BASE}?${p.toString()}`;
}

/** Minimal RFC 4180 line parser (OurAirports quotes text fields). */
export function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Call onLine for each line of a buffer, decoding only the lines that pass `keep`. */
export function forEachLine(
  buf: Buffer,
  onLine: (line: string, index: number) => void,
  keep: (raw: Buffer) => boolean,
): void {
  let start = 0;
  let index = 0;
  while (start < buf.length) {
    let end = buf.indexOf(10, start);
    if (end < 0) end = buf.length;
    const raw = buf.subarray(start, end > start && buf[end - 1] === 13 ? end - 1 : end);
    if (index === 0 || keep(raw)) onLine(raw.toString('utf8'), index);
    start = end + 1;
    index++;
  }
}

const TIPO: Record<string, string> = {
  large_airport: 'grande',
  medium_airport: 'mediano',
  small_airport: 'pequeno',
  heliport: 'heliporto',
  seaplane_base: 'hidroaeroporto',
  balloonport: 'globos',
};

const COLUMNS = [
  'ident',
  'type',
  'name',
  'latitude_deg',
  'longitude_deg',
  'elevation_ft',
  'iso_region',
  'municipality',
  'scheduled_service',
  'icao_code',
  'iata_code',
] as const;

export interface Airport {
  ident: string;
  icao: string | null;
  iata: string | null;
  nome: string;
  tipo: string;
  lat: number;
  lon: number;
  elevacion_m: number | null;
  localidade: string | null;
  servizo_regular: boolean;
}

export function readAirports(csv: Buffer): Airport[] {
  const marker = Buffer.from('ES-GA');
  let idx: number[] | null = null;
  const out: Airport[] = [];
  forEachLine(
    csv,
    (line, i) => {
      const v = parseCsvLine(line);
      if (i === 0) {
        const header = v.map((h) => h.trim().replace(/^﻿/, ''));
        idx = COLUMNS.map((c) => {
          const k = header.indexOf(c);
          if (k < 0) throw new Error(`airports.csv: missing column "${c}"`);
          return k;
        });
        return;
      }
      if (!idx) return;
      const [ident, type, name, lat, lon, elev, region, municipality, scheduled, icao, iata] =
        idx.map((k) => (v[k] ?? '').trim()) as string[];
      if (region !== 'ES-GA' || type === 'closed' || !ident) return;
      const la = Number(lat);
      const lo = Number(lon);
      if (!lat || !lon || !Number.isFinite(la) || !Number.isFinite(lo)) return;
      if (!inGalicia(lo, la, PAD)) return;
      const ft = elev === '' ? Number.NaN : Number(elev);
      out.push({
        ident: ident as string,
        icao: icao || null,
        iata: iata || null,
        nome: name || (ident as string),
        tipo: TIPO[type as string] ?? (type as string),
        lat: la,
        lon: lo,
        elevacion_m: Number.isFinite(ft) ? Math.round(ft * 0.3048) : null,
        localidade: municipality || null,
        servizo_regular: scheduled === 'yes',
      });
    },
    (raw) => raw.includes(marker),
  );
  if (idx === null) throw new Error('airports.csv: empty file');
  return out;
}

export interface Passengers {
  mes: number;
  periodo: string;
  ultimos12: number | null;
}

interface JsonStat {
  id: string[];
  size: number[];
  value: Record<string, number | null> | Array<number | null>;
  updated?: string;
  dimension: Record<string, { category: { index: Record<string, number> | string[] } }>;
}

const FIXED: Record<string, string> = {
  freq: 'M',
  unit: 'PAS',
  tra_meas: 'PAS_CRD',
  schedule: 'TOTAL',
  tra_cov: 'TOTAL',
};

function categoryIndex(ds: JsonStat, dim: string): Map<string, number> {
  const idx = ds.dimension[dim]?.category?.index;
  if (!idx) throw new Error(`Eurostat: missing dimension ${dim}`);
  return new Map(Array.isArray(idx) ? idx.map((c, i) => [c, i]) : Object.entries(idx));
}

/** Latest monthly total per airport (keyed by ICAO) from a JSON-stat 2.0 dataset. */
export function readPassengers(raw: unknown): {
  byIcao: Map<string, Passengers>;
  updated: string | null;
} {
  const ds = raw as JsonStat | null;
  if (
    !ds ||
    !Array.isArray(ds.id) ||
    !Array.isArray(ds.size) ||
    ds.id.length !== ds.size.length ||
    typeof ds.dimension !== 'object' ||
    ds.value === null ||
    typeof ds.value !== 'object'
  ) {
    throw new Error('Unexpected Eurostat response: not JSON-stat 2.0');
  }
  const strides = ds.size.map((_, i) => ds.size.slice(i + 1).reduce((a, b) => a * b, 1));
  const pos: number[] = ds.id.map((dim) => {
    if (dim === 'rep_airp' || dim === 'time') return -1;
    const want = FIXED[dim];
    const cats = categoryIndex(ds, dim);
    const p = want === undefined ? 0 : cats.get(want);
    if (p === undefined) throw new Error(`Eurostat: no ${dim}=${want}`);
    return p;
  });
  const airports = categoryIndex(ds, 'rep_airp');
  const times = [...categoryIndex(ds, 'time').entries()].sort((a, b) => a[1] - b[1]);
  const ai = ds.id.indexOf('rep_airp');
  const ti = ds.id.indexOf('time');
  const value = (i: number): number | null => {
    const v = Array.isArray(ds.value) ? ds.value[i] : ds.value[String(i)];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const byIcao = new Map<string, Passengers>();
  for (const [code, a] of airports) {
    const series = times.map(([period, t]) => {
      let flat = 0;
      pos.forEach((p, d) => {
        flat += (d === ai ? a : d === ti ? t : p) * (strides[d] as number);
      });
      return { period, v: value(flat) };
    });
    let last = -1;
    for (let k = series.length - 1; k >= 0; k--) {
      if (series[k]?.v !== null) {
        last = k;
        break;
      }
    }
    if (last < 0) continue;
    const window = series.slice(Math.max(0, last - 11), last + 1);
    const complete = window.length === 12 && window.every((s) => s.v !== null);
    byIcao.set(code.replace(/^ES_/, ''), {
      mes: series[last]?.v as number,
      periodo: series[last]?.period as string,
      ultimos12: complete ? window.reduce((sum, s) => sum + (s.v as number), 0) : null,
    });
  }
  return { byIcao, updated: toIso(ds.updated) };
}

/** "2026-10-21T23:00:00+0200" -> ISO UTC (the offset has no colon). */
function toIso(s: string | undefined): string | null {
  if (!s) return null;
  const ms = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const adapter = {
  async fetch(ctx: AdapterContext) {
    const csv = await ctx.get(AIRPORTS_URL, { timeoutMs: 180_000 });
    const eurostat = await ctx.get(eurostatUrl(ctx.now), {
      headers: { accept: 'application/json' },
    });
    return { csv: csv.body, eurostat: JSON.parse(eurostat.body.toString('utf8')) };
  },

  normalize(raw, _ctx) {
    if (!Buffer.isBuffer(raw.csv)) throw new Error('airports.csv: no body');
    const airports = readAirports(raw.csv);
    const { byIcao, updated } = readPassengers(raw.eurostat);

    const features: Feature[] = airports.map((a) => {
      const pax = a.icao ? byIcao.get(a.icao) : undefined;
      return {
        type: 'Feature',
        id: a.ident,
        geometry: point(a.lon, a.lat),
        properties: {
          id: a.ident,
          icao: a.icao,
          iata: a.iata,
          nome: a.nome,
          tipo: a.tipo,
          localidade: a.localidade,
          elevacion_m: a.elevacion_m,
          servizo_regular: a.servizo_regular,
          pasaxeiros_mes: pax?.mes ?? null,
          pasaxeiros_periodo: pax?.periodo ?? null,
          pasaxeiros_12_meses: pax?.ultimos12 ?? null,
          fonte_url: `https://ourairports.com/airports/${encodeURIComponent(a.ident)}/`,
        },
      };
    });

    return { collection: { type: 'FeatureCollection', features }, publishedAt: updated };
  },
} satisfies Adapter<Raw>;

export default adapter;
