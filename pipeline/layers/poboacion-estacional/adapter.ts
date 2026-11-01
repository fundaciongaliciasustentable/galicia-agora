// Seasonal population load of every concello, quarter by quarter (IGE, «Carga de poboación
// estacional dos concellos»). Feeds /pulso/estacion/ and draws on the concellos layer.
//
// Reference year of the series: 2025, provisional, of which only quarters I and II exist (the
// IGE publishes year a in a+2). 2024, the last final year, comes along so the page can show a
// whole year beside it, labelled as such. Quarters not yet published are absent, never filled.
//
// Two IGE API tables: 9043 (load, residents, people in and out, load rate) and 9046 (load by
// component). Values are passed through as the IGE gives them; the comparison of the latest
// rate with Galicia's is our own calculation, shown next to the original (API conditions).

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { compareWithGalicia } from '../../lib/adapter.ts';

export const BASE = 'https://www.ige.gal/igebdt/igeapi/csv/datos/';
/** IGE quarter codes: YYYY13–YYYY16 are quarters I–IV. */
export const QUARTERS = ['202413', '202414', '202415', '202416', '202513', '202514'];
export const tableUrl = (t: string) => `${BASE}${t}/0:${QUARTERS.join(':')}`;
export const GALICIA = '12';
/** Codes kept by the IGE for concellos merged in 2013 and 2016. */
const EXTINCT = new Set(['15026', '15063', '36011', '36012']);
const PAUSE_MS = 1000;

/** 9043 measures → output fields. */
const LOAD: Record<string, string> = {
  'CARGA DE POBOACIÓN': 'carga',
  Residentes: 'residentes',
  'Poboación de entrada': 'entrada',
  'Poboación de saída': 'saida',
  'Taxa de carga poboacional': 'taxa',
};
/** 9046 components (balance each adds to the load) → output fields. */
const PARTS: Record<string, string> = {
  Turismo: 'turismo',
  'Segundas vivendas': 'segundas_vivendas',
  Estudos: 'estudos',
  Traballo: 'traballo',
  Saúde: 'saude',
};

export interface Raw {
  t9043: string;
  t9046: string;
}

export function quarterLabel(code: string): string {
  return `${code.slice(0, 4)}/${['I', 'II', 'III', 'IV'][Number(code.slice(4)) - 13]}`;
}

/** Parse an IGE API CSV (quoted fields, numbers in DatoN). */
export function parseIge(
  csv: string,
): Array<{ tempo: string; medida: string; cod: string; nome: string; valor: number | null }> {
  const lines = csv.trim().split(/\r?\n/);
  const out = [];
  for (const line of lines.slice(1)) {
    const cells: string[] = [];
    for (const m of line.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)) {
      cells.push(m[2] ?? m[1] ?? '');
      if (m[3] === '' || cells.length >= 7) break;
    }
    const [tempo, , medida, cod, espazo, dato] = cells as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const v = dato === '' ? null : Number(dato);
    out.push({
      tempo,
      medida,
      cod,
      nome: espazo.replace(/^\d+ /, ''),
      valor: Number.isFinite(v) ? v : null,
    });
  }
  return out;
}

/** «Coruña, A» → «A Coruña». */
const readable = (n: string) => n.replace(/^(.*), (A|O|As|Os)$/, '$2 $1');

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const pause = Number(ctx.env.IGE_PAUSE_MS ?? PAUSE_MS);
    const latin1 = new TextDecoder('latin1');
    const t9043 = latin1.decode((await ctx.get(tableUrl('9043'), { timeoutMs: 60_000 })).body);
    if (pause > 0) await new Promise((r) => setTimeout(r, pause));
    const t9046 = latin1.decode((await ctx.get(tableUrl('9046'), { timeoutMs: 60_000 })).body);
    return { t9043, t9046 };
  },

  normalize(raw: Raw) {
    const series = new Map<
      string,
      { nome: string; fields: Record<string, Array<number | null>> }
    >();
    const put = (cod: string, nome: string, field: string, tempo: string, v: number | null) => {
      const i = QUARTERS.indexOf(tempo);
      if (i < 0) return;
      let s = series.get(cod);
      if (!s) {
        s = { nome, fields: {} };
        series.set(cod, s);
      }
      s.fields[field] ??= Array(QUARTERS.length).fill(null);
      (s.fields[field] as Array<number | null>)[i] = v;
    };
    for (const r of parseIge(raw.t9043))
      if (LOAD[r.medida]) put(r.cod, r.nome, LOAD[r.medida] as string, r.tempo, r.valor);
    for (const r of parseIge(raw.t9046))
      if (PARTS[r.medida]) put(r.cod, r.nome, PARTS[r.medida] as string, r.tempo, r.valor);

    const galicia = series.get(GALICIA);
    if (!galicia?.fields.taxa) throw new Error('IGE table 9043 has no Galicia rate');
    // Latest quarter with a Galicia value: the period of the map indicator.
    const last = (galicia.fields.taxa as Array<number | null>)
      .map((v, i) => (v === null ? -1 : i))
      .reduce((a, b) => Math.max(a, b), -1);
    if (last < 0) throw new Error('No published quarter');
    const empty = () => Array(QUARTERS.length).fill(null) as Array<number | null>;
    const features: Feature[] = [];
    for (const [cod, s] of [...series.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (cod.length !== 5 || EXTINCT.has(cod)) continue;
      const f = (k: string) => s.fields[k] ?? empty();
      const taxa = f('taxa');
      if (taxa.every((v) => v === null)) continue;
      const latest = taxa[last] ?? null;
      const galiciaLatest = (galicia.fields.taxa as Array<number | null>)[last] ?? null;
      features.push({
        type: 'Feature',
        id: cod,
        geometry: null,
        properties: {
          codigo_ine: cod,
          nome: readable(s.nome),
          trimestres: QUARTERS.map(quarterLabel),
          provisional: QUARTERS.map((q) => q.startsWith('2025')),
          carga: f('carga'),
          residentes: f('residentes'),
          entrada: f('entrada'),
          saida: f('saida'),
          taxa,
          turismo: f('turismo'),
          segundas_vivendas: f('segundas_vivendas'),
          estudos: f('estudos'),
          traballo: f('traballo'),
          saude: f('saude'),
          galicia_taxa: galicia.fields.taxa,
          taxa_carga: latest,
          taxa_carga_galicia: galiciaLatest,
          taxa_carga_rel: compareWithGalicia(latest, galiciaLatest, 'points'),
          taxa_carga_periodo: quarterLabel(QUARTERS[last] as string),
        },
      });
    }
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
};

export default adapter;
