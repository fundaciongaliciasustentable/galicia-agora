// Schools in every concello, year by year since 2005, for /pulso/escolas/. Source: IGE table
// 1653, «Ensinanza non universitaria. Centros de réxime xeral» by concello (datos/fontes/
// centros-educativos-historico). Only the Total row: the teaching types change content over
// the years without a note. A count per concello and year, not which school opened or closed;
// a rural grouped school (CRA) counts as one centre whatever its teaching sites.
//
// On today's 313 concellos: merged concellos are added into the new code for the years before
// the merger. The map value is the change in centres since the first year.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { MERGED, MERGED_NAMES, readableName } from '../../lib/concellos.ts';
import { parseIge } from '../poboacion-estacional/adapter.ts';

export const TABLE_URL = 'https://www.ige.gal/igebdt/igeapi/csv/datos/1653';

export interface Raw {
  csv: string;
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const res = await ctx.get(TABLE_URL, { timeoutMs: 120_000 });
    return { csv: new TextDecoder('latin1').decode(res.body) };
  },

  normalize(raw: Raw, ctx) {
    const rows = parseIge(raw.csv).filter((r) => r.medida === 'Total');
    const years = [...new Set(rows.map((r) => Number(r.tempo)))].sort((a, b) => a - b);
    if (years.length === 0) throw new Error('IGE table 1653 has no Total rows');
    const series = new Map<string, { name: string; n: Array<number | null> }>();
    for (const r of rows) {
      if (r.cod.length !== 5 || r.valor === null) continue;
      const code = MERGED[r.cod] ?? r.cod;
      let s = series.get(code);
      if (!s) {
        s = { name: '', n: years.map(() => null) };
        series.set(code, s);
      }
      if (!MERGED[r.cod]) s.name = MERGED_NAMES[code] ?? readableName(r.nome);
      const i = years.indexOf(Number(r.tempo));
      s.n[i] = (s.n[i] ?? 0) + r.valor;
    }
    const features: Feature[] = [...series.entries()]
      .filter(([, s]) => s.name)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, s]) => {
        const first = s.n[0];
        return {
          type: 'Feature',
          id: code,
          geometry: null,
          properties: {
            codigo_ine: code,
            nome: s.name,
            periodos: years.map(String),
            centros: s.n,
            valor: s.n.map((v) =>
              v === null || first === null || first === undefined ? null : v - first,
            ),
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
