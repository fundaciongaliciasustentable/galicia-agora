// Trips into and out of the seven Galician cities, hour by hour, for a mean Wednesday and a
// mean Sunday (MITMA big-data mobility, May 2025). Feeds the /cidades/ animation.
//
// Each city has two rings (aneis.json): ring 0 is the concello, ring 1 adds its urban area.
// Rings are unions of whole MITMA municipal zones; the adapter refuses a ring that would cut
// one of MITMA's grouped rural zones (_AM) in half, since its trips cannot be split.
//
// The eight national daily files (≈1.2 GB gzip in all) are streamed and reduced in fetch to
// the trips that touch a ring; zones outside every ring fold into one bucket.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { point } from '../../lib/adapter.ts';
import {
  CENTROIDS_URL,
  DAY_TIMEOUT_MS,
  dayUrl,
  municipalZones,
  POPULATION_URL,
  reduceDay,
  ZONING_URL,
  zoneCentroids,
  zonePopulation,
} from '../../lib/mitma.ts';
import aneis from './aneis.json' with { type: 'json' };

export const DAY_KINDS = ['mercores', 'domingo'] as const;
export type DayKind = (typeof DAY_KINDS)[number];
/** Reference days: May 2025, inside MITMA's 2022–June 2025 method block. 4 May (end of a
 * long weekend) is replaced by 1 June. */
export const DAYS: Record<DayKind, string[]> = {
  mercores: ['2025-05-07', '2025-05-14', '2025-05-21', '2025-05-28'],
  domingo: ['2025-05-11', '2025-05-18', '2025-05-25', '2025-06-01'],
};
export const RINGS = ['anel0', 'anel1'] as const;
export type Ring = (typeof RINGS)[number];
const OUTSIDE = 'x';

interface City {
  codigo_ine: string;
  nome: string;
  anel0: string[];
  anel1: string[];
}
export const CITIES = aneis.cidades as City[];

export interface Raw {
  zoning: string;
  population: string;
  shp: Buffer;
  dbf: Buffer;
  /** Per date: [`${hour}|${origin}|${destination}`, trips] with zones outside rings folded. */
  days: Record<string, Array<[string, number]>>;
  lastModified: string | null;
}

/** MITMA zones of a ring; throws if a zone also holds concellos outside the ring. */
export function ringZones(
  concellos: string[],
  zoneOf: Map<string, string>,
  members: Map<string, Set<string>>,
): Set<string> {
  const zones = new Set<string>();
  for (const c of concellos) {
    const z = zoneOf.get(c);
    if (!z) throw new Error(`Concello ${c} has no MITMA zone`);
    zones.add(z);
  }
  for (const z of zones) {
    const stray = [...(members.get(z) ?? [])].filter((c) => !concellos.includes(c));
    if (stray.length)
      throw new Error(`Zone ${z} mixes concellos outside the ring: ${stray.join(', ')}`);
  }
  return zones;
}

function allRingZones(zoning: string): Set<string> {
  const { zoneOf, members } = municipalZones(zoning);
  const all = new Set<string>();
  for (const c of CITIES)
    for (const r of RINGS) for (const z of ringZones(c[r], zoneOf, members)) all.add(z);
  return all;
}

export interface Hourly {
  entradas: number[];
  saidas: number[];
  internas: number[];
}

/** Hourly flows of one ring on one day. */
export function ringFlows(flows: Iterable<[string, number]>, zones: Set<string>): Hourly {
  const h: Hourly = {
    entradas: Array(24).fill(0),
    saidas: Array(24).fill(0),
    internas: Array(24).fill(0),
  };
  for (const [key, v] of flows) {
    const [hs, o, d] = key.split('|') as [string, string, string];
    const hour = Number(hs);
    const oi = zones.has(o);
    const di = zones.has(d);
    const k: keyof Hourly | null = oi && di ? 'internas' : di ? 'entradas' : oi ? 'saidas' : null;
    if (k) h[k][hour] = (h[k][hour] ?? 0) + v;
  }
  return h;
}

/** Hour-by-hour mean over days, rounded to whole trips. */
export function meanHourly(days: Hourly[]): Hourly {
  const m = (k: keyof Hourly) =>
    Array.from({ length: 24 }, (_, i) =>
      Math.round(days.reduce((s, d) => s + (d[k][i] as number), 0) / days.length),
    );
  return { entradas: m('entradas'), saidas: m('saidas'), internas: m('internas') };
}

/** Highest running balance (entradas − saídas) over the day, from 00:00; never below 0. */
export function peakPresence(h: Hourly): number {
  let run = 0;
  let best = 0;
  for (let i = 0; i < 24; i++) {
    run += (h.entradas[i] as number) - (h.saidas[i] as number);
    best = Math.max(best, run);
  }
  return best;
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const [zoning, population, shp, dbf] = await Promise.all([
      ctx.get(ZONING_URL),
      ctx.get(POPULATION_URL),
      ctx.get(`${CENTROIDS_URL}.shp`),
      ctx.get(`${CENTROIDS_URL}.dbf`),
    ]);
    const zoningText = zoning.body.toString('utf8');
    const keepZones = allRingZones(zoningText);
    const days: Raw['days'] = {};
    let lastModified: string | null = null;
    // One day at a time: each file is ~150 MB and only its reduction is kept.
    for (const date of DAY_KINDS.flatMap((k) => DAYS[k])) {
      const res = await ctx.get(dayUrl(date), { timeoutMs: DAY_TIMEOUT_MS });
      const { flows } = await reduceDay(
        res.body,
        (o, d) => keepZones.has(o) || keepZones.has(d),
        (z) => (keepZones.has(z) ? z : OUTSIDE),
      );
      days[date] = [...flows];
      if (
        res.lastModified &&
        (!lastModified || Date.parse(res.lastModified) > Date.parse(lastModified))
      )
        lastModified = res.lastModified;
    }
    return {
      zoning: zoningText,
      population: population.body.toString('utf8'),
      shp: shp.body,
      dbf: dbf.body,
      days,
      lastModified,
    };
  },

  normalize(raw: Raw) {
    const { zoneOf, members } = municipalZones(raw.zoning);
    const pop = zonePopulation(raw.population);
    const centroids = zoneCentroids(raw.shp, raw.dbf);
    const features: Feature[] = CITIES.map((city) => {
      const props: Record<string, unknown> = {
        codigo_ine: city.codigo_ine,
        nome: city.nome,
        dias_mercores: DAYS.mercores,
        dias_domingo: DAYS.domingo,
      };
      for (const ring of RINGS) {
        const zones = ringZones(city[ring], zoneOf, members);
        const residentes = Math.round([...zones].reduce((s, z) => s + (pop.get(z) ?? 0), 0));
        const node: Record<string, unknown> = { concellos: [...city[ring]].sort(), residentes };
        for (const kind of DAY_KINDS) {
          const perDay = DAYS[kind].map((date) => {
            const flows = raw.days[date];
            if (!flows) throw new Error(`Missing MITMA day ${date}`);
            return ringFlows(flows, zones);
          });
          const mean = meanHourly(perDay);
          node[kind] = mean;
          const peak = peakPresence(mean);
          props[`entradas_${kind}_${ring}`] = sum(mean.entradas);
          props[`saidas_${kind}_${ring}`] = sum(mean.saidas);
          props[`presenza_max_${kind}_${ring}`] = peak;
          props[`presenza_max_pct_${kind}_${ring}`] = Math.round((1000 * peak) / residentes) / 10;
        }
        props[ring] = node;
        props[`residentes_${ring}`] = residentes;
      }
      const c = centroids.get(zoneOf.get(city.codigo_ine) as string);
      if (!c) throw new Error(`No MITMA centroid for ${city.nome}`);
      return {
        type: 'Feature',
        id: city.codigo_ine,
        geometry: point(c[0], c[1]),
        properties: props,
      };
    });
    const publishedAt = raw.lastModified ? new Date(raw.lastModified).toISOString() : null;
    return { collection: { type: 'FeatureCollection', features }, publishedAt };
  },
};

export default adapter;
