// Galician air quality network: current Air Quality Index (ICA) per station.
// Two requests per run: the ICA list and the station list (coordinates, concello).
// Data are provisional (not validated by the operator; flag "T" in the per-parameter feeds).

import { type Adapter, type Feature, madridToIso, point } from '../../lib/adapter.ts';

export const ICA_URL = 'https://servizos.meteogalicia.gal/mgrss/caire/jsonICAActual.action';
export const STATIONS_URL =
  'https://servizos.meteogalicia.gal/mgrss/caire/jsonEstacionesCaire.action';

interface Ica {
  idEstacion: number;
  estacion: string;
  fecha: string; // local Europe/Madrid, "2026-10-18 09:00"
  ica: number; // 0–6; -1 when there are no data
  icaGl: string;
  icaEs: string;
  maximo: string;
  color: string;
  latitud?: string;
  longitud?: string;
}
interface Estacion {
  idEstacion: number;
  nombre: string;
  concello?: string;
  latitud: string;
  longitud: string;
  tipo?: string;
}
export interface Raw {
  ica: unknown;
  stations: unknown;
}

function list<T>(raw: unknown, key: string): T[] {
  const v = (raw as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(v)) throw new Error(`Unexpected response: missing array "${key}"`);
  return v as T[];
}

function coord(s: string | undefined): number {
  return s === undefined || s === '' ? Number.NaN : Number(s);
}

const adapter = {
  async fetch(ctx) {
    const ica = await ctx.get(ICA_URL);
    const stations = await ctx.get(STATIONS_URL);
    return {
      ica: JSON.parse(ica.body.toString('utf8')),
      stations: JSON.parse(stations.body.toString('utf8')),
    };
  },

  normalize(raw, _ctx) {
    const icas = list<Ica>(raw.ica, 'icas');
    const estacions = new Map(
      list<Estacion>(raw.stations, 'estaciones').map((e) => [e.idEstacion, e]),
    );

    const features: Feature[] = [];
    let newest = 0;
    for (const r of icas) {
      const e = estacions.get(r.idEstacion);
      // Coordinates from the station list; the ICA feed carries its own as a fallback.
      let lat = coord(e?.latitud);
      let lon = coord(e?.longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        lat = coord(r.latitud);
        lon = coord(r.longitud);
      }
      // Parse the time first so a changed date format throws even for skipped rows.
      const dataMedida = madridToIso(r.fecha);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      newest = Math.max(newest, Date.parse(dataMedida));
      const props: Record<string, unknown> = {
        id: r.idEstacion,
        nome: e?.nombre || r.estacion,
        ica: typeof r.ica === 'number' && r.ica >= 0 ? r.ica : null,
        categoria_gl: r.icaGl,
        categoria_es: r.icaEs,
        contaminante: r.maximo,
        cor: r.color,
        data_medida: dataMedida,
      };
      if (e?.concello) props.concello = e.concello;
      if (e?.tipo) props.tipo = e.tipo;
      features.push({
        type: 'Feature',
        id: r.idEstacion,
        geometry: point(lon, lat),
        properties: props,
      });
    }

    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: newest ? new Date(newest).toISOString() : null,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
