// Tourist-use dwellings (vivendas de uso turístico, VUT) per concello, from the REAT
// accommodation directory of Turismo de Galicia. VUT are private homes, so they are only
// published as counts: one row per concello (geometry null), joined by the client to
// concellos-parroquias by codigo_ine, like indicadores-concellos.
//
// Population comes from the IGE table API (table 1558, latest year), with the same CSV
// parser as indicadores-concellos. REAT gives concello names only (upper case, no code):
// they are matched to IGE names after normalising case, accents, hyphens and the trailing
// article ("Coruña, A"). Every name must match; otherwise the run fails rather than
// publishing counts in the wrong place. The merged concellos 15902 (Oza-Cesuras) and 36902
// (Cerdedo-Cotobade) appear in REAT under their current names; their extinct IGE codes are
// skipped.
//
// Indicators use the difference in points against Galicia, not an index: several
// concellos have no VUT, and an index of 0 cannot be placed on the log scale.

import { type Adapter, compareWithGalicia, type Feature, round } from '../../lib/adapter.ts';
import {
  ALOXAMENTOS_URL,
  integer,
  isVut,
  normName,
  parseReat,
  referenceToIso,
} from '../aloxamento-reat/reat.ts';
import { BASE, EXTINCT, GALICIA, parseIgeCsv, series } from '../indicadores-concellos/adapter.ts';

/** IGE table 1558 (population at 1 January), latest year only. */
export const IGE_POBOACION_URL = `${BASE}1558/T%5B1:a%5D`;

export interface Raw {
  reat: string;
  t1558: string;
}

export const INDICATORS = [
  { id: 'vut_1000hab', comparison: 'points' },
  { id: 'prazas_vut_1000hab', comparison: 'points' },
] as const;

export interface Concello {
  cod: string;
  nome: string;
  poboacion: number | null;
}

export function concellosFromIge(text: string): {
  concellos: Concello[];
  galicia: number;
  ano: string;
} {
  const all = parseIgeCsv(text, 't1558');
  const s = series(all, undefined, 't1558');
  const galicia = s.values.get(GALICIA);
  if (galicia === null || galicia === undefined) throw new Error('t1558: no Galicia population');
  const rows = all.filter(
    (r) => r.tempoCod === s.tempoCod && /^\d{5}$/.test(r.cod) && !EXTINCT.has(r.cod),
  );
  if (rows.length < 300) throw new Error(`t1558: only ${rows.length} concellos`);
  return {
    concellos: rows.map((r) => ({ cod: r.cod, nome: r.nome, poboacion: r.value })),
    galicia,
    ano: s.periodo,
  };
}

export interface Counts {
  vut: Map<string, number>;
  prazas: Map<string, number>;
  senPrazas: Map<string, number>;
  total: number;
  totalPrazas: number;
}

/** Count VUT and their places per INE code. Throws on any unmatched concello name. */
export function countVut(reatText: string, concellos: Concello[]): Counts & { reference: string } {
  const { reference, rows } = parseReat(reatText);
  const byName = new Map<string, string>();
  for (const c of concellos) {
    const k = normName(c.nome);
    if (byName.has(k)) throw new Error(`t1558: two concellos named ${k}`);
    byName.set(k, c.cod);
  }
  const counts: Counts = {
    vut: new Map(),
    prazas: new Map(),
    senPrazas: new Map(),
    total: 0,
    totalPrazas: 0,
  };
  const unmatched = new Set<string>();
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  for (const r of rows) {
    if (!isVut(r)) continue;
    const cod = byName.get(normName(r.municipio ?? ''));
    if (!cod) {
      unmatched.add(r.municipio || '(baleiro)');
      continue;
    }
    add(counts.vut, cod, 1);
    counts.total++;
    const p = integer(r.plazas);
    if (p === null) add(counts.senPrazas, cod, 1);
    else {
      add(counts.prazas, cod, p);
      counts.totalPrazas += p;
    }
  }
  if (unmatched.size) {
    throw new Error(`REAT: concellos without INE code: ${[...unmatched].sort().join(', ')}`);
  }
  if (counts.total === 0) throw new Error('REAT: no VUT rows');
  return { ...counts, reference };
}

const per1000 = (n: number, pop: number | null) =>
  pop === null || pop === 0 ? null : round((n / pop) * 1000, 2);

const adapter = {
  async fetch(ctx) {
    const reat = await ctx.get(ALOXAMENTOS_URL, { timeoutMs: 180_000 });
    const ige = await ctx.get(IGE_POBOACION_URL, { timeoutMs: 60_000 });
    return {
      reat: new TextDecoder('utf-8').decode(reat.body),
      t1558: new TextDecoder('latin1').decode(ige.body),
    };
  },

  normalize(raw, _ctx) {
    const { concellos, galicia, ano } = concellosFromIge(raw.t1558);
    const c = countVut(raw.reat, concellos);
    const periodo = `${c.reference} (poboación ${ano})`;
    const gal = {
      vut_1000hab: per1000(c.total, galicia),
      prazas_vut_1000hab: per1000(c.totalPrazas, galicia),
    };
    const features: Feature[] = concellos.map(({ cod, nome, poboacion }) => {
      const vut = c.vut.get(cod) ?? 0;
      const prazas = c.prazas.get(cod) ?? 0;
      const values = {
        vut_1000hab: per1000(vut, poboacion),
        prazas_vut_1000hab: per1000(prazas, poboacion),
      };
      const properties: Record<string, unknown> = {
        codigo_ine: cod,
        nome,
        vut,
        prazas_vut: prazas,
        vut_sen_prazas: c.senPrazas.get(cod) ?? 0,
        poboacion,
        poboacion_ano: ano,
        data_referencia: c.reference,
      };
      for (const { id, comparison } of INDICATORS) {
        properties[id] = values[id];
        properties[`${id}_galicia`] = gal[id];
        properties[`${id}_rel`] = compareWithGalicia(values[id], gal[id], comparison);
        properties[`${id}_periodo`] = periodo;
      }
      return { type: 'Feature', id: cod, geometry: null, properties };
    });
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: referenceToIso(c.reference),
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
