// The weather of one day, hour by hour, at every MeteoGalicia station: the reference day of the
// pulse series (Wednesday 21 May 2025, one of the four Wednesdays of the mobility maps). Feeds
// /pulso/tempo/.
//
// The historical hourly service takes one station and at most 12 hours per request, in UTC.
// A local day (Europe/Madrid, 00:00–24:00) is therefore two requests per station starting at
// 22:00 UTC the day before in summer time: about 310 requests, spaced out because MeteoGalicia
// blocks IPs that send many requests (notice of 17/09/2026). The layer is static: it runs once
// a year at most.
//
// Values with a validation code other than 1 (validated), and -9999, become null: no data is
// ever shown as a reading.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { madridToIso, point, round } from '../../lib/adapter.ts';

export const BASE = 'https://servizos.meteogalicia.gal/mgrss/observacion';
export const STATIONS_URL = `${BASE}/listaEstacionsMeteo.action`;
export const DAY = '2025-05-21';
const DEFAULT_PAUSE_MS = 500;

/** Parameters kept, with the output field each one fills. Wind falls back to the 2 m mast. */
export const PARAMS = {
  ta: ['TA_AVG_1.5m'],
  pp: ['PP_SUM_1.5m'],
  hr: ['HR_AVG_1.5m'],
  vv: ['VV_AVG_10m', 'VV_AVG_2m'],
  dv: ['DV_AVG_10m', 'DV_AVG_2m'],
  rs: ['RS_AVG_1.5m'],
} as const;
export type Field = keyof typeof PARAMS;

interface Measure {
  codigoParametro: string;
  valor: number;
  lnCodigoValidacion: number;
}
interface HourlyResponse {
  listHorarios?: Array<{
    idEstacion: number;
    listaInstantes: Array<{ instanteLecturaUTC: string; listaMedidas: Measure[] }>;
  }>;
}
interface Station {
  idEstacion: number;
  estacion: string;
  concello: string;
  provincia: string;
  lat: number;
  lon: number;
  altitude: number;
}

export interface Raw {
  stations: Station[];
  /** Station id → the hourly responses of its two windows. */
  hourly: Record<string, HourlyResponse[]>;
}

/** The two 12-hour UTC windows that cover a local day, as dataIni values (DD/MM/YYYY HH:MM). */
export function windows(localDay: string): string[] {
  const start = new Date(madridToIso(`${localDay} 00:00`));
  const fmt = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
  return [fmt(start), fmt(new Date(start.getTime() + 12 * 3600_000))];
}

export function hourlyUrl(station: number, dataIni: string): string {
  return `${BASE}/datosHorariosEstacions.action?${new URLSearchParams({ dataIni, numHoras: '12', idEst: String(station) })}`;
}

const LOCAL_HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  hourCycle: 'h23',
  hour: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Local (Europe/Madrid) date and hour of a UTC instant without offset. */
export function localHour(utc: string): { day: string; hour: number } {
  const parts = Object.fromEntries(
    LOCAL_HOUR.formatToParts(new Date(`${utc}Z`)).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** 24 local hours per field for one station; null where there is no validated reading. */
export function stationHours(
  responses: HourlyResponse[],
  id: number,
  localDay: string,
): Record<Field, Array<number | null>> {
  const out = Object.fromEntries(
    Object.keys(PARAMS).map((k) => [k, Array(24).fill(null)]),
  ) as Record<Field, Array<number | null>>;
  for (const res of responses) {
    for (const h of res.listHorarios ?? []) {
      if (h.idEstacion !== id) continue;
      for (const inst of h.listaInstantes) {
        const { day, hour } = localHour(inst.instanteLecturaUTC);
        if (day !== localDay) continue;
        for (const [field, codes] of Object.entries(PARAMS) as Array<[Field, readonly string[]]>) {
          if (out[field][hour] !== null) continue;
          for (const code of codes) {
            const m = inst.listaMedidas.find((x) => x.codigoParametro === code);
            if (m && m.lnCodigoValidacion === 1 && m.valor !== -9999) {
              out[field][hour] = round(
                m.valor,
                field === 'pp' ? 1 : field === 'dv' || field === 'rs' || field === 'hr' ? 0 : 1,
              );
              break;
            }
          }
        }
      }
    }
  }
  return out;
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const list = JSON.parse((await ctx.get(STATIONS_URL)).body.toString('utf8')) as {
      listaEstacionsMeteo: Station[];
    };
    const stations = list.listaEstacionsMeteo;
    const pause = Number(ctx.env.GA_PAUSE_MS ?? DEFAULT_PAUSE_MS);
    const hourly: Raw['hourly'] = {};
    for (const s of stations) {
      const responses: HourlyResponse[] = [];
      for (const w of windows(DAY)) {
        const res = await ctx.get(hourlyUrl(s.idEstacion, w));
        const text = res.body.toString('utf8');
        // The service answers some failures with an HTML page and status 200.
        if (!text.trimStart().startsWith('<')) responses.push(JSON.parse(text) as HourlyResponse);
        if (pause > 0) await new Promise((r) => setTimeout(r, pause));
      }
      hourly[String(s.idEstacion)] = responses;
    }
    return { stations, hourly };
  },

  normalize(raw: Raw) {
    const features: Feature[] = [];
    for (const s of raw.stations) {
      const hours = stationHours(raw.hourly[String(s.idEstacion)] ?? [], s.idEstacion, DAY);
      // A station without a single temperature reading that day is left out.
      if (hours.ta.every((v) => v === null)) continue;
      features.push({
        type: 'Feature',
        id: s.idEstacion,
        geometry: point(s.lon, s.lat),
        properties: {
          id: s.idEstacion,
          nome: s.estacion,
          concello: s.concello,
          provincia: s.provincia,
          altitude: s.altitude,
          dia: DAY,
          ...hours,
          ta_max: Math.max(...(hours.ta.filter((v) => v !== null) as number[])),
          ta_min: Math.min(...(hours.ta.filter((v) => v !== null) as number[])),
          pp_total: round(
            (hours.pp.filter((v) => v !== null) as number[]).reduce((a, b) => a + b, 0),
            1,
          ),
        },
      });
    }
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: madridToIso(`${DAY} 23:59`),
    };
  },
};

export default adapter;
