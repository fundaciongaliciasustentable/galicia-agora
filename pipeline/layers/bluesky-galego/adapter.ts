// Bluesky in Galician and the seven cities on Bluesky, for /pulso/bluesky/. Only counters are
// kept: no text, no account (DID or handle), no post URI, ever.
//
// 1. Posts in Galician. Bluesky's public Jetstream relays every new post with the languages
//    its author's app declared (`langs`). It can replay roughly the last day and a half from a
//    cursor, so each run samples SAMPLE_MIN minutes of every complete UTC hour of the last 30
//    hours it has not sampled yet (a window that moves inside the hour), counts the new posts,
//    those tagged `gl` and those tagged `es`, and drops each event at once. A day's figure is
//    the sampled count scaled to 24 hours; it is published when at least half of the planned
//    minutes were sampled. The sample registry (hours already counted, as a 24-bit mask per
//    day) lives in the published file, so no hour is counted twice and history survives.
// 2. Mentions of the seven cities. The search endpoint of Bluesky's AppView gives the number
//    of posts whose text matches a query in a period (`hitsTotal`); we ask for one post and
//    discard it. Complete Monday–Sunday weeks (UTC), the last 52, each asked once (the last
//    two again); a week under MIN_WEEK_MENTIONS is kept and published as null. The place comes from the text, not from where
//    people are: Bluesky posts carry no location.
//
// Terms: Bluesky developer guidelines and rate limits (3,000 requests / 5 min per IP).

import type { Adapter, AdapterContext, Feature, PublishedLayer } from '../../lib/adapter.ts';
import { round } from '../../lib/adapter.ts';
import { USER_AGENT } from '../../lib/http.ts';

export const JETSTREAM = 'wss://jetstream2.us-east.bsky.network/subscribe';
export const SEARCH = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts';
export const SAMPLE_MIN = 6;
/** How far back a run samples (the replay buffer measured on 1/11/2026 was ~36 h). */
export const LOOKBACK_H = 30;
export const WEEKS = 52;
export const DAYS = 400;
export const MIN_WEEK_MENTIONS = 10;

export const CITIES: Array<{ codigo_ine: string; nome: string; consulta: string }> = [
  { codigo_ine: '15030', nome: 'A Coruña', consulta: 'Coruña' },
  { codigo_ine: '15036', nome: 'Ferrol', consulta: 'Ferrol' },
  { codigo_ine: '15078', nome: 'Santiago de Compostela', consulta: '"Santiago de Compostela"' },
  { codigo_ine: '27028', nome: 'Lugo', consulta: 'Lugo' },
  { codigo_ine: '32054', nome: 'Ourense', consulta: 'Ourense' },
  { codigo_ine: '36038', nome: 'Pontevedra', consulta: 'Pontevedra' },
  { codigo_ine: '36057', nome: 'Vigo', consulta: 'Vigo' },
];

/** Counts of one sampled window. */
export interface Counts {
  posts: number;
  gl: number;
  es: number;
}

/** Day record: [hours sampled (24-bit mask), minutes sampled, posts, gl, es]. */
export type DayRecord = [number, number, number, number, number];

/** Opens the Jetstream replay at a cursor (µs) and yields raw messages. Tests replace it. */
export const jetstream = {
  open(cursorUs: number, timeoutMs: number): AsyncIterable<string> {
    return openSocket(
      `${JETSTREAM}?wantedCollections=app.bsky.feed.post&cursor=${cursorUs}`,
      timeoutMs,
    );
  },
};

async function* openSocket(url: string, timeoutMs: number): AsyncIterable<string> {
  // Node's WebSocket (undici) takes extra headers as an option: send our User-Agent.
  const ws = new WebSocket(url, { headers: { 'user-agent': USER_AGENT } } as unknown as string[]);
  const queue: string[] = [];
  let done = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };
  ws.onmessage = (m) => {
    queue.push(String(m.data));
    notify();
  };
  ws.onerror = () => {
    failure = new Error('Jetstream connection error');
    notify();
  };
  ws.onclose = () => {
    done = true;
    notify();
  };
  const timer = setTimeout(() => {
    failure = new Error('Jetstream sample timed out');
    ws.close();
  }, timeoutMs);
  try {
    while (true) {
      const next = queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (failure) throw failure;
      if (done) return;
      await new Promise<void>((r) => {
        wake = r;
      });
    }
  } finally {
    clearTimeout(timer);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
  }
}

/**
 * Count new posts between two instants (µs). Each message is parsed, counted and dropped.
 * Returns null if the replay does not reach back to the start (buffer too short) or ends
 * before the window does.
 */
export async function sampleWindow(
  startUs: number,
  endUs: number,
  timeoutMs = 90_000,
): Promise<Counts | null> {
  const c: Counts = { posts: 0, gl: 0, es: 0 };
  let first = true;
  for await (const msg of jetstream.open(startUs, timeoutMs)) {
    const e = JSON.parse(msg) as {
      time_us: number;
      kind: string;
      commit?: { operation?: string; collection?: string; record?: { langs?: unknown } };
    };
    if (first) {
      first = false;
      // The replay starts at the oldest event it still has: more than a minute late means the
      // window is no longer in the buffer.
      if (e.time_us > startUs + 60_000_000) return null;
    }
    if (e.time_us >= endUs) return c;
    if (e.time_us < startUs) continue;
    const k = e.commit;
    if (e.kind !== 'commit' || k?.operation !== 'create' || k.collection !== 'app.bsky.feed.post') {
      continue;
    }
    c.posts++;
    const langs = Array.isArray(k.record?.langs) ? (k.record?.langs as unknown[]) : [];
    if (langs.includes('gl')) c.gl++;
    if (langs.includes('es')) c.es++;
  }
  return null;
}

/** Minute of the hour where the sample starts: moves with the hour and the day. */
export function offsetOf(hourStartMs: number): number {
  const h = new Date(hourStartMs);
  return (h.getUTCHours() * 7 + h.getUTCDate() * 3) % (60 - SAMPLE_MIN);
}

/** Complete UTC hours of the last LOOKBACK_H hours (start instants, ms). */
export function hoursToSample(now: Date): number[] {
  const top = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  return Array.from({ length: LOOKBACK_H }, (_, i) => top - (LOOKBACK_H - i) * 3_600_000);
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Monday (YYYY-MM-DD) of the week of a day. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}

/** Estimated posts in a day or week from its records, or null if under half sampled. */
export function estimate(
  records: DayRecord[],
  days: number,
): { gl: number; posts: number; minutes: number } | null {
  const minutes = records.reduce((s, r) => s + r[1], 0);
  const planned = days * 24 * SAMPLE_MIN;
  if (minutes < planned / 2) return null;
  const scale = (days * 1440) / minutes;
  const gl = records.reduce((s, r) => s + r[3], 0);
  const posts = records.reduce((s, r) => s + r[2], 0);
  return { gl: Math.round(gl * scale), posts: Math.round(posts * scale), minutes };
}

export interface Raw {
  now: string;
  /** Day records, merged from the previous file and this run's samples. */
  days: Record<string, DayRecord>;
  /** Mentions per city code and week (Monday). */
  mentions: Record<string, Record<string, number | null>>;
  population: PublishedLayer;
}

async function searchCount(ctx: AdapterContext, q: string, since: string, until: string) {
  const url = `${SEARCH}?q=${encodeURIComponent(q)}&since=${since}T00:00:00.000Z&until=${until}T00:00:00.000Z&limit=1`;
  const body = JSON.parse((await ctx.get(url, { timeoutMs: 30_000 })).body.toString('utf8')) as {
    hitsTotal?: number;
  };
  // Only the total is read; the one post returned is dropped with the body.
  if (typeof body.hitsTotal !== 'number') throw new Error(`No hitsTotal for ${q}`);
  return body.hitsTotal;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const timing = { searchGapMs: 300 };

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('bluesky-galego needs ctx.readLayer (population)');
    const prev = (await ctx.readPrevious?.()) ?? null;
    const p0 = prev?.collection.features[0]?.properties;
    const days: Record<string, DayRecord> = structuredClone(
      (p0?.mostras as Record<string, DayRecord> | undefined) ?? {},
    );

    // 1. Jetstream samples of the hours not counted yet.
    let sampled = 0;
    for (const hour of hoursToSample(ctx.now)) {
      const day = dayOf(hour);
      const bit = 1 << new Date(hour).getUTCHours();
      const rec = days[day] ?? [0, 0, 0, 0, 0];
      if (rec[0] & bit) continue;
      const start = hour + offsetOf(hour) * 60_000;
      const c = await sampleWindow(start * 1000, (start + SAMPLE_MIN * 60_000) * 1000);
      if (!c) continue;
      days[day] = [
        rec[0] | bit,
        rec[1] + SAMPLE_MIN,
        rec[2] + c.posts,
        rec[3] + c.gl,
        rec[4] + c.es,
      ];
      sampled++;
    }

    // 2. Weekly mentions: weeks never asked, and the last two complete weeks again.
    const thisMonday = mondayOf(ctx.now.toISOString().slice(0, 10));
    const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(thisMonday, -7 * (WEEKS - i)));
    const mentions: Raw['mentions'] = {};
    const prevBy = new Map(prev?.collection.features.map((f) => [String(f.id), f.properties]));
    for (const city of CITIES) {
      const old = prevBy.get(city.codigo_ine);
      // Weeks already asked, from the published arrays (null = asked, under the threshold).
      const known: Record<string, number | null> = {};
      const oldWeeks = (old?.mencions as Array<number | null> | undefined) ?? [];
      oldWeeks.forEach((n, i) => {
        known[addDays(old?.desde as string, 7 * i)] = n;
      });
      for (const [i, w] of weeks.entries()) {
        if (w in known && i < WEEKS - 2) continue;
        const n = await searchCount(ctx, city.consulta, w, addDays(w, 7));
        known[w] = n < MIN_WEEK_MENTIONS ? null : n;
        await pause(timing.searchGapMs);
      }
      mentions[city.codigo_ine] = known;
    }
    if (sampled === 0 && !prev) throw new Error('Jetstream gave no sample and there is no history');
    return {
      now: ctx.now.toISOString(),
      days,
      mentions,
      population: await ctx.readLayer('poboacion-seculo'),
    };
  },

  normalize(raw: Raw) {
    const today = raw.now.slice(0, 10);
    const thisMonday = mondayOf(today);
    const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(thisMonday, -7 * (WEEKS - i)));
    // Day records of the last DAYS days only.
    const oldest = addDays(today, -DAYS);
    const days = Object.fromEntries(
      Object.entries(raw.days)
        .filter(([d]) => d >= oldest)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    const week = weeks.map((w) => {
      const recs = Array.from({ length: 7 }, (_, i) => days[addDays(w, i)]).filter(
        (r): r is DayRecord => r !== undefined,
      );
      return estimate(recs, 7);
    });
    const pop = new Map(
      raw.population.collection.features.map((f) => [
        String(f.properties.codigo_ine),
        (f.properties.poboacion as Array<number | null>).at(-1) ?? null,
      ]),
    );
    const features: Feature[] = CITIES.map((city) => {
      const known = raw.mentions[city.codigo_ine] ?? {};
      const mentions = weeks.map((w) => known[w] ?? null);
      const people = pop.get(city.codigo_ine) ?? null;
      return {
        type: 'Feature',
        id: city.codigo_ine,
        geometry: null,
        properties: {
          codigo_ine: city.codigo_ine,
          nome: city.nome,
          consulta: city.consulta,
          poboacion_2021: people,
          desde: weeks[0],
          mencions: mentions,
          valor: mentions.map((n) =>
            n !== null && people ? round((10_000 * n) / people, 1) : null,
          ),
          galego: week.map((e) => e?.gl ?? null),
          galego_permil: week.map((e) => (e && e.posts ? round((1000 * e.gl) / e.posts, 2) : null)),
          mostra_min: week.map((e) => e?.minutes ?? null),
          mostras: days,
        },
      };
    });
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
};

export default adapter;
