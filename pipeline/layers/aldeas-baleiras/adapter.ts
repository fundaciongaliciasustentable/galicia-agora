// Aldeas baleiras: every singular population entity of Galicia in the INE Nomenclátor
// (population by unit at 1 January, 2000 onwards), with the year it was left without anyone.
//
// The INE publishes one national ZIP per year with a fixed-width text file (code of 11 digits,
// name, total, men, women; Latin-1 up to 2023, UTF-8 since). There are 26 of them (~210 MB), so
// the layer keeps its own state (ctx.readPrevious, ADR 0010) and only downloads the years after
// the last one it has. For each entity it carries forward:
//   - baleira_desde: first year of the current run of zeros (null if inhabited now);
//   - baleira_antes_2000: already at 0 in 2000 (so its emptying year is unknown);
//   - rexurdiu: it was at 0 some year and has people again now;
//   - anos_baleira: every year it was at 0, so the page can switch it off and on year by year
//     (also as ",2003,2004," text, which vector tiles keep and MapLibre can search).
// Singular entities are the units whose code ends in 00 (nucleus) but not in 0000 (collective).
// Codes of the concellos merged in 2013 and 2016 changed: their entities are matched to their
// predecessors by name the first year they appear, so their history continues.
//
// Positions come from the IET points (entidades-poboacion, same 11-digit code; failing that, the
// same name in the same concello). Entities without a point are published without geometry.

import type {
  Adapter,
  AdapterContext,
  Feature,
  FeatureCollection,
  PublishedLayer,
} from '../../lib/adapter.ts';
import { HttpError } from '../../lib/http.ts';
import { zipChunks, zipEntries } from '../../lib/zip.ts';

export const FIRST_YEAR = 2000;
export const zipUrl = (year: number) =>
  `https://www.ine.es/nomen_files/nacional/es/Nacional_${year}.zip`;
const PROVINCES = new Set(['15', '27', '32', '36']);
/** Concellos created by merger → the codes they replaced. */
export const MERGED: Record<string, string[]> = {
  '15902': ['15026', '15063'],
  '36902': ['36011', '36012'],
};

export interface Unit {
  name: string;
  /** Name of its collective entity (the parish, as the INE writes it). */
  parish: string;
  pop: number;
}
export type Year = Map<string, Unit>;

export interface Raw {
  previous: PublishedLayer | null;
  places: PublishedLayer;
  years: Array<[number, Year]>;
}

export interface State {
  codigo: string;
  nome_ine: string;
  parroquia_ine: string;
  pob_2000: number | null;
  pob: number;
  ano: number;
  primeiro_ano: number;
  baleira_desde: number | null;
  baleira_antes_2000: boolean;
  rexurdiu: boolean;
  anos_baleira: number[];
}

/** Galician singular entities of one Nomenclátor text file. */
export function parseNomenclator(text: string): Year {
  const out: Year = new Map();
  const parishes = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!PROVINCES.has(line.slice(0, 2))) continue;
    const m = /^(\d{11})(.*?)\s+(\d+)(?:\s+\d+\s+\d+)?\s*$/.exec(line);
    if (!m) throw new Error(`Nomenclátor: unreadable line "${line.slice(0, 60)}"`);
    const code = m[1] as string;
    const name = (m[2] as string).trim();
    if (code.endsWith('0000')) {
      parishes.set(code.slice(0, 7), name);
      continue;
    }
    if (!code.endsWith('00')) continue;
    out.set(code, { name, parish: parishes.get(code.slice(0, 7)) ?? '', pop: Number(m[3]) });
  }
  if (out.size === 0) throw new Error('Nomenclátor: no Galician entities');
  return out;
}

/** The population text member of a national ZIP, decoded. */
export async function readZip(buf: Buffer): Promise<Year> {
  const entries = zipEntries(buf).filter(
    (e) => !/\.xlsx?$/i.test(e.name) && !/_(edad|naci)/i.test(e.name),
  );
  const entry = entries[0];
  if (!entry || entries.length > 1) {
    throw new Error(`Nomenclátor ZIP: expected one text member, got ${entries.map((e) => e.name)}`);
  }
  const chunks: Buffer[] = [];
  for await (const c of zipChunks(buf, entry)) chunks.push(c);
  const bytes = Buffer.concat(chunks);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('latin1').decode(bytes);
  }
  return parseNomenclator(text);
}

/** Lower case, no accents, articles in front: "GALLADO (O)" and "O Gallado" → "o gallado". */
export function normName(s: string): string {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(s.trim());
  const name = m ? `${m[2]} ${m[1]}` : s;
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** "GALLADO (O)" → "O Gallado" (only for entities without an IET name). */
export function titleName(s: string): string {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(s.trim());
  const name = (m ? `${m[2]} ${m[1]}` : s).toLowerCase();
  return name.replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

/** Carry the state forward through the given years, in order. */
export function advance(state: Map<string, State>, years: Array<[number, Year]>): void {
  for (const [year, units] of years) {
    // Entities of a merged concello the first year they appear: take their predecessor's state.
    for (const [code, u] of units) {
      const olds = MERGED[code.slice(0, 5)];
      if (!olds || state.has(code)) continue;
      // Same parish and name; failing that, a name found once in the old concellos.
      const key = normName(u.name);
      const sameName = [...state.values()].filter(
        (s) => olds.includes(s.codigo.slice(0, 5)) && normName(s.nome_ine) === key,
      );
      const sameParish = sameName.filter((s) => normName(s.parroquia_ine) === normName(u.parish));
      const found = sameParish.length === 1 ? sameParish : sameName;
      if (found.length === 1) {
        const prev = found[0] as State;
        state.set(code, { ...prev, codigo: code, anos_baleira: [...prev.anos_baleira] });
        state.delete(prev.codigo);
      }
    }
    for (const [code, u] of units) {
      let s = state.get(code);
      if (!s) {
        s = {
          codigo: code,
          nome_ine: u.name,
          parroquia_ine: u.parish,
          pob_2000: year === FIRST_YEAR ? u.pop : null,
          pob: u.pop,
          ano: year,
          primeiro_ano: year,
          baleira_desde: u.pop === 0 ? year : null,
          baleira_antes_2000: u.pop === 0 && year === FIRST_YEAR,
          rexurdiu: false,
          anos_baleira: u.pop === 0 ? [year] : [],
        };
        state.set(code, s);
        continue;
      }
      if (u.pop === 0) {
        if (s.baleira_desde === null) s.baleira_desde = year;
        if (!s.anos_baleira.includes(year)) s.anos_baleira.push(year);
      }
      if (u.pop > 0 && s.baleira_desde !== null) {
        s.rexurdiu = true;
        s.baleira_desde = null;
        s.baleira_antes_2000 = false;
      }
      s.nome_ine = u.name;
      s.parroquia_ine = u.parish;
      s.pob = u.pop;
      s.ano = year;
    }
  }
}

export function build(raw: Raw): { features: Feature[]; last: number } {
  const state = new Map<string, State>();
  for (const f of raw.previous?.collection.features ?? []) {
    const p = f.properties;
    state.set(String(p.codigo), {
      codigo: String(p.codigo),
      nome_ine: String(p.nome_ine),
      parroquia_ine: String(p.parroquia_ine ?? ''),
      pob_2000: (p.pob_2000 as number | null) ?? null,
      pob: Number(p.pob),
      ano: Number(p.ano),
      primeiro_ano: Number(p.primeiro_ano),
      baleira_desde: (p.baleira_desde as number | null) ?? null,
      baleira_antes_2000: Boolean(p.baleira_antes_2000),
      rexurdiu: Boolean(p.rexurdiu),
      anos_baleira: (p.anos_baleira as number[] | undefined) ?? [],
    });
  }
  advance(state, raw.years);
  const last = Math.max(...[...state.values()].map((s) => s.ano));

  // IET points by code, and by concello + name for the rest.
  const byCode = new Map<string, Feature>();
  const byName = new Map<string, Feature[]>();
  for (const f of raw.places.collection.features) {
    if (f.geometry?.type !== 'Point') continue;
    const p = f.properties;
    byCode.set(String(p.codigo), f);
    const key = `${p.codigo_ine}|${normName(String(p.nome))}`;
    byName.set(key, [...(byName.get(key) ?? []), f]);
  }

  const features: Feature[] = [];
  for (const s of [...state.values()].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    // Only the entities of the current Nomenclátor.
    if (s.ano !== last) continue;
    let place = byCode.get(s.codigo);
    let match: 'codigo' | 'nome' | null = place ? 'codigo' : null;
    if (!place) {
      const same = byName.get(`${s.codigo.slice(0, 5)}|${normName(s.nome_ine)}`);
      if (same?.length === 1) {
        place = same[0];
        match = 'nome';
      }
    }
    const [lon, lat] = (place?.geometry?.coordinates as [number, number] | undefined) ?? [];
    features.push({
      type: 'Feature',
      id: s.codigo,
      geometry: lon === undefined ? null : { type: 'Point', coordinates: [lon, lat as number] },
      properties: {
        ...s,
        nome: place ? String(place.properties.nome) : titleName(s.nome_ine),
        codigo_ine: s.codigo.slice(0, 5),
        anos_baleira_txt: s.anos_baleira.length ? `,${s.anos_baleira.join(',')},` : '',
        posicion: match,
      },
    });
  }
  return { features, last };
}

const adapter = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('aldeas-baleiras needs ctx.readLayer');
    const previous = (await ctx.readPrevious?.()) ?? null;
    const places = await ctx.readLayer('entidades-poboacion');
    const had = previous?.collection.features.reduce(
      (m, f) => Math.max(m, Number(f.properties.ano)),
      0,
    );
    const years: Array<[number, Year]> = [];
    for (let y = had ? had + 1 : FIRST_YEAR; y <= ctx.now.getUTCFullYear(); y++) {
      try {
        const res = await ctx.get(zipUrl(y), { timeoutMs: 300_000 });
        years.push([y, await readZip(res.body)]);
      } catch (err) {
        // The next year is not out yet.
        if (err instanceof HttpError && err.status === 404) break;
        throw err;
      }
    }
    return { previous, places, years };
  },

  normalize(raw) {
    const { features, last } = build(raw);
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    // Population at 1 January of the latest year.
    return { collection, publishedAt: `${last}-01-01T00:00:00Z` };
  },
} satisfies Adapter<Raw>;

export default adapter;
