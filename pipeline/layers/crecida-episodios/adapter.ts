// Floods, episode by episode (/pulso/crecida/): how the river flow rose and fell, hour by hour,
// at every gauging station, drawn along the rivers it measures, with the daily rain under it.
//
// Inputs:
// - the episodes kept by .github/workflows/aforos-episodio.yml in the data branch
//   (caudais-episodios/*.json: 10-minute flow and level of every station of caudais-rios);
// - the river water bodies of estado-masas-auga (Augas de Galicia), as the river network;
// - the daily rain of every MeteoGalicia station for the same days (open daily service) and
//   their positions (estacions-meteo).
//
// Per station: hourly mean flow and its ratio to the flow before the storm (median of the first
// BASE_H hours of the episode). Each river water body takes the station of the same river that
// is nearest to it; a water body whose river has no station is published with none and drawn
// unlit. Stations at the head of an estuary move with the tide (Padrón): flagged, never used to
// light a river.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Adapter,
  AdapterContext,
  Feature,
  FeatureCollection,
  PublishedLayer,
} from '../../lib/adapter.ts';

export const DAILY =
  'https://servizos.meteogalicia.gal/mgrss/observacion/datosDiariosEstacionsMeteo.action';
const FLOW = 'CAMed_AVG_0m';
export const BASE_H = 24;
/** Stations in the tidal reach (checked on the 2026 series: they follow the tide on dry days). */
export const TIDAL = new Set(['Ulla - Padrón', 'Sar - Padrón']);
/** Max distance (km) from a water body to a station of the same river. */
const MAX_KM = 40;

export interface Episode {
  inicio: string;
  fin: string;
  estacions: Array<{
    id: number;
    nome: string;
    concello: string;
    lon: number | null;
    lat: number | null;
    medidas: Record<string, Array<[string, number, number?]>>;
  }>;
}

export interface Raw {
  episodes: Array<{ file: string; episode: Episode; rain: string }>;
  rivers: PublishedLayer;
  meteo: PublishedLayer;
}

/** "Río Eume", "Eume - Monfero", "Rego de Campos, de Beneirón Ou Mesoiro" → comparable names. */
export function riverNames(s: string): string[] {
  return s
    .split(/,| ou | Ou | - /)
    .map((part) =>
      part
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/^(rio|rego|regato)\s+/, '')
        .replace(/^(de|do|da|dos|das)\s+/, '')
        .replace(/^(o|a|os|as)\s+/, '')
        .trim(),
    )
    .filter(Boolean);
}

const KX = Math.cos((43 * Math.PI) / 180);
const km = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * KX, a[1] - b[1]) * 111.19;

function linePoints(g: Feature['geometry']): Array<[number, number]> {
  if (g?.type === 'LineString') return g.coordinates as Array<[number, number]>;
  if (g?.type === 'MultiLineString')
    return (g.coordinates as Array<Array<[number, number]>>).flat();
  return [];
}

/** Hourly mean of 10-minute values from `start`, `hours` long (null where none). */
export function hourly(series: Array<[string, number, number?]>, start: number, hours: number) {
  const sum = new Float64Array(hours);
  const n = new Uint16Array(hours);
  for (const [t, v, code] of series) {
    // Validation codes other than 1 are kept by the episode file; drop the ones marked wrong (9).
    if (code === 9) continue;
    const h = Math.floor((Date.parse(`${t}Z`) - start) / 3_600_000);
    if (h < 0 || h >= hours) continue;
    sum[h] = (sum[h] as number) + v;
    n[h] = (n[h] as number) + 1;
  }
  return Array.from(sum, (s, h) =>
    (n[h] as number) ? Math.round((s / (n[h] as number)) * 1000) / 1000 : null,
  );
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? (s[s.length >> 1] as number) : null;
};

export function build(raw: Raw): Feature[] {
  const features: Feature[] = [];
  const meteoPos = new Map<number, [number, number]>();
  for (const f of raw.meteo.collection.features) {
    if (f.geometry?.type === 'Point')
      meteoPos.set(Number(f.properties.id), f.geometry.coordinates as [number, number]);
  }
  const rivers = raw.rivers.collection.features.filter((f) => f.properties.categoria === 'rio');

  for (const { file, episode, rain } of raw.episodes) {
    const id = file.replace(/\.json$/, '');
    const start = Date.parse(episode.inicio);
    const hours = Math.round((Date.parse(episode.fin) - start) / 3_600_000);
    const stations: Array<{ id: number; names: string[]; pos: [number, number]; tidal: boolean }> =
      [];

    for (const s of episode.estacions) {
      const flow = hourly(s.medidas[FLOW] ?? [], start, hours);
      const known = flow.filter((v): v is number => v !== null);
      if (s.lon === null || s.lat === null || known.length < hours / 2) continue;
      const base =
        median(flow.slice(0, BASE_H).filter((v): v is number => v !== null)) ?? median(known);
      const peak = Math.max(...known);
      const peakAt = flow.indexOf(peak);
      const tidal = TIDAL.has(s.nome.trim());
      stations.push({
        id: s.id,
        names: riverNames(s.nome.split(' - ')[0] ?? s.nome),
        pos: [s.lon, s.lat],
        tidal,
      });
      features.push({
        type: 'Feature',
        id: `${id}-${s.id}`,
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          tipo: 'estacion',
          episodio: id,
          inicio: episode.inicio,
          id: s.id,
          nome: s.nome.trim(),
          concello: s.concello,
          marea: tidal,
          caudal_base: base,
          caudal_pico: peak,
          hora_pico: new Date(start + peakAt * 3_600_000).toISOString(),
          caudal: flow,
          // Ratio to the flow before the storm, two decimals.
          razon: flow.map((v) =>
            v === null || !base ? null : Math.round((v / Math.max(base, 0.01)) * 100) / 100,
          ),
        },
      });
    }

    // Each river water body: the nearest non-tidal station of the same river.
    for (const r of rivers) {
      const names = riverNames(String(r.properties.nome));
      const pts = linePoints(r.geometry);
      let best: { id: number; d: number } | null = null;
      for (const s of stations) {
        if (s.tidal || !s.names.some((n) => names.includes(n))) continue;
        const d = Math.min(...pts.map((p) => km(p, s.pos)));
        if (d <= MAX_KM && (!best || d < best.d)) best = { id: s.id, d };
      }
      features.push({
        type: 'Feature',
        id: `${id}-${r.properties.codigo}`,
        geometry: r.geometry,
        properties: {
          tipo: 'rio',
          episodio: id,
          nome: r.properties.nome,
          codigo: r.properties.codigo,
          estacion: best?.id ?? null,
        },
      });
    }

    // Daily rain at every station, the days of the episode.
    const days = Math.ceil(hours / 24);
    const byStation = new Map<number, Array<number | null>>();
    const answer = JSON.parse(rain) as {
      listDatosDiarios?: Array<{
        data: string;
        listaEstacions?: Array<{
          idEstacion: number;
          listaMedidas?: Array<{
            codigoParametro: string;
            lnCodigoValidacion: number;
            valor: number;
          }>;
        }>;
      }>;
    };
    for (const d of answer.listDatosDiarios ?? []) {
      const k = Math.round((Date.parse(`${d.data.slice(0, 10)}T00:00:00Z`) - start) / 86_400_000);
      if (k < 0 || k >= days) continue;
      for (const e of d.listaEstacions ?? []) {
        const m = e.listaMedidas?.find((x) => x.codigoParametro === 'PP_SUM_1.5m');
        const list = byStation.get(e.idEstacion) ?? Array.from({ length: days }, () => null);
        if (m && m.lnCodigoValidacion === 1 && m.valor >= 0)
          list[k] = Math.round(m.valor * 10) / 10;
        byStation.set(e.idEstacion, list);
      }
    }
    for (const [sid, mm] of byStation) {
      const pos = meteoPos.get(sid);
      if (!pos || mm.every((v) => v === null)) continue;
      features.push({
        type: 'Feature',
        id: `${id}-choiva-${sid}`,
        geometry: { type: 'Point', coordinates: pos },
        properties: { tipo: 'choiva', episodio: id, id: sid, choiva_dia: mm },
      });
    }
  }
  return features;
}

const adapter = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('crecida-episodios needs ctx.readLayer');
    const dir = join(process.env.DATA_OUT_DIR ?? 'data-out', 'caudais-episodios');
    const files = (await readdir(dir).catch(() => [] as string[]))
      .filter((f) => f.endsWith('.json'))
      .sort();
    if (files.length === 0) throw new Error(`no episodes in ${dir}`);
    const episodes: Raw['episodes'] = [];
    for (const file of files) {
      const episode = JSON.parse(await readFile(join(dir, file), 'utf8')) as Episode;
      const from = episode.inicio.slice(0, 10);
      const to = new Date(Date.parse(episode.fin) - 1).toISOString().slice(0, 10);
      const rain = (
        await ctx.get(`${DAILY}?dataIni=${from}&dataFin=${to}&idParam=PP_SUM_1.5m`, {
          timeoutMs: 120_000,
        })
      ).body.toString('utf8');
      episodes.push({ file, episode, rain });
    }
    return {
      episodes,
      rivers: await ctx.readLayer('estado-masas-auga'),
      meteo: await ctx.readLayer('estacions-meteo'),
    };
  },

  normalize(raw) {
    const collection: FeatureCollection = { type: 'FeatureCollection', features: build(raw) };
    const last = raw.episodes[raw.episodes.length - 1]?.episode.fin ?? null;
    return { collection, publishedAt: last };
  },
} satisfies Adapter<Raw>;

export default adapter;
