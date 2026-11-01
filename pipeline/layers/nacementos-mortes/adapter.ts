// Births and deaths of the residents of every concello, year by year since 1975, for
// /pulso/vida/. Source: IGE tables 57 (births, by the mother's concello of residence) and 30
// (deaths, by concello of residence), «Movemento natural da poboación» (IGE, INE); datos/fontes/
// ige-nacementos-mortes.
//
// On today's 313 concellos: merged concellos are added into the new code for the years before
// the merger (exact); concellos split off later (Cariño, Burela, A Illa de Arousa) have no
// figure before they existed and stay empty, never filled. The last year is provisional.
// The map value is births per 100 deaths: it needs no population, which the IGE does not give
// every year back to 1975.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { round } from '../../lib/adapter.ts';
import { MERGED, MERGED_NAMES, readableName } from '../../lib/concellos.ts';
import { parseIge } from '../poboacion-estacional/adapter.ts';

export const FIRST_YEAR = 1975;
const BASE = 'https://www.ige.gal/igebdt/igeapi/csv/datos/';
const PAUSE_MS = 1000;

export const yearsUpTo = (last: number) =>
  Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
/** Total of both sexes (axis 1 = 0) for every year asked. */
export const tableUrl = (table: string, years: number[]) =>
  `${BASE}${table}/0:${years.join(':')},1:0`;

export interface Raw {
  years: number[];
  births: string;
  deaths: string;
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const pause = Number(ctx.env.IGE_PAUSE_MS ?? PAUSE_MS);
    // The IGE publishes year a (provisional) during a+1: ask up to last year.
    const years = yearsUpTo(ctx.now.getUTCFullYear() - 1);
    const latin1 = new TextDecoder('latin1');
    const births = latin1.decode(
      (await ctx.get(tableUrl('57', years), { timeoutMs: 120_000 })).body,
    );
    if (pause > 0) await new Promise((r) => setTimeout(r, pause));
    const deaths = latin1.decode(
      (await ctx.get(tableUrl('30', years), { timeoutMs: 120_000 })).body,
    );
    return { years, births, deaths };
  },

  normalize(raw: Raw, ctx) {
    const series = new Map<
      string,
      { name: string; b: Array<number | null>; d: Array<number | null> }
    >();
    let lastWithData = -1;
    const add = (csv: string, key: 'b' | 'd') => {
      for (const r of parseIge(csv)) {
        if (r.cod.length !== 5) continue;
        const i = raw.years.indexOf(Number(r.tempo));
        if (i < 0 || r.valor === null) continue;
        const code = MERGED[r.cod] ?? r.cod;
        let s = series.get(code);
        if (!s) {
          s = { name: '', b: raw.years.map(() => null), d: raw.years.map(() => null) };
          series.set(code, s);
        }
        if (!MERGED[r.cod]) s.name = MERGED_NAMES[code] ?? readableName(r.nome);
        s[key][i] = (s[key][i] ?? 0) + r.valor;
        lastWithData = Math.max(lastWithData, i);
      }
    };
    add(raw.births, 'b');
    add(raw.deaths, 'd');
    if (lastWithData < 0) throw new Error('IGE tables 57/30 returned no concello data');
    const years = raw.years.slice(0, lastWithData + 1);
    const features: Feature[] = [...series.entries()]
      .filter(([, s]) => s.name)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, s]) => {
        const b = s.b.slice(0, years.length);
        const d = s.d.slice(0, years.length);
        return {
          type: 'Feature',
          id: code,
          geometry: null,
          properties: {
            codigo_ine: code,
            nome: s.name,
            periodos: years.map(String),
            provisional: String(years[years.length - 1]),
            nacementos: b,
            defuncions: d,
            valor: b.map((v, i) => {
              const dv = d[i];
              return v === null || dv === null || dv === undefined || dv === 0
                ? null
                : round((100 * v) / dv, 1);
            }),
          },
        };
      });
    // Tests pass a few concellos; production must have all of today's.
    const expected = Number(ctx?.env?.EXPECT_CONCELLOS ?? 313);
    if (features.length !== expected)
      throw new Error(`Expected ${expected} concellos, got ${features.length}`);
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
};

export default adapter;
