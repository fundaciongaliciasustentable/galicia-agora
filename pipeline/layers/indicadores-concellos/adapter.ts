// Municipal indicators from the IGE table API (CSV), compared with the Galicia value.
// One row per concello (geometry null); the client joins rows to concellos-parroquias by
// codigo_ine. Every indicator carries the original value, the Galicia value, our own
// comparison (index Galicia = 100, or difference in points) and the source period.
//
// API conditions: data must not be modified. Values read directly from a table are passed
// through untouched; derived values (population change, unemployment relative to the
// working-age population, cattle per km², 3-year birth rate) are our own calculations and
// are labelled as such in layer.yaml.
//
// CSV is ISO-8859-1. Square brackets in the time selector (T[1:a]) must be percent-encoded.
// Each call returns Galicia (CodEspazo 12), provinces (2 digits), comarcas (4 digits) and
// concellos (5 digits), including four extinct codes that are dropped here.

import { type Adapter, compareWithGalicia, type Feature, round } from '../../lib/adapter.ts';

export const BASE = 'https://www.ige.gal/igebdt/igeapi/csv/datos/';

/** One request per table, each filtered (never request a whole table). */
export const REQUESTS = {
  // Population indicators: 0 mean age, 3 ageing index, 9 % aged 20–64, 10 % aged 65+; sex 2 = Total.
  t723: '723/T%5B1:a%5D,1:0:3:9:10,2:2',
  // Population series: last 11 years (latest and latest − 10, plus the birth-rate years).
  t1558: '1558/T%5B11:a%5D',
  t943: '943/T%5B1:a%5D',
  t9642: '9642/T%5B1:a%5D',
  t9830: '9830/T%5B1:a%5D,1:0',
  t9810: '9810/T%5B1:a%5D,1:0,2:0',
  // Sector 1 = Agricultura e pesca.
  t11500: '11500/T%5B1:m%5D,1:1',
  // Registered unemployment, sex 0 = Total, age 0 = Total.
  t744: '744/T%5B1:m%5D,1:0,2:0',
  // Axis 0 element 5 = Número de bovinos.
  t62: '62/0:5,T%5B1:a%5D',
  // Area (km²), axis 1 element 0 = Total.
  t77: '77/T%5B1:a%5D,1:0',
  // Births, sex 0 = Total, last 3 years.
  t57: '57/T%5B3:a%5D,1:0',
} as const;

export type TableKey = keyof typeof REQUESTS;
/** Decoded CSV text per table. */
export type Raw = Record<TableKey, string>;

export const GALICIA = '12';
/** Codes kept in the IGE tables for concellos merged in 2013 and 2016. */
export const EXTINCT = new Set(['15026', '15063', '36011', '36012']);
/** Merged concellos: older periods are rebuilt from their predecessors when missing. */
export const MERGED: Record<string, string[]> = {
  '15902': ['15026', '15063'],
  '36902': ['36011', '36012'],
};

/** Pause between requests (ms); IGE asks not to hammer the API. Overridable for tests. */
export const PAUSE_MS = 1000;

export const INDICATORS = [
  { id: 'envellecemento', comparison: 'index' },
  { id: 'maiores_65_pct', comparison: 'points' },
  { id: 'idade_media', comparison: 'points' },
  { id: 'variacion_poboacion_10a', comparison: 'points' },
  { id: 'densidade', comparison: 'index' },
  { id: 'renda_hab', comparison: 'index' },
  { id: 'estranxeiros_pct', comparison: 'points' },
  { id: 'saldo_migratorio', comparison: 'points' },
  { id: 'afiliacion_agro_pct', comparison: 'points' },
  { id: 'paro_rel', comparison: 'index' },
  { id: 'bovino_km2', comparison: 'index' },
  { id: 'natalidade_3a', comparison: 'points' },
] as const;

export type IndicatorId = (typeof INDICATORS)[number]['id'];

export interface Row {
  cod: string;
  nome: string;
  tempoCod: string;
  tempo: string;
  value: number | null;
  /** Other columns (dimension labels), by header name. */
  dims: Record<string, string>;
}

/** Quoted CSV line parser (IGE quotes text fields; numbers are bare). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const REQUIRED_COLUMNS = ['CodTempo', 'Tempo', 'CodEspazo', 'Espazo', 'DatoN', 'DatoT'];

/** Parse one IGE CSV response. Empty DatoN (DatoT "-", "..", "*", …) → null. */
export function parseIgeCsv(text: string, table = 'IGE'): Row[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? '').map((h) => h.trim());
  for (const c of REQUIRED_COLUMNS) {
    if (!header.includes(c)) {
      throw new Error(`${table}: unexpected CSV header (missing ${c}): ${lines[0]?.slice(0, 200)}`);
    }
  }
  const idx = (c: string) => header.indexOf(c);
  const rows: Row[] = [];
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n] as string;
    if (line.trim() === '') continue;
    const v = parseCsvLine(line);
    if (v.length !== header.length) {
      throw new Error(`${table}: line ${n + 1} has ${v.length} fields, expected ${header.length}`);
    }
    const datoN = (v[idx('DatoN')] ?? '').trim();
    let value: number | null = null;
    if (datoN !== '') {
      value = Number(datoN);
      if (!Number.isFinite(value)) throw new Error(`${table}: non-numeric DatoN "${datoN}"`);
    }
    const cod = (v[idx('CodEspazo')] ?? '').trim();
    const espazo = (v[idx('Espazo')] ?? '').trim();
    const dims: Record<string, string> = {};
    header.forEach((h, i) => {
      if (!REQUIRED_COLUMNS.includes(h)) dims[h] = (v[i] ?? '').trim();
    });
    rows.push({
      cod,
      // "15001 Abegondo" → "Abegondo"
      nome: espazo.startsWith(`${cod} `) ? espazo.slice(cod.length + 1) : espazo,
      tempoCod: (v[idx('CodTempo')] ?? '').trim(),
      tempo: (v[idx('Tempo')] ?? '').trim(),
      value,
      dims,
    });
  }
  if (rows.length === 0) throw new Error(`${table}: no data rows`);
  if (!rows.some((r) => r.cod === GALICIA)) throw new Error(`${table}: no Galicia row (code 12)`);
  return rows;
}

/** Values by place code for one period (the latest one present unless given). */
export interface Series {
  periodo: string;
  tempoCod: string;
  values: Map<string, number | null>;
}

function latestCod(rows: Row[]): string {
  return rows.reduce(
    (m, r) => (Number(r.tempoCod) > Number(m) ? r.tempoCod : m),
    rows[0]?.tempoCod ?? '',
  );
}

export function series(rows: Row[], tempoCod = latestCod(rows), table = 'IGE'): Series {
  const sel = rows.filter((r) => r.tempoCod === tempoCod);
  if (sel.length === 0) throw new Error(`${table}: no rows for period ${tempoCod}`);
  const values = new Map<string, number | null>();
  for (const r of sel) {
    if (values.has(r.cod)) throw new Error(`${table}: duplicate row for ${r.cod} in ${tempoCod}`);
    values.set(r.cod, r.value);
  }
  return { periodo: (sel[0] as Row).tempo, tempoCod, values };
}

function filterDim(rows: Row[], dim: string, label: string, table: string): Row[] {
  const out = rows.filter((r) => r.dims[dim] === label);
  if (out.length === 0) throw new Error(`${table}: no rows with ${dim} = "${label}"`);
  return out;
}

/** Population of a place in a year, rebuilt from predecessors for merged concellos. */
function popOf(pop: Map<string, Map<string, number | null>>, year: string, cod: string) {
  const y = pop.get(year);
  if (!y) return null;
  const v = y.get(cod) ?? null;
  if (v !== null) return v;
  const parts = MERGED[cod];
  if (!parts) return null;
  let sum = 0;
  for (const p of parts) {
    const pv = y.get(p);
    if (pv === null || pv === undefined) return null;
    sum += pv;
  }
  return sum;
}

const div = (a: number | null | undefined, b: number | null | undefined) =>
  a === null || a === undefined || b === null || b === undefined || b === 0 ? null : a / b;

interface Computed {
  periodo: string;
  value: (cod: string) => number | null;
}

/** Build every indicator from the parsed tables. */
export function buildIndicators(raw: Raw): {
  concellos: Array<{ cod: string; nome: string }>;
  indicators: Record<IndicatorId, Computed>;
} {
  const t = Object.fromEntries(
    (Object.keys(REQUESTS) as TableKey[]).map((k) => [k, parseIgeCsv(raw[k] ?? '', k)]),
  ) as Record<TableKey, Row[]>;

  const ind723 = (label: string) =>
    series(filterDim(t.t723, 'Indicadores', label, 't723'), undefined, 't723');
  const envell = ind723('Índice de envellecemento');
  const p65 = ind723('Porcentaxe de poboación de 65 e máis anos');
  const idade = ind723('Idade media no 1 de xaneiro');
  const p2064 = ind723('Porcentaxe de poboación entre 20 e 64 anos');

  // Population by year.
  const pop = new Map<string, Map<string, number | null>>();
  for (const r of t.t1558) {
    let y = pop.get(r.tempoCod);
    if (!y) {
      y = new Map();
      pop.set(r.tempoCod, y);
    }
    y.set(r.cod, r.value);
  }
  const years = [...pop.keys()].map(Number).sort((a, b) => a - b);
  const latest = years[years.length - 1] as number;
  const base = latest - 10;
  if (!pop.has(String(base)))
    throw new Error(`t1558: no population for ${base} (latest ${latest})`);
  const popLatest = (cod: string) => popOf(pop, String(latest), cod);

  const densidade = series(t.t943, undefined, 't943');
  const renda = series(t.t9642, undefined, 't9642');
  const estr = series(t.t9830, undefined, 't9830');
  const saldo = series(t.t9810, undefined, 't9810');
  const agro = series(t.t11500, undefined, 't11500');
  const paro = series(t.t744, undefined, 't744');
  const bovinos = series(
    filterDim(t.t62, 'Explotacións e bovinos', 'Número de bovinos', 't62'),
    undefined,
    't62',
  );
  const area = series(t.t77, undefined, 't77');

  // Births: the three most recent years in the response.
  const birthYears = [...new Set(t.t57.map((r) => r.tempoCod))].sort(
    (a, b) => Number(a) - Number(b),
  );
  if (birthYears.length !== 3) {
    throw new Error(`t57: expected 3 years of births, got ${birthYears.join(', ')}`);
  }
  const births = birthYears.map((y) => series(t.t57, y, 't57'));

  // Table 744 reports 0 registered unemployed for the merged concellos 15902 and 36902
  // (checked 2026-10-24: Cerdedo-Cotobade, 5,656 inhabitants, shows 0) while their old codes
  // show "-": an artefact of the source, not a real zero. Published as no data.
  const paroOf = (c: string) => {
    const v = paro.values.get(c) ?? null;
    return v === 0 && MERGED[c] ? null : v;
  };

  const direct = (s: Series): Computed => ({
    periodo: s.periodo,
    value: (c) => s.values.get(c) ?? null,
  });

  const indicators: Record<IndicatorId, Computed> = {
    envellecemento: direct(envell),
    maiores_65_pct: direct(p65),
    idade_media: direct(idade),
    variacion_poboacion_10a: {
      periodo: `${base}–${latest}`,
      value: (c) => {
        const v = div(popLatest(c), popOf(pop, String(base), c));
        return v === null ? null : round((v - 1) * 100, 2);
      },
    },
    densidade: direct(densidade),
    renda_hab: direct(renda),
    estranxeiros_pct: direct(estr),
    saldo_migratorio: direct(saldo),
    afiliacion_agro_pct: direct(agro),
    paro_rel: {
      periodo: paro.periodo,
      value: (c) => {
        const share = p2064.values.get(c) ?? null;
        const p = popLatest(c);
        const active = p === null || share === null ? null : (p * share) / 100;
        const v = div(paroOf(c), active);
        return v === null ? null : round(v * 100, 2);
      },
    },
    bovino_km2: {
      periodo: bovinos.periodo,
      value: (c) => {
        const v = div(bovinos.values.get(c), area.values.get(c));
        return v === null ? null : round(v, 2);
      },
    },
    natalidade_3a: {
      periodo: `${births[0]?.periodo}–${births[2]?.periodo}`,
      value: (c) => {
        let b = 0;
        let p = 0;
        for (let i = 0; i < 3; i++) {
          const bv = births[i]?.values.get(c);
          const pv = popOf(pop, birthYears[i] as string, c);
          if (bv === null || bv === undefined || pv === null) return null;
          b += bv;
          p += pv;
        }
        // Mean annual births ÷ mean population = total births ÷ summed population.
        const v = div(b, p);
        return v === null ? null : round(v * 1000, 2);
      },
    },
  };

  // Concellos: 5-digit codes in the latest population year, minus the extinct ones.
  const concellos = t.t1558
    .filter((r) => r.tempoCod === String(latest) && /^\d{5}$/.test(r.cod) && !EXTINCT.has(r.cod))
    .map((r) => ({ cod: r.cod, nome: r.nome }));
  if (concellos.length === 0) throw new Error('t1558: no concellos in the latest year');
  return { concellos, indicators };
}

const adapter = {
  async fetch(ctx) {
    const pause = Number(ctx.env.IGE_PAUSE_MS ?? PAUSE_MS);
    const decoder = new TextDecoder('latin1');
    const out: Partial<Raw> = {};
    let first = true;
    for (const [key, query] of Object.entries(REQUESTS) as Array<[TableKey, string]>) {
      if (!first && pause > 0) await new Promise((r) => setTimeout(r, pause));
      first = false;
      const res = await ctx.get(BASE + query, { timeoutMs: 60_000 });
      out[key] = decoder.decode(res.body);
    }
    return out as Raw;
  },

  normalize(raw, _ctx) {
    const { concellos, indicators } = buildIndicators(raw);
    const features: Feature[] = concellos.map(({ cod, nome }) => {
      const properties: Record<string, unknown> = { codigo_ine: cod, nome };
      for (const { id, comparison } of INDICATORS) {
        const ind = indicators[id];
        const value = ind.value(cod);
        const galicia = ind.value(GALICIA);
        properties[id] = value;
        properties[`${id}_galicia`] = galicia;
        properties[`${id}_rel`] = compareWithGalicia(value, galicia, comparison);
        properties[`${id}_periodo`] = ind.periodo;
      }
      return { type: 'Feature', id: cod, geometry: null, properties };
    });
    return {
      collection: { type: 'FeatureCollection', features },
      // The CSV API gives no publication time.
      publishedAt: null,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
