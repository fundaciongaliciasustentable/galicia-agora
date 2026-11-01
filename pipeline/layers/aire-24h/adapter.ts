// Air quality over the last 24 hours at every station of the Galician network that reports an
// index (ICA), refreshed every hour. Feeds /pulso/aire/.
//
// jsonEvolucionIcaEstacion gives, per station, the ICA and the value of each pollutant for the
// last ~34 hours (checked on 1/11/2026); one request per station, spaced out because
// MeteoGalicia blocks busy IPs. Times are local («fecha» without offset, Europe/Madrid).
// Readings are real-time and not validated yet (flag T): the page says so.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { madridToIso, point, round } from '../../lib/adapter.ts';

export const BASE = 'https://servizos.meteogalicia.gal/mgrss/caire';
export const STATIONS_URL = `${BASE}/jsonEstacionesCaire.action`;
export const ICA_URL = `${BASE}/jsonICAActual.action`;
export const evolutionUrl = (id: number) =>
  `${BASE}/jsonEvolucionIcaEstacion.action?idEstacion=${id}`;
const HOURS = 24;
const DEFAULT_PAUSE_MS = 500;
/** Pollutants kept, by the name the service uses. */
export const POLLUTANTS = { NO2: 'no2', O3: 'o3', PM10: 'pm10', PM25: 'pm25', SO2: 'so2' } as const;

interface Instant {
  fecha: string;
  ica: number;
  maximo: string;
  parametros?: Array<{ nombre: string; valor: number }>;
}
interface StationMeta {
  idEstacion: number;
  nombre: string;
  concello: string;
  latitud: string;
  longitud: string;
  tipo: string;
  tipoArea: string;
}

export interface Raw {
  stations: StationMeta[];
  withIca: number[];
  evolution: Record<string, Instant[]>;
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const stations = (
      JSON.parse((await ctx.get(STATIONS_URL)).body.toString('utf8')) as {
        estaciones: StationMeta[];
      }
    ).estaciones;
    const icas = (
      JSON.parse((await ctx.get(ICA_URL)).body.toString('utf8')) as {
        icas: Array<{ idEstacion: number }>;
      }
    ).icas;
    const withIca = icas.map((i) => i.idEstacion);
    const pause = Number(ctx.env.GA_PAUSE_MS ?? DEFAULT_PAUSE_MS);
    const evolution: Raw['evolution'] = {};
    for (const id of withIca) {
      const body = (await ctx.get(evolutionUrl(id))).body.toString('utf8');
      evolution[String(id)] = body.trimStart().startsWith('{')
        ? ((JSON.parse(body) as { evolucion?: Instant[] }).evolucion ?? [])
        : [];
      if (pause > 0) await new Promise((r) => setTimeout(r, pause));
    }
    return { stations, withIca, evolution };
  },

  normalize(raw: Raw) {
    const toMs = (fecha: string) => Date.parse(madridToIso(fecha));
    let end = 0;
    for (const list of Object.values(raw.evolution))
      for (const i of list) end = Math.max(end, toMs(i.fecha));
    if (end === 0) throw new Error('No air-quality readings');
    const start = end - (HOURS - 1) * 3600_000;
    const meta = new Map(raw.stations.map((s) => [s.idEstacion, s]));
    const features: Feature[] = [];
    for (const id of raw.withIca) {
      const s = meta.get(id);
      const list = raw.evolution[String(id)] ?? [];
      if (!s || list.length === 0) continue;
      const empty = () => Array(HOURS).fill(null) as Array<number | null>;
      const ica = empty();
      const dominant = Array(HOURS).fill(null) as Array<string | null>;
      const values = Object.fromEntries(
        Object.values(POLLUTANTS).map((k) => [k, empty()]),
      ) as Record<string, Array<number | null>>;
      for (const inst of list) {
        const i = Math.round((toMs(inst.fecha) - start) / 3600_000);
        if (i < 0 || i >= HOURS) continue;
        ica[i] = round(inst.ica, 2);
        dominant[i] = inst.maximo || null;
        for (const p of inst.parametros ?? []) {
          const k = POLLUTANTS[p.nombre as keyof typeof POLLUTANTS];
          if (k) (values[k] as Array<number | null>)[i] = round(p.valor, 1);
        }
      }
      features.push({
        type: 'Feature',
        id,
        geometry: point(Number(s.longitud), Number(s.latitud)),
        properties: {
          id,
          nome: s.nombre,
          concello: s.concello,
          tipo: s.tipo,
          area: s.tipoArea,
          inicio: new Date(start).toISOString(),
          ica,
          dominante: dominant,
          ...values,
          ica_max: Math.max(...(ica.filter((v) => v !== null) as number[]), 0),
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
