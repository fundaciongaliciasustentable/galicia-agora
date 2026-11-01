// Attention each concello gets on Wikipedia: daily page views of its article in the Galician
// and the Spanish Wikipedia over the last year, for /pulso/atencion/. Source: Wikimedia
// Analytics API, per-article endpoint, agent `user` (known bots and automated traffic left
// out by Wikimedia), CC0. One request per article, one after the other as the access policy
// asks; ~630 requests a day.
//
// The concello ↔ article lookup (artigos.json) was read once from Wikidata, property P772
// (INE municipality code), with the gl and es sitelinks:
//   SELECT ?ine ?item ?gl ?es WHERE { ?item wdt:P772 ?ine . FILTER(REGEX(?ine, "^(15|27|32|36)[0-9]{3}$"))
//     OPTIONAL { ?gl schema:about ?item ; schema:isPartOf <https://gl.wikipedia.org/> }
//     OPTIONAL { ?es schema:about ?item ; schema:isPartOf <https://es.wikipedia.org/> } }
// 317 codes: the 313 concellos plus four that are not concellos today (Oza dos Ríos, Cesuras,
// Cotobade and 32500), left out. Redirects are not added: only the canonical title counts.
//
// Per concello: daily views (gl, es), and a spike index, the day's views against the median of
// the 28 days before (100 = an ordinary day). Where the concello's median is under 3 views a
// day the index is weekly: the week's views against the median of the four weeks before, so a
// handful of views does not read as a spike. The API leaves out days with no views (zero), and
// the newest day appears the day after; days after the newest one seen in any article are cut.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Adapter, AdapterContext, Feature, PublishedLayer } from '../../lib/adapter.ts';
import { round } from '../../lib/adapter.ts';
import { HttpError } from '../../lib/http.ts';

export const API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
/** Published days and the warm-up days before them (baseline of the first index). */
export const DAYS = 365;
export const WARMUP = 28;
/** Below this median of views a day the index is weekly. */
export const MIN_DAILY_MEDIAN = 3;

export interface Article {
  codigo_ine: string;
  wikidata: string;
  gl: string;
  es: string;
}

export interface Raw {
  articles: Article[];
  /** Views by day (YYYYMMDD) per concello code and wiki. */
  views: Record<string, { gl: Record<string, number>; es: Record<string, number> }>;
  start: string;
  end: string;
  population: PublishedLayer;
}

const day = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const parseDay = (s: string) =>
  new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));

export function articleUrl(wiki: 'gl' | 'es', title: string, start: string, end: string): string {
  const t = encodeURIComponent(title.replaceAll(' ', '_'));
  return `${API}/${wiki}.wikipedia/all-access/user/${t}/daily/${start}/${end}`;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/**
 * Spike index of each published day (from `WARMUP` on) of a daily series that starts on
 * `first` (a Date). Daily against the 28 days before, or weekly (Monday weeks) when the
 * published median is under MIN_DAILY_MEDIAN.
 */
export function spikeIndex(
  total: number[],
  first: Date,
  warmup = WARMUP,
): { grouping: 'dia' | 'semana'; index: Array<number | null> } {
  const published = total.slice(warmup);
  if (median(published) >= MIN_DAILY_MEDIAN) {
    const index = published.map((v, j) => {
      const i = j + warmup;
      const base = median(total.slice(Math.max(0, i - 28), i));
      return base > 0 ? Math.round((100 * v) / base) : null;
    });
    return { grouping: 'dia', index };
  }
  // Weeks from Monday; a week cut by the end of the series is scaled to seven days.
  const weekOf = (i: number) => {
    const dow = (addDays(first, i).getUTCDay() + 6) % 7;
    return Math.floor((i - dow + 6) / 7);
  };
  const sums = new Map<number, { sum: number; days: number }>();
  total.forEach((v, i) => {
    const w = weekOf(i);
    const s = sums.get(w) ?? { sum: 0, days: 0 };
    s.sum += v;
    s.days += 1;
    sums.set(w, s);
  });
  const full = (w: number) => {
    const s = sums.get(w);
    return s && s.days === 7 ? s.sum : null;
  };
  const index = published.map((_, j) => {
    const w = weekOf(j + warmup);
    const s = sums.get(w) as { sum: number; days: number };
    const prev = [w - 4, w - 3, w - 2, w - 1].map(full).filter((x): x is number => x !== null);
    if (prev.length < 3) return null;
    const base = median(prev);
    if (base < MIN_DAILY_MEDIAN) return null;
    return Math.round((100 * (s.sum * 7)) / s.days / base);
  });
  return { grouping: 'semana', index };
}

async function views(
  ctx: AdapterContext,
  wiki: 'gl' | 'es',
  title: string,
  start: string,
  end: string,
): Promise<Record<string, number>> {
  try {
    const res = await ctx.get(articleUrl(wiki, title, start, end), { timeoutMs: 30_000 });
    const items = (JSON.parse(res.body.toString('utf8')) as { items?: unknown[] }).items ?? [];
    const out: Record<string, number> = {};
    for (const it of items as Array<{ timestamp: string; views: number }>) {
      out[it.timestamp.slice(0, 8)] = it.views;
    }
    return out;
  } catch (err) {
    // 404: no views at all in the range (the API answers "not found" instead of zeros).
    if (err instanceof HttpError && err.status === 404) return {};
    throw err;
  }
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('atencion-wikipedia needs ctx.readLayer (population)');
    const articles = JSON.parse(
      await readFile(join(import.meta.dirname, 'artigos.json'), 'utf8'),
    ) as Article[];
    const yesterday = addDays(new Date(`${ctx.now.toISOString().slice(0, 10)}T00:00:00Z`), -1);
    const end = day(yesterday);
    const start = day(addDays(yesterday, -(DAYS + WARMUP - 1)));
    const out: Raw['views'] = {};
    // One request at a time: the access policy asks clients to wait for each answer.
    for (const a of articles) {
      out[a.codigo_ine] = {
        gl: await views(ctx, 'gl', a.gl, start, end),
        es: await views(ctx, 'es', a.es, start, end),
      };
    }
    return {
      articles,
      views: out,
      start,
      end,
      population: await ctx.readLayer('poboacion-seculo'),
    };
  },

  normalize(raw: Raw) {
    // The newest day any article has: later days are not published yet, not zeros.
    let last = '';
    for (const v of Object.values(raw.views)) {
      for (const d of [...Object.keys(v.gl), ...Object.keys(v.es)]) if (d > last) last = d;
    }
    if (!last) throw new Error('Wikimedia returned no page views at all');
    const lastDate = parseDay(last);
    const n = Math.round((lastDate.getTime() - parseDay(raw.start).getTime()) / 86_400_000) + 1;
    if (n < WARMUP + 7) throw new Error(`Only ${n} days of page views`);
    const first = parseDay(raw.start);
    const dates = Array.from({ length: n }, (_, i) => day(addDays(first, i)));
    const pop = new Map(
      raw.population.collection.features.map((f) => [
        String(f.properties.codigo_ine),
        {
          name: String(f.properties.nome),
          people: (f.properties.poboacion as Array<number | null>).at(-1) ?? null,
        },
      ]),
    );
    const published = dates.slice(WARMUP);
    const desde = `${published[0]?.slice(0, 4)}-${published[0]?.slice(4, 6)}-${published[0]?.slice(6, 8)}`;
    const features: Feature[] = raw.articles.map((a) => {
      const v = raw.views[a.codigo_ine] ?? { gl: {}, es: {} };
      const gl = dates.map((d) => v.gl[d] ?? 0);
      const es = dates.map((d) => v.es[d] ?? 0);
      const total = gl.map((x, i) => x + (es[i] as number));
      const { grouping, index } = spikeIndex(total, first);
      const p = pop.get(a.codigo_ine);
      const people = p?.people ?? null;
      const year = total.slice(WARMUP).reduce((s, x) => s + x, 0);
      return {
        type: 'Feature',
        id: a.codigo_ine,
        geometry: null,
        properties: {
          codigo_ine: a.codigo_ine,
          nome: p?.name ?? a.gl,
          wikidata: a.wikidata,
          artigo_gl: a.gl,
          artigo_es: a.es,
          desde,
          gl: gl.slice(WARMUP),
          es: es.slice(WARMUP),
          poboacion_2021: people,
          vistas_ano: year,
          vistas_ano_mil: people ? round((1000 * year) / people, 1) : null,
          agrupacion: grouping,
          valor: index,
        },
      };
    });
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: lastDate.toISOString(),
    };
  },
};

export default adapter;
