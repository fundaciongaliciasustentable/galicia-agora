// A century of population in every concello: the thirteen censuses from 1900 to 2021, brought
// to today's 313 concellos. Feeds /pulso/seculo/ and draws on the concellos layer.
//
// Source: INE «Alteraciones de los municipios en los Censos de Población desde 1842». The tool
// has no bulk download: one GET per municipality code (search=3), spaced out. Codes asked:
// 001–099 and 901–999 (current and post-1970) and 500–599 (disappeared 1857–1970) for each
// Galician province, ~470 requests (checked on 1/11/2026; datos/fontes/ine-censos-historicos).
//
// Bringing the series to today's map, from the INE notes on each municipality:
// - absorbed whole («se integra / se agrupa en el municipio X»), merged («se incorpora a (X)»)
//   or renamed with a new code («cambia de nombre y desaparece el municipio X»): their figures
//   are added to X, today's concello;
// - split off after 1900 («aparece … porque se segrega del municipio X»): the new concello has
//   no figure before it existed and its parent carries its people until then, so the two form
//   a comparable unit; the change since 1900 is computed on that unit.
// Population «de derecho» to 1991 and resident from 2001, as the INE gives it.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { compareWithGalicia, round } from '../../lib/adapter.ts';

export const BASE = 'https://www.ine.es/intercensal/';
export const YEARS = [1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1981, 1991, 2001, 2011, 2021];
const PROVINCES = ['15', '27', '32', '36'];
const BLOCKS: Array<[number, number, number]> = [
  [1, 99, 99],
  [500, 599, 6],
  [901, 999, 6],
];
const DEFAULT_PAUSE_MS = 1000;

export const queryUrl = (code: string) =>
  `${BASE}intercensal.do?search=3&codigoProvincia=${code.slice(0, 2)}&codigoMunicipio=${code.slice(2)}&btnBuscarCod=Consultar+selecci%C3%B3n`;

export interface Municipality {
  code: string;
  name: string;
  /** Census year → population «de derecho» (resident from 2001). */
  pop: Record<number, number>;
  note: string;
}

export interface Raw {
  municipalities: Municipality[];
}

function textOf(page: string): string {
  return page
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** One INE answer → municipality, or null for «no such code». */
export function parsePage(page: string): Municipality | null {
  const s = textOf(page);
  const m =
    /Municipio: (\d{5}) (.*?) Censo (.*?) Población de Hecho (.*?) Población de Derecho (.*?) Hogares (.*?)(?: \[1\]| Entre| NOTAS)/.exec(
      s,
    );
  if (!m) return null;
  const [, code, name, header, , derecho] = m as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const years = [...header.matchAll(/\b(1[89]\d\d|20\d\d)\b/g)].map((x) => Number(x[1]));
  const values = [...derecho.matchAll(/\.\.|\d+/g)].map((x) =>
    x[0] === '..' ? null : Number(x[0]),
  );
  const pop: Record<number, number> = {};
  years.forEach((y, i) => {
    const v = values[i];
    // Some files repeat a census column (1920 twice): keep the first.
    if (v !== null && v !== undefined && !(y in pop)) pop[y] = v;
  });
  const start = s.indexOf('Hogares');
  const end = s.indexOf('NOTAS');
  const note = s
    .slice(start, end > start ? end : undefined)
    .replace(/^Hogares[\d .]*/, '')
    .trim();
  return { code, name: name.trim(), pop, note };
}

/** «Coruña, A» → «A Coruña»; «Illa de Arousa (A)» → «A Illa de Arousa». */
export function readable(n: string): string {
  return n.replace(/^(.*), (A|O|As|Os)$/, '$2 $1').replace(/^(.*) \((A|O|As|Os)\)$/, '$2 $1');
}

export interface Harmonised {
  code: string;
  name: string;
  /** Own figures on today's boundaries where they can be rebuilt; null before it existed. */
  own: Array<number | null>;
  /** Codes of the comparable unit (itself, or itself with the concello it split from). */
  unit: string[];
  /** Names of municipalities whose people are added in (absorbed, merged, renamed). */
  includes: string[];
}

export function harmonise(list: Municipality[]): Harmonised[] {
  const byCode = new Map(list.map((m) => [m.code, m]));
  const current = list.filter((m) => m.pop[2021] !== undefined);
  const into = new Map<string, string>();
  const splitFrom = new Map<string, string>();
  for (const m of list) {
    const absorbed =
      /se (?:integra|agrupa) en el municipio (\d{5})/.exec(m.note) ??
      /desaparece este municipio porque se incorpora a \((\d{5})\)/.exec(m.note);
    if (absorbed) into.set(m.code, absorbed[1] as string);
    const renamed = /cambia de nombre y desaparece el municipio (\d{5})/.exec(m.note);
    if (renamed) into.set(renamed[1] as string, m.code);
    const split =
      /Censo de (\d{4}) y el anterior, aparece este municipio porque se segrega del municipio (\d{5})/.exec(
        m.note,
      );
    if (split && Number(split[1]) > (YEARS[0] as number)) splitFrom.set(m.code, split[2] as string);
  }
  const out = new Map<string, Harmonised>();
  for (const m of current) {
    out.set(m.code, {
      code: m.code,
      name: readable(m.name),
      own: YEARS.map((y) => m.pop[y] ?? null),
      unit: [m.code],
      includes: [],
    });
  }
  // Follow chains (a municipality absorbed into one that later merged).
  const finalTarget = (code: string): string => {
    let c = code;
    for (let i = 0; i < 5 && into.has(c); i++) c = into.get(c) as string;
    return c;
  };
  for (const [from] of into) {
    const target = out.get(finalTarget(from));
    const src = byCode.get(from);
    if (!target || !src || target.code === from) continue;
    target.includes.push(readable(src.name));
    YEARS.forEach((y, i) => {
      const v = src.pop[y];
      if (v !== undefined) target.own[i] = (target.own[i] ?? 0) + v;
    });
  }
  for (const [child, parent] of splitFrom) {
    const c = out.get(child);
    const p = out.get(parent);
    if (!c || !p) continue;
    const unit = [...new Set([...p.unit, ...c.unit])].sort();
    for (const code of unit) (out.get(code) as Harmonised).unit = unit;
  }
  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code));
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const pause = Number(ctx.env.GA_PAUSE_MS ?? DEFAULT_PAUSE_MS);
    // Tests pass a short list of codes; production walks every block.
    const only = ctx.env.INE_CODES?.split(',').filter(Boolean);
    const municipalities: Municipality[] = [];
    const ask = async (code: string) => {
      const res = await ctx.get(queryUrl(code), { timeoutMs: 60_000 });
      if (pause > 0) await new Promise((r) => setTimeout(r, pause));
      return parsePage(res.body.toString('utf8'));
    };
    if (only) {
      for (const code of only) {
        const m = await ask(code);
        if (m) municipalities.push(m);
      }
      return { municipalities };
    }
    for (const prov of PROVINCES) {
      for (const [from, to, stopAfter] of BLOCKS) {
        let misses = 0;
        for (let n = from; n <= to; n++) {
          const m = await ask(`${prov}${String(n).padStart(3, '0')}`);
          if (!m) {
            misses++;
            if (misses >= stopAfter) break;
            continue;
          }
          misses = 0;
          municipalities.push(m);
        }
      }
    }
    if (municipalities.length < 300)
      throw new Error(`INE returned only ${municipalities.length} municipalities`);
    return { municipalities };
  },

  normalize(raw: Raw) {
    const list = harmonise(raw.municipalities);
    const byCode = new Map(list.map((h) => [h.code, h]));
    // Before a split the parent carries the child's people, so the unit is the sum of the
    // members that have a figure; it is missing only when none has one.
    const unitPop = (h: Harmonised) =>
      YEARS.map((_, i) => {
        const vals = h.unit
          .map((c) => byCode.get(c)?.own[i])
          .filter((v): v is number => v !== null && v !== undefined);
        return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
      });
    const galicia = YEARS.map((_, i) => list.reduce((s, h) => s + (h.own[i] ?? 0), 0));
    const galiciaChange = round(
      (100 * ((galicia[12] as number) - (galicia[0] as number))) / (galicia[0] as number),
      1,
    );
    const features: Feature[] = list.map((h) => {
      const unit = unitPop(h);
      const base = unit[0];
      const index = unit.map((v) => (v === null || !base ? null : round((100 * v) / base, 1)));
      const change =
        index[12] === null || index[12] === undefined ? null : round(index[12] - 100, 1);
      return {
        type: 'Feature',
        id: h.code,
        geometry: null,
        properties: {
          codigo_ine: h.code,
          nome: h.name,
          censos: YEARS,
          poboacion: h.own,
          unidade: h.unit,
          unidade_poboacion: unit,
          indice_1900: index,
          inclue: h.includes,
          galicia: galicia,
          variacion_1900: change,
          variacion_1900_galicia: galiciaChange,
          variacion_1900_rel: compareWithGalicia(change, galiciaChange, 'points'),
          variacion_1900_periodo: '1900–2021',
        },
      };
    });
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
};

export default adapter;
