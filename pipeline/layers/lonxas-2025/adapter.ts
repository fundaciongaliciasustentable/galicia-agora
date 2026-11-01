// The fresh fish sold at first sale in every Galician lonxa, day by day through 2025. Feeds
// /pulso/lonxas/.
//
// Source: Consellería do Mar, first-sale notes (pescadegalicia.gal), one CSV per year with a
// row per day × lonxa × species: kg, euros and mean price (datos/fontes/lonxas-primeira-venda).
// Only fresh fish: aquaculture and frozen fish are in other files.
//
// The file has no coordinates. lonxas.json places each lonxa on a point of the IGN Nomenclátor
// Geográfico Básico (CC BY 4.0): its port when the NGBE names one for that place, otherwise the
// town or village the lonxa is named after. Two lonxas have no verifiable point and are
// published without geometry. A lonxa name missing from lonxas.json stops the run: the source
// changed and the table has to be checked by hand.
//
// Per lonxa and day the layer keeps euros by species group and total kg; prices of single
// species per lonxa are not published (in a small lonxa one row can be one boat).

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { point } from '../../lib/adapter.ts';
import places from './lonxas.json' with { type: 'json' };

export const YEAR = 2025;
export const DAYS = 365;
export const fileUrl = (year: number) =>
  `https://www.pescadegalicia.gal/descargas/pescafresca/pescafresca${year}.csv`;

export const GROUPS = ['peixes', 'bivalvos', 'cefalopodos', 'crustaceos', 'outros'] as const;
export type Group = (typeof GROUPS)[number];
const GROUP_OF: Record<string, Group> = {
  Peixes: 'peixes',
  Bivalvos: 'bivalvos',
  Cefalópodos: 'cefalopodos',
  Crustáceos: 'crustaceos',
};

interface Place {
  lonxa: string;
  nome: string;
  ngbe_id: string | null;
  ngbe_nome: string | null;
  ngbe_tipo: string | null;
  lonlat: [number, number] | null;
  nota?: string;
}
export const PLACES = places as Place[];

export interface Raw {
  csv: string;
  lastModified: string | null;
}

export interface Row {
  day: number;
  group: Group;
  species: string;
  province: string;
  zone: string;
  lonxa: string;
  kg: number;
  eur: number;
}

const num = (s: string | undefined) => Number((s ?? '').replace(',', '.'));

/** dd/mm/aaaa → day of the year from 0, or -1 outside YEAR. */
export function dayOfYear(date: string, year = YEAR): number {
  const [d, m, y] = date.split('/').map(Number);
  if (y !== year || !d || !m) return -1;
  return Math.round((Date.UTC(year, m - 1, d) - Date.UTC(year, 0, 1)) / 86_400_000);
}

export function parseRows(text: string): Row[] {
  const out: Row[] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const p = line.split(';');
    if (p.length < 10) continue;
    const day = dayOfYear(p[0] as string);
    if (day < 0) continue;
    out.push({
      day,
      group: GROUP_OF[p[1] as string] ?? 'outros',
      species: p[3] as string,
      province: p[4] as string,
      zone: p[5] as string,
      lonxa: p[6] as string,
      kg: num(p[7]),
      eur: num(p[8]),
    });
  }
  return out;
}

interface Tally {
  eur: Record<Group, number[]>;
  kg: number[];
  species: Map<string, number>;
  speciesByDay: Array<Map<string, number>>;
  province: string;
  zone: string;
}

const tally = (): Tally => ({
  eur: Object.fromEntries(GROUPS.map((g) => [g, Array(DAYS).fill(0)])) as Record<Group, number[]>,
  kg: Array(DAYS).fill(0),
  species: new Map(),
  speciesByDay: [],
  province: '',
  zone: '',
});

function add(t: Tally, r: Row, byDay: boolean) {
  (t.eur[r.group] as number[])[r.day] = ((t.eur[r.group] as number[])[r.day] ?? 0) + r.eur;
  t.kg[r.day] = (t.kg[r.day] ?? 0) + r.kg;
  t.species.set(r.species, (t.species.get(r.species) ?? 0) + r.eur);
  if (byDay) {
    let m = t.speciesByDay[r.day];
    if (!m) {
      m = new Map();
      t.speciesByDay[r.day] = m;
    }
    m.set(r.species, (m.get(r.species) ?? 0) + r.eur);
  }
}

const top = (m: Map<string, number>, n: number) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([especie, eur]) => ({ especie, importe: Math.round(eur) }));

function summary(t: Tally) {
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const eur = GROUPS.reduce((s, g) => s + sum(t.eur[g]), 0);
  const days = t.kg.filter((_, i) => GROUPS.some((g) => (t.eur[g][i] ?? 0) > 0)).length;
  return {
    importe_total: Math.round(eur),
    kg_total: Math.round(sum(t.kg)),
    dias_venda: days,
    importe_dia: Object.fromEntries(GROUPS.map((g) => [g, t.eur[g].map((v) => Math.round(v))])),
    kg_dia: t.kg.map((v) => Math.round(v)),
    especies: top(t.species, 3),
  };
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const res = await ctx.get(fileUrl(YEAR), { timeoutMs: 180_000 });
    return { csv: res.body.toString('utf8'), lastModified: res.lastModified ?? null };
  },

  normalize(raw: Raw) {
    const rows = parseRows(raw.csv);
    const known = new Map(PLACES.map((p) => [p.lonxa, p]));
    const byLonxa = new Map<string, Tally>();
    const galicia = tally();
    for (const r of rows) {
      if (!known.has(r.lonxa)) throw new Error(`lonxa not in lonxas.json: «${r.lonxa}»`);
      let t = byLonxa.get(r.lonxa);
      if (!t) {
        t = tally();
        t.province = r.province;
        t.zone = r.zone;
        byLonxa.set(r.lonxa, t);
      }
      add(t, r, false);
      add(galicia, r, true);
    }
    const features: Feature[] = [];
    for (const p of PLACES) {
      const t = byLonxa.get(p.lonxa);
      if (!t) continue;
      features.push({
        type: 'Feature',
        id: p.lonxa,
        geometry: p.lonlat ? point(p.lonlat[0], p.lonlat[1]) : null,
        properties: {
          ambito: 'lonxa',
          lonxa: p.lonxa,
          nome: p.nome,
          provincia: t.province,
          zona: t.zone,
          posicion: p.ngbe_id ? `NGBE ${p.ngbe_id}: ${p.ngbe_nome} (${p.ngbe_tipo})` : null,
          nota_posicion: p.nota ?? null,
          ...summary(t),
        },
      });
    }
    features.sort(
      (a, b) => Number(b.properties.importe_total) - Number(a.properties.importe_total),
    );
    features.push({
      type: 'Feature',
      id: 'galicia',
      geometry: null,
      properties: {
        ambito: 'galicia',
        lonxa: null,
        nome: 'Galicia',
        provincia: null,
        zona: null,
        posicion: null,
        nota_posicion: null,
        ...summary(galicia),
        especie_dia: Array.from({ length: DAYS }, (_, i) => {
          const m = galicia.speciesByDay[i];
          return m ? ((top(m, 1)[0]?.especie as string) ?? null) : null;
        }),
      },
    });
    const publishedAt = raw.lastModified ? new Date(raw.lastModified).toISOString() : null;
    return { collection: { type: 'FeatureCollection', features }, publishedAt };
  },
};

export default adapter;
