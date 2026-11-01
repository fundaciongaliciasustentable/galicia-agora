// Tourist flats (vivendas de uso turístico, VUT) registered in every concello, month by month
// since June 2017, for /pulso/pisos/. Source: Turismo de Galicia, monthly series of the
// Rexistro de Empresas e Actividades Turísticas (REAT), the same register as vut-concello but
// as the stock of each month, so flats that later left the register are counted while they
// were in it (datos/fontes/vut-historico).
//
// A concello with no row in a month has no VUT that month (zero, not missing). The map value
// is VUT per 1,000 residents of the 2021 census (poboacion-seculo), one fixed denominator for
// every month. It counts registrations, not flats rented.

import type { Adapter, AdapterContext, Feature, PublishedLayer } from '../../lib/adapter.ts';
import { round } from '../../lib/adapter.ts';

export const SERIES_URL = 'https://descargascdn.xunta.gal/interno/smarxa/REAT_Serie_Mensual.csv';
const VUT = 'Vivendas de uso turístico';

export interface Raw {
  csv: string;
  population: PublishedLayer;
}

export interface Row {
  month: string;
  code: string;
  type: string;
  units: number;
  places: number;
}

export function parseSeries(csv: string): Row[] {
  const out: Row[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const p = line.split(';').map((x) => x.replace(/^"|"$/g, ''));
    if (p.length < 9) continue;
    out.push({
      month: p[0] as string,
      code: p[1] as string,
      type: p[5] as string,
      units: Number(p[6]),
      places: Number(p[8]),
    });
  }
  return out;
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('vut-mensual needs ctx.readLayer (derived layer)');
    const res = await ctx.get(SERIES_URL, { timeoutMs: 120_000 });
    return {
      csv: new TextDecoder('latin1').decode(res.body),
      population: await ctx.readLayer('poboacion-seculo'),
    };
  },

  normalize(raw: Raw) {
    const rows = parseSeries(raw.csv);
    const vut = rows.filter((r) => r.type === VUT);
    if (vut.length === 0) throw new Error('REAT series has no VUT rows');
    const first = vut.reduce((m, r) => (r.month < m ? r.month : m), vut[0]?.month as string);
    const months = [...new Set(rows.map((r) => r.month))].filter((m) => m >= first).sort();
    const units = new Map<string, number>();
    const places = new Map<string, number>();
    for (const r of vut) {
      units.set(`${r.code}|${r.month}`, (units.get(`${r.code}|${r.month}`) ?? 0) + r.units);
      places.set(`${r.code}|${r.month}`, (places.get(`${r.code}|${r.month}`) ?? 0) + r.places);
    }
    const features: Feature[] = raw.population.collection.features
      .map((f) => f.properties)
      .sort((a, b) => String(a.codigo_ine).localeCompare(String(b.codigo_ine)))
      .map((p) => {
        const code = String(p.codigo_ine);
        const pop = (p.poboacion as Array<number | null>).at(-1) ?? null;
        const n = months.map((m) => units.get(`${code}|${m}`) ?? 0);
        return {
          type: 'Feature',
          id: code,
          geometry: null,
          properties: {
            codigo_ine: code,
            nome: String(p.nome),
            periodos: months,
            vut: n,
            prazas: months.map((m) => places.get(`${code}|${m}`) ?? 0),
            poboacion_2021: pop,
            valor: n.map((v) => (pop ? round((1000 * v) / pop, 1) : null)),
          },
        };
      });
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
};

export default adapter;
