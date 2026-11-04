// The year of the maximum temperatures (/pulso/calor/): daily maximum temperature at 1.5 m of
// every MeteoGalicia station over the last complete calendar year, plus what the browser needs
// to draw a continuous field from them: a lon/lat grid over Galicia with the ground height of
// each cell (IGN MDT 1000 m) and, outside the IGN outline, no cell.
//
// The page interpolates by inverse distance the station values brought to sea level with a
// standard lapse rate (6.5 °C per km) and takes them back to each cell's height, so a valley
// comes out warmer than the hills around it even far from a station.
//
// Sources: datosDiariosEstacionsMeteo.action (open, one month of every station per request);
// station height and position from the estacions-meteo layer, or, for stations no longer
// listed there, their UTM 29N coordinates in the daily answer and the MDT height.

import { readFile } from 'node:fs/promises';
import type {
  Adapter,
  AdapterContext,
  Feature,
  FeatureCollection,
  PublishedLayer,
} from '../../lib/adapter.ts';
import { OUTLINE_FILE } from '../../satelite/outline.ts';
import { crossings, parseArcGrid, ringsOf } from '../galicia-linas/adapter.ts';

export const DAILY =
  'https://servizos.meteogalicia.gal/mgrss/observacion/datosDiariosEstacionsMeteo.action';
export const PARAM = 'TA_MAX_1.5m';
export const MDT_URL =
  'https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=Elevacion4258_1000&SUBSET=Lat(41.7,43.9)&SUBSET=Long(-9.5,-6.6)&FORMAT=ArcGrid';
export const GRID = { lon0: -9.36, lat0: 41.8, dlon: 0.02, dlat: 0.015, nx: 135, ny: 134 };
export const PAUSE_MS = 1500;

export type Raw = {
  year: number;
  months: string[];
  stations: PublishedLayer;
  mdt: string;
  outline: string;
};

interface Station {
  id: number;
  nome: string;
  concello: string;
  lon: number;
  lat: number;
  altitude: number | null;
  tmax: Array<number | null>;
}

/** UTM zone 29 N (ETRS89 ≈ WGS84) to lon/lat, Snyder's series. */
export function utm29ToLonLat(x: number, y: number): [number, number] {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;
  const lon0 = (-9 * Math.PI) / 180;
  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = ep2 * Math.cos(phi1) ** 2;
  const r1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const d = (x - 500000) / (n1 * k0);
  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      (d ** 2 / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24);
  const lon =
    lon0 +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5) / 120) /
      Math.cos(phi1);
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

const dayIndex = (year: number, iso: string) =>
  Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.UTC(year, 0, 1)) / 86_400_000);
const daysIn = (year: number) => (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;

interface DailyAnswer {
  listDatosDiarios?: Array<{
    data: string;
    listaEstacions?: Array<{
      idEstacion: number;
      estacion: string;
      concello: string;
      utmx: string;
      utmy: string;
      listaMedidas?: Array<{ codigoParametro: string; lnCodigoValidacion: number; valor: number }>;
    }>;
  }>;
}

export function build(raw: Raw): { features: Feature[]; grid: Record<string, unknown> } {
  const n = daysIn(raw.year);
  const known = new Map<number, Feature>();
  for (const f of raw.stations.collection.features) known.set(Number(f.properties.id), f);
  const mdt = parseArcGrid(raw.mdt);

  const stations = new Map<number, Station>();
  for (const text of raw.months) {
    const answer = JSON.parse(text) as DailyAnswer;
    for (const day of answer.listDatosDiarios ?? []) {
      const d = dayIndex(raw.year, day.data);
      if (d < 0 || d >= n) continue;
      for (const e of day.listaEstacions ?? []) {
        let s = stations.get(e.idEstacion);
        if (!s) {
          const f = known.get(e.idEstacion);
          const [lon, lat] = f?.geometry
            ? (f.geometry.coordinates as [number, number])
            : utm29ToLonLat(Number(e.utmx), Number(e.utmy));
          const alt = f ? Number(f.properties.altitude) : Number.NaN;
          s = {
            id: e.idEstacion,
            nome: e.estacion,
            concello: e.concello,
            lon,
            lat,
            altitude: Number.isFinite(alt) ? alt : Math.round(mdt.at(lon, lat, 0)),
            tmax: Array.from({ length: n }, () => null),
          };
          stations.set(e.idEstacion, s);
        }
        const m = e.listaMedidas?.find((x) => x.codigoParametro === PARAM);
        // Only validated values (code 1); -9999 means none.
        if (m && m.lnCodigoValidacion === 1 && m.valor > -50 && m.valor < 60) {
          s.tmax[d] = Math.round(m.valor * 10) / 10;
        }
      }
    }
  }

  // Grid: ground height of every cell inside Galicia, -1 outside.
  const outline = JSON.parse(raw.outline) as { features: Feature[] };
  const rings = outline.features.flatMap((f) => ringsOf(f.geometry));
  const heights = new Int16Array(GRID.nx * GRID.ny).fill(-1);
  for (let j = 0; j < GRID.ny; j++) {
    const lat = GRID.lat0 + (j + 0.5) * GRID.dlat;
    const xs = crossings(rings, lat);
    for (let i = 0; i < GRID.nx; i++) {
      const lon = GRID.lon0 + (i + 0.5) * GRID.dlon;
      if (xs.filter((x) => x < lon).length % 2 === 1) {
        heights[j * GRID.nx + i] = Math.max(0, Math.round(mdt.at(lon, lat, 0)));
      }
    }
  }

  const features: Feature[] = [...stations.values()]
    .filter((s) => s.tmax.some((v) => v !== null))
    .sort((a, b) => a.id - b.id)
    .map((s) => ({
      type: 'Feature',
      id: s.id,
      geometry: {
        type: 'Point',
        coordinates: [Math.round(s.lon * 1e5) / 1e5, Math.round(s.lat * 1e5) / 1e5],
      },
      properties: {
        id: s.id,
        nome: s.nome,
        concello: s.concello,
        altitude: s.altitude,
        ano: raw.year,
        tmax: s.tmax,
        dias_con_dato: s.tmax.filter((v) => v !== null).length,
      },
    }));
  return {
    features,
    grid: { ...GRID, alturas: Buffer.from(heights.buffer).toString('base64') },
  };
}

const adapter = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('tmax-ano needs ctx.readLayer');
    // The last complete calendar year.
    const year = ctx.now.getUTCFullYear() - 1;
    const months: string[] = [];
    for (let m = 1; m <= 12; m++) {
      const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
      const p = (x: number) => String(x).padStart(2, '0');
      const url = `${DAILY}?dataIni=${year}-${p(m)}-01&dataFin=${year}-${p(m)}-${p(last)}&idParam=${PARAM}`;
      if (m > 1)
        await new Promise((r) => setTimeout(r, Number(ctx.env.METEO_PAUSE_MS ?? PAUSE_MS)));
      months.push((await ctx.get(url, { timeoutMs: 180_000 })).body.toString('utf8'));
    }
    const mdt = (await ctx.get(MDT_URL, { timeoutMs: 120_000 })).body.toString('latin1');
    return {
      year,
      months,
      stations: await ctx.readLayer('estacions-meteo'),
      mdt,
      outline: await readFile(OUTLINE_FILE, 'utf8'),
    };
  },

  normalize(raw) {
    const { features, grid } = build(raw);
    // The grid travels on every feature would be wasteful: it goes on the first only.
    if (features[0]) features[0].properties.grella = grid;
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    return { collection, publishedAt: `${raw.year}-12-31T00:00:00Z` };
  },
} satisfies Adapter<Raw>;

export default adapter;
