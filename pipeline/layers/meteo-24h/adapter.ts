// The last 24 hours of weather at every MeteoGalicia station, refreshed every hour. Feeds the
// «Últimas 24 horas» mode of /pulso/tempo/, beside the fixed reference day of meteo-dia.
//
// One request gives every station's last N hourly readings (ultimosHorariosEstacions, checked
// on 1/11/2026: 155 stations, 24 instants, ~5 MB), so this layer costs one call an hour and
// never the per-station requests MeteoGalicia's IP blocking punishes.
//
// The window is the 24 hours that end at the newest instant any station reports; each station
// gets 24 values in time order (null where it has no validated reading), and the window start
// is published so the page can label local hours.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { point, round } from '../../lib/adapter.ts';
import {
  BASE,
  type Field,
  type Measure,
  PARAMS,
  pick,
  STATIONS_URL,
  type Station,
} from '../meteo-dia/adapter.ts';

export const LATEST_URL = `${BASE}/ultimosHorariosEstacions.action?numHoras=24`;
const HOURS = 24;

interface Latest {
  listHorarios?: Array<{
    idEstacion: number;
    listaInstantes: Array<{ instanteLecturaUTC: string; listaMedidas: Measure[] }>;
  }>;
}

export interface Raw {
  stations: Station[];
  latest: Latest;
}

const toMs = (utc: string) => Date.parse(`${utc}Z`);

/** Newest instant (UTC ms) reported by any station. */
export function windowEnd(latest: Latest): number | null {
  let end: number | null = null;
  for (const h of latest.listHorarios ?? [])
    for (const i of h.listaInstantes) {
      const t = toMs(i.instanteLecturaUTC);
      if (end === null || t > end) end = t;
    }
  return end;
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const [list, latest] = await Promise.all([
      ctx.get(STATIONS_URL),
      ctx.get(LATEST_URL, { timeoutMs: 120_000 }),
    ]);
    return {
      stations: (JSON.parse(list.body.toString('utf8')) as { listaEstacionsMeteo: Station[] })
        .listaEstacionsMeteo,
      latest: JSON.parse(latest.body.toString('utf8')) as Latest,
    };
  },

  normalize(raw: Raw) {
    const end = windowEnd(raw.latest);
    if (end === null) throw new Error('MeteoGalicia returned no hourly readings');
    const start = end - (HOURS - 1) * 3600_000;
    const byId = new Map((raw.latest.listHorarios ?? []).map((h) => [h.idEstacion, h]));
    const features: Feature[] = [];
    for (const s of raw.stations) {
      const h = byId.get(s.idEstacion);
      if (!h) continue;
      const hours = Object.fromEntries(
        Object.keys(PARAMS).map((k) => [k, Array(HOURS).fill(null)]),
      ) as Record<Field, Array<number | null>>;
      for (const inst of h.listaInstantes) {
        const i = Math.round((toMs(inst.instanteLecturaUTC) - start) / 3600_000);
        if (i < 0 || i >= HOURS) continue;
        for (const field of Object.keys(PARAMS) as Field[])
          hours[field][i] = pick(inst.listaMedidas, field);
      }
      const ta = hours.ta.filter((v): v is number => v !== null);
      if (ta.length === 0) continue;
      const pp = hours.pp.filter((v): v is number => v !== null);
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
          inicio: new Date(start).toISOString(),
          ...hours,
          ta_max: Math.max(...ta),
          ta_min: Math.min(...ta),
          pp_total: round(
            pp.reduce((a, b) => a + b, 0),
            1,
          ),
        },
      });
    }
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: new Date(end).toISOString(),
    };
  },
};

export default adapter;
