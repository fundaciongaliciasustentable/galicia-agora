// Galicia en liñas, animated: the same ridgelines as galicia-linas (80 parallels from north to
// south), but as a sequence of frames the /linas/ page plays in turn. Three sequences:
//
// - seculo: population in each census from 1900 to 2021 (poboacion-seculo), spread inside each
//   concello by the population of its places today (entidades-poboacion), so it shows how the
//   concellos changed, not how people moved within one;
// - raios: lightning strikes over Galicia month by month (raios-ano, last twelve months);
// - lume: burnt area year by year (historial-queimados).
//
// Half the columns of the posters (smooth enough for motion, half the bytes). Every frame of a
// sequence shares one scale, so growth and decline show; heights in square root, 0–255, base64.

import { readFile } from 'node:fs/promises';
import type {
  Adapter,
  AdapterContext,
  Feature,
  FeatureCollection,
  PublishedLayer,
} from '../../lib/adapter.ts';
import { OUTLINE_FILE } from '../../satelite/outline.ts';
import { centroid, crossings, Mask, ROWS, ringsOf, splat } from '../galicia-linas/adapter.ts';

export const INPUTS = [
  'poboacion-seculo',
  'galicia-deformada',
  'entidades-poboacion',
  'raios-ano',
  'historial-queimados',
] as const;
export type InputId = (typeof INPUTS)[number];
export type Raw = Record<InputId, PublishedLayer> & { outline: string };

export const COLS = 280;
const KM_PER_DEG = 111.19;
const KX = KM_PER_DEG * Math.cos((42.8 * Math.PI) / 180);

export interface Sequence {
  id: string;
  frames: string[];
  totals: number[];
  unidade: string;
  fonte: string;
  grids: Float64Array[];
}

const blank = () => new Float64Array(ROWS * COLS);

export function build(raw: Raw): Sequence[] {
  const outline = JSON.parse(raw.outline) as { features: Feature[] };
  const mask = new Mask(outline.features.flatMap((f) => ringsOf(f.geometry)));

  // Places with a population, per concello, and a centroid for concellos without any.
  const places = new Map<string, Array<[number, number, number]>>();
  for (const f of raw['entidades-poboacion'].collection.features) {
    const pop = Number(f.properties.poboacion);
    if (!(pop > 0) || f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const code = String(f.properties.codigo_ine);
    places.set(code, [...(places.get(code) ?? []), [lon, lat, pop]]);
  }
  const centres = new Map<string, [number, number] | null>();
  for (const f of raw['galicia-deformada'].collection.features) {
    centres.set(String(f.properties.codigo_ine), centroid(f.geometry));
  }
  const spread = (grid: Float64Array, code: string, value: number) => {
    const list = places.get(code);
    const sum = list?.reduce((s, [, , w]) => s + w, 0) ?? 0;
    if (list && sum > 0) {
      for (const [lon, lat, w] of list) splat(grid, lon, lat, (value * w) / sum, undefined, COLS);
    } else {
      const c = centres.get(code);
      if (c) splat(grid, c[0], c[1], value, undefined, COLS);
    }
  };

  const out: Sequence[] = [];

  // A century of censuses.
  {
    const rows = raw['poboacion-seculo'].collection.features.map((f) => f.properties);
    const censuses = (rows[0]?.censos as number[] | undefined) ?? [];
    if (censuses.length === 0) throw new Error('poboacion-seculo has no censuses');
    const grids = censuses.map(blank);
    const totals = censuses.map(() => 0);
    for (const p of rows) {
      const pops = p.poboacion as Array<number | null>;
      censuses.forEach((_, i) => {
        const v = pops[i] ?? 0;
        if (v > 0) {
          spread(grids[i] as Float64Array, String(p.codigo_ine), v);
          totals[i] = (totals[i] as number) + v;
        }
      });
    }
    out.push({
      id: 'seculo',
      frames: censuses.map(String),
      totals,
      unidade: 'persoas',
      fonte: 'INE (censos 1900–2021)',
      grids,
    });
  }

  // Lightning, month by month.
  {
    const byMonth = new Map<string, Float64Array>();
    const totals = new Map<string, number>();
    let from = '';
    for (const f of raw['raios-ano'].collection.features) {
      const p = f.properties;
      from ||= String(p.periodo_inicio ?? '');
      const month = String(p.dia).slice(0, 7);
      const grid = byMonth.get(month) ?? blank();
      byMonth.set(month, grid);
      const lats = p.lat as number[];
      (p.lon as number[]).forEach((lon, i) => {
        const lat = lats[i] as number;
        if (!mask.has(lon, lat)) return;
        splat(grid, lon, lat, 1, 3, COLS);
        totals.set(month, (totals.get(month) ?? 0) + 1);
      });
    }
    // Every month of the period, also the ones without strikes.
    const months: string[] = [];
    if (from) {
      const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
      for (let i = 0; i < 12; i++) {
        months.push(d.toISOString().slice(0, 7));
        d.setUTCMonth(d.getUTCMonth() + 1);
      }
    }
    out.push({
      id: 'raios',
      frames: months,
      totals: months.map((m) => totals.get(m) ?? 0),
      unidade: 'raios',
      fonte: 'MeteoGalicia',
      grids: months.map((m) => byMonth.get(m) ?? blank()),
    });
  }

  // Fire, year by year: polygons sampled on a 0.4 km lattice.
  {
    const byYear = new Map<string, Float64Array>();
    const totals = new Map<string, number>();
    const step = 0.4 / KM_PER_DEG;
    const dlon = step * (KM_PER_DEG / KX);
    for (const f of raw['historial-queimados'].collection.features) {
      const rs = ringsOf(f.geometry);
      if (rs.length === 0) continue;
      const year = String(f.properties.ano);
      const grid = byYear.get(year) ?? blank();
      byYear.set(year, grid);
      totals.set(year, (totals.get(year) ?? 0) + Number(f.properties.area_ha ?? 0));
      let lat0 = Number.POSITIVE_INFINITY;
      let lat1 = Number.NEGATIVE_INFINITY;
      for (const r of rs)
        for (const [, y] of r) [lat0, lat1] = [Math.min(lat0, y), Math.max(lat1, y)];
      for (let lat = lat0 + step / 2; lat < lat1; lat += step) {
        const xs = crossings(rs, lat);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          for (let lon = (xs[k] as number) + dlon / 2; lon < (xs[k + 1] as number); lon += dlon) {
            splat(grid, lon, lat, 0.16, 2, COLS);
          }
        }
      }
    }
    const years = [...byYear.keys()].sort();
    // Fill the years without large fires in between.
    const all: string[] = [];
    for (let y = Number(years[0]); y <= Number(years[years.length - 1]); y++) all.push(String(y));
    out.push({
      id: 'lume',
      frames: all,
      totals: all.map((y) => Math.round(totals.get(y) ?? 0)),
      unidade: 'hectáreas',
      fonte: 'Copernicus EFFIS (JRC)',
      grids: all.map((y) => byYear.get(y) ?? blank()),
    });
  }
  return out;
}

/** 0–255 square-root heights, one scale per sequence, base64 per frame. */
export function encode(seq: Sequence): string[] {
  const shaped = seq.grids.map((g) => g.map(Math.sqrt));
  const top = Math.max(...shaped.map((g) => g.reduce((m, x) => Math.max(m, x), 0))) || 1;
  return shaped.map((g) =>
    Buffer.from(Uint8Array.from(g, (x) => Math.round((255 * x) / top))).toString('base64'),
  );
}

function inputsTime(raw: Raw): string | null {
  let max: number | null = null;
  for (const input of INPUTS) {
    const m = raw[input].meta;
    const t = Date.parse(m.published_at ?? m.last_success_at ?? '');
    if (Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  return max === null ? null : new Date(max).toISOString();
}

const adapter = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('galicia-linas-tempo needs ctx.readLayer (derived layer)');
    const raw = {} as Raw;
    for (const id of INPUTS) raw[id] = await ctx.readLayer(id);
    raw.outline = await readFile(OUTLINE_FILE, 'utf8');
    return raw;
  },

  normalize(raw) {
    const features: Feature[] = build(raw).map((seq, i) => ({
      type: 'Feature',
      id: seq.id,
      geometry: null,
      properties: {
        id: seq.id,
        orde: i,
        filas: ROWS,
        columnas: COLS,
        fotogramas: seq.frames,
        totais: seq.totals,
        unidade: seq.unidade,
        fonte: seq.fonte,
        perfis: encode(seq),
      },
    }));
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    return { collection, publishedAt: inputsTime(raw) };
  },
} satisfies Adapter<Raw>;

export default adapter;
