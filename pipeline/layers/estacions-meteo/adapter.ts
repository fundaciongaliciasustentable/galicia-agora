// MeteoGalicia weather stations: latest 10-minute observations.
// Exactly two requests per run (MeteoGalicia blocks IPs that poll inefficiently):
// one for all stations' readings, one for the station list (coordinates).

import { type Adapter, type Feature, point } from '../../lib/adapter.ts';

export const OBS_URL =
  'https://servizos.meteogalicia.gal/mgrss/observacion/ultimos10minEstacionsMeteo.action';
export const STATIONS_URL =
  'https://servizos.meteogalicia.gal/mgrss/observacion/listaEstacionsMeteo.action';

/** Readings older than this, relative to the newest reading in the response, are dropped. */
export const MAX_LAG_MS = 60 * 60_000;

interface Medida {
  codigoParametro: string;
  lnCodigoValidacion: number;
  valor: number;
}
interface Lectura {
  estacion: string;
  idEstacion: number;
  instanteLecturaUTC: string;
  listaMedidas: Medida[];
}
interface Estacion {
  idEstacion: number;
  estacion: string;
  concello: string;
  altitude: number;
  lat: number;
  lon: number;
}
export interface Raw {
  obs: unknown;
  stations: unknown;
}

// Output property -> source parameter codes, in order of preference.
const PARAMS: Record<string, string[]> = {
  temperatura: ['TA_AVG_1.5m'],
  humidade: ['HR_AVG_1.5m'],
  vento_velocidade: ['VV_AVG_10m', 'VV_AVG_2m'],
  vento_direccion: ['DV_AVG_10m', 'DV_AVG_2m'],
  refacho: ['VV_RACHA_10m', 'VV_RACHA_2m'],
  chuvia_10min: ['PP_SUM_1.5m'],
  presion: ['PRED_AVG_1.5m'], // reduced to sea level, comparable between stations
};

// Validation codes. The service documentation (JSON_ultimos10min_gl.pdf) does not define
// lnCodigoValidacion. Observed on 2026-10-18: 1 on ~97 % of values; 9 always with the
// -9999 "no data" sentinel; 2 and 3 on a few plausible and some implausible values.
// Policy: 1 is kept; 9 or -9999 is dropped; any other code keeps the value and adds
// <field>_cod so the interface can flag it.
const VALID = 1;
const NO_DATA = 9;

/** instanteLecturaUTC is UTC without a zone designator ("2026-10-18T07:30:00"). */
export function utcToIso(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    throw new Error(`Unexpected instanteLecturaUTC: ${s}`);
  }
  return new Date(`${s}Z`).toISOString();
}

function list<T>(raw: unknown, key: string): T[] {
  const v = (raw as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(v)) throw new Error(`Unexpected response: missing array "${key}"`);
  return v as T[];
}

const adapter = {
  async fetch(ctx) {
    const obs = await ctx.get(OBS_URL);
    const stations = await ctx.get(STATIONS_URL);
    return {
      obs: JSON.parse(obs.body.toString('utf8')),
      stations: JSON.parse(stations.body.toString('utf8')),
    };
  },

  normalize(raw, _ctx) {
    const lecturas = list<Lectura>(raw.obs, 'listUltimos10min');
    const estacions = new Map(
      list<Estacion>(raw.stations, 'listaEstacionsMeteo').map((e) => [e.idEstacion, e]),
    );

    const times = lecturas.map((l) => Date.parse(utcToIso(l.instanteLecturaUTC)));
    const newest = times.length ? Math.max(...times) : 0;

    const features: Feature[] = [];
    let published = 0;
    lecturas.forEach((l, i) => {
      const t = times[i] as number;
      if (newest - t > MAX_LAG_MS) return;
      const e = estacions.get(l.idEstacion);
      // Stations missing from the list have no coordinates: skip them.
      if (!e || typeof e.lat !== 'number' || typeof e.lon !== 'number') return;

      const byCode = new Map((l.listaMedidas ?? []).map((m) => [m.codigoParametro, m]));
      const props: Record<string, unknown> = {
        id: l.idEstacion,
        nome: e.estacion || l.estacion,
        concello: e.concello,
        altitude: e.altitude,
        data_medida: new Date(t).toISOString(),
      };
      for (const [field, codes] of Object.entries(PARAMS)) {
        for (const code of codes) {
          const m = byCode.get(code);
          if (!m || typeof m.valor !== 'number') continue;
          if (m.lnCodigoValidacion === NO_DATA || m.valor <= -9999) continue;
          props[field] = m.valor;
          if (m.lnCodigoValidacion !== VALID) props[`${field}_cod`] = m.lnCodigoValidacion;
          if (field === 'vento_velocidade') props.vento_altura_m = code.endsWith('_2m') ? 2 : 10;
          break;
        }
      }
      features.push({
        type: 'Feature',
        id: l.idEstacion,
        geometry: point(e.lon, e.lat),
        properties: props,
      });
      published = Math.max(published, t);
    });

    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: published ? new Date(published).toISOString() : null,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
