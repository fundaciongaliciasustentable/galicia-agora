// Galicia in the news: how many online news articles mention each concello every day, and
// their average tone, from the GDELT DOC 2.0 API, for /pulso/noticias/. GDELT monitors news
// sites worldwide (with machine translation); we ask only for sources in Spain
// (`sourcecountry:spain`) with a hand-checked query per concello (consultas.json): concellos
// whose name is a common word, a frequent surname or another place are left out, each with
// its reason. In the provincial capitals the name also matches the province.
//
// GDELT asks for one request every 5 seconds and documents a 3-month window (it answers about
// 11 months with timespan=12m), so the layer keeps its own history (ctx.readPrevious) and
// refreshes 9 concellos per hourly run (about every concello once a day), the least recently
// updated first: a concello never fetched asks for 12 months (the backfill, about a day for
// all), the others for the days since their last update.
// Two requests per concello (volume and tone), 10 s apart: about 3 minutes a run.
//
// Days GDELT has no data for (it leaves them out, or its own count of monitored articles
// collapses below MIN_NORM) are unknown (null), not zero. The tone is published only for a
// concello-day with at least 5 articles. No headline, URL or source is stored.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { round } from '../../lib/adapter.ts';

export const API = 'https://api.gdeltproject.org/api/v2/doc/doc';
export const DAYS = 365;
/** Concellos refreshed per run (two requests each). */
export const BATCH = 9;
export const MIN_TONE_ARTICLES = 5;
/** Pause between requests: GDELT asks for at most one every 5 s and blocks the IP for a while
 *  (over 20 min on 1/11/2026) when it gets more; twice that. Tests set it to 0. */
export const timing = { gapMs: 10_000 };

export interface Query {
  codigo_ine: string;
  nome: string;
  consulta: string | null;
  motivo?: string;
}

export interface Series {
  /** Articles per day (YYYY-MM-DD); missing days are unknown. */
  articles: Record<string, number>;
  tone: Record<string, number>;
  /** GDELT's count of all articles monitored that day (to spot its own outages). */
  norm: Record<string, number>;
}

export interface Raw {
  queries: Query[];
  fetched: Record<string, Series>;
  previous: Feature[] | null;
  now: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoDay = (gdelt: string) => `${gdelt.slice(0, 4)}-${gdelt.slice(4, 6)}-${gdelt.slice(6, 8)}`;
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function queryUrl(q: string, mode: 'timelinevolraw' | 'timelinetone', span: string) {
  const query = encodeURIComponent(`${q} sourcecountry:spain`);
  return `${API}?query=${query}&mode=${mode}&format=json&timespan=${span}`;
}

/** Timespan to ask for: 12 months for a concello never fetched, else the days since. */
export function spanFor(last: string | null, today: string): string {
  if (!last) return '12m';
  const days = Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000) + 3;
  return days > 300 ? '12m' : `${Math.max(days, 4)}d`;
}

interface Timeline {
  timeline?: Array<{ series: string; data: Array<{ date: string; value: number; norm?: number }> }>;
}

export function parseTimeline(body: string): Timeline {
  const text = body.trim();
  // GDELT answers some errors (rate limit, bad query) as plain text with status 200.
  if (!text.startsWith('{')) throw new Error(`GDELT: ${text.slice(0, 120)}`);
  return JSON.parse(text) as Timeline;
}

async function fetchSeries(ctx: AdapterContext, q: string, span: string): Promise<Series> {
  // No retry: a 429 from GDELT means wait a long while, not seconds; the next run carries on.
  const opts = { timeoutMs: 60_000, retries: 0 };
  const vol = parseTimeline(
    (await ctx.get(queryUrl(q, 'timelinevolraw', span), opts)).body.toString('utf8'),
  );
  await sleep(timing.gapMs);
  const tone = parseTimeline(
    (await ctx.get(queryUrl(q, 'timelinetone', span), opts)).body.toString('utf8'),
  );
  const s: Series = { articles: {}, tone: {}, norm: {} };
  for (const d of vol.timeline?.[0]?.data ?? []) {
    s.articles[isoDay(d.date)] = d.value;
    if (typeof d.norm === 'number') s.norm[isoDay(d.date)] = d.norm;
  }
  for (const d of tone.timeline?.[0]?.data ?? []) s.tone[isoDay(d.date)] = d.value;
  return s;
}

/**
 * Days whose GDELT norm (all the articles it monitored that day) is under MIN_NORM: an outage
 * of GDELT, not silence about the concello. Ordinary days in 2025–2026 are 30,000–200,000;
 * outages drop to a few thousand.
 */
export const MIN_NORM = 15_000;
export function outageDays(norm: Record<string, number>): Set<string> {
  return new Set(
    Object.entries(norm)
      .filter(([, v]) => v < MIN_NORM)
      .map(([d]) => d),
  );
}

/** Articles in the 7 days ending on each day; null when fewer than 4 of them are known. */
export function rolling7(articles: Array<number | null>): Array<number | null> {
  return articles.map((_, i) => {
    const win = articles.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => v !== null);
    return win.length >= 4 ? win.reduce((a, b) => a + b, 0) : null;
  });
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const queries = JSON.parse(
      await readFile(join(import.meta.dirname, 'consultas.json'), 'utf8'),
    ) as Query[];
    const prev = (await ctx.readPrevious?.()) ?? null;
    const byCode = new Map(prev?.collection.features.map((f) => [String(f.id), f.properties]));
    const today = ctx.now.toISOString().slice(0, 10);
    // Never fetched first, then the least recently updated.
    const due = queries
      .filter((q) => q.consulta)
      .map((q) => ({ q, at: (byCode.get(q.codigo_ine)?.actualizado as string | null) ?? '' }))
      .sort((a, b) => a.at.localeCompare(b.at) || a.q.codigo_ine.localeCompare(b.q.codigo_ine))
      .slice(0, BATCH);
    const fetched: Record<string, Series> = {};
    let first = true;
    for (const { q } of due) {
      if (!first) await sleep(timing.gapMs);
      first = false;
      const last = (byCode.get(q.codigo_ine)?.ata as string | null) ?? null;
      try {
        fetched[q.codigo_ine] = await fetchSeries(ctx, q.consulta as string, spanFor(last, today));
      } catch (err) {
        // Rate limited or a bad answer: stop here and keep what is already fetched; the rest
        // waits for the next run.
        console.warn(`galicia-noticias: ${q.nome}: ${(err as Error).message}`);
        break;
      }
    }
    if (Object.keys(fetched).length === 0) throw new Error('GDELT answered no concello this run');
    return {
      queries,
      fetched,
      previous: prev?.collection.features ?? null,
      now: ctx.now.toISOString(),
    };
  },

  normalize(raw: Raw) {
    // Outages from the norm of this run's answers; earlier ones are already null.
    const norm: Record<string, number> = {};
    for (const s of Object.values(raw.fetched)) Object.assign(norm, s.norm);
    const outage = outageDays(norm);
    const prevBy = new Map((raw.previous ?? []).map((f) => [String(f.id), f.properties]));
    // The axis ends on the newest day any answer (or the previous file) has.
    let end = '';
    for (const s of Object.values(raw.fetched)) {
      for (const d of Object.keys(s.articles)) if (d > end && !outage.has(d)) end = d;
    }
    for (const p of prevBy.values()) {
      const ata = p.ata as string | null;
      if (ata && ata > end) end = ata;
    }
    const start = addDays(end, -(DAYS - 1));
    const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));

    const features: Feature[] = raw.queries.map((q) => {
      const old = prevBy.get(q.codigo_ine);
      const oldStart = (old?.desde as string | undefined) ?? start;
      const oldArticles = (old?.artigos as Array<number | null> | undefined) ?? [];
      const oldTone = (old?.ton as Array<number | null> | undefined) ?? [];
      const at = (arr: Array<number | null>, d: string) => {
        const i = Math.round((Date.parse(d) - Date.parse(oldStart)) / 86_400_000);
        return i >= 0 && i < arr.length ? (arr[i] ?? null) : null;
      };
      const s = raw.fetched[q.codigo_ine];
      const articles = days.map((d) => {
        if (s && d in s.articles && !outage.has(d)) return s.articles[d] as number;
        return at(oldArticles, d);
      });
      const tone = days.map((d, i) => {
        const n = articles[i];
        if (n === null || n === undefined || n < MIN_TONE_ARTICLES) return null;
        if (s && d in s.tone && d in s.articles) return round(s.tone[d] as number, 2);
        return at(oldTone, d);
      });
      // Last day really covered: outage days are asked again next time.
      const fetchedDays = s
        ? Object.keys(s.articles)
            .filter((d) => !outage.has(d))
            .sort()
        : [];
      return {
        type: 'Feature',
        id: q.codigo_ine,
        geometry: null,
        properties: {
          codigo_ine: q.codigo_ine,
          nome: q.nome,
          consulta: q.consulta,
          motivo: q.motivo ?? null,
          desde: start,
          ata: s ? (fetchedDays.at(-1) ?? null) : ((old?.ata as string | null) ?? null),
          actualizado: s ? raw.now : ((old?.actualizado as string | null) ?? null),
          artigos: articles,
          ton: tone,
          valor: rolling7(articles),
        },
      };
    });
    return { collection: { type: 'FeatureCollection', features }, publishedAt: `${end}T00:00:00Z` };
  },
};

export default adapter;
