// Galicia in motion: trips between MITMA municipal zones inside Galicia, hour by hour, for a
// mean Wednesday and a mean Sunday (big-data mobility, May 2025). Feeds /movemento/.
//
// One line per directed pair of zones (centroid to centroid) with at least MIN_TRIPS trips on
// the mean Wednesday or the mean Sunday: about 4,200 pairs and 97 % of the trips between
// zones (measured 1/11/2026). Trips inside a zone, and to or from outside Galicia (1 %), are
// not lines and are left out. Rural concellos come grouped in MITMA zones (_AM): a line
// starts at the group's centroid, never at one of its concellos.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { round } from '../../lib/adapter.ts';
import {
  CENTROIDS_URL,
  DAY_KINDS,
  DAY_TIMEOUT_MS,
  type DayKind,
  dayUrl,
  municipalZones,
  NAMES_URL,
  REFERENCE_DAYS,
  reduceDay,
  ZONING_URL,
  zoneCentroids,
  zoneNames,
} from '../../lib/mitma.ts';

/** Mean daily trips a pair needs on either day kind to be drawn. */
export const MIN_TRIPS = 50;

export interface Raw {
  zoning: string;
  names: string;
  shp: Buffer;
  dbf: Buffer;
  /** Per date: [`${hour}|${origin}|${destination}`, trips], Galician zones only, o ≠ d. */
  days: Record<string, Array<[string, number]>>;
  lastModified: string | null;
}

const RAD = Math.PI / 180;
/** Great-circle distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Mean hourly trips per directed pair over the days of one kind. */
export function meanPairs(days: Array<Array<[string, number]>>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const flows of days) {
    for (const [key, v] of flows) {
      const [h, o, d] = key.split('|') as [string, string, string];
      const pair = `${o}|${d}`;
      let hours = out.get(pair);
      if (!hours) {
        hours = Array(24).fill(0) as number[];
        out.set(pair, hours);
      }
      hours[Number(h)] = (hours[Number(h)] ?? 0) + v / days.length;
    }
  }
  return out;
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const [zoning, names, shp, dbf] = await Promise.all([
      ctx.get(ZONING_URL),
      ctx.get(NAMES_URL),
      ctx.get(`${CENTROIDS_URL}.shp`),
      ctx.get(`${CENTROIDS_URL}.dbf`),
    ]);
    const zoningText = zoning.body.toString('utf8');
    const galician = new Set(municipalZones(zoningText).members.keys());
    const days: Raw['days'] = {};
    let lastModified: string | null = null;
    for (const date of DAY_KINDS.flatMap((k) => REFERENCE_DAYS[k])) {
      const res = await ctx.get(dayUrl(date), { timeoutMs: DAY_TIMEOUT_MS });
      const { flows } = await reduceDay(
        res.body,
        (o, d) => o !== d && galician.has(o) && galician.has(d),
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
      names: names.body.toString('utf8'),
      shp: shp.body,
      dbf: dbf.body,
      days,
      lastModified,
    };
  },

  normalize(raw: Raw) {
    const { members } = municipalZones(raw.zoning);
    const names = zoneNames(raw.names);
    const centroids = zoneCentroids(raw.shp, raw.dbf);
    const byKind = Object.fromEntries(
      DAY_KINDS.map((k) => [
        k,
        meanPairs(
          REFERENCE_DAYS[k].map((date) => {
            const flows = raw.days[date];
            if (!flows) throw new Error(`Missing MITMA day ${date}`);
            return flows;
          }),
        ),
      ]),
    ) as Record<DayKind, Map<string, number[]>>;

    const pairs = new Set([...byKind.mercores.keys(), ...byKind.domingo.keys()]);
    const features: Feature[] = [];
    for (const pair of [...pairs].sort()) {
      const hours = Object.fromEntries(
        DAY_KINDS.map((k) => [
          k,
          (byKind[k].get(pair) ?? Array(24).fill(0)).map((v: number) => Math.round(v)),
        ]),
      ) as Record<DayKind, number[]>;
      if (sum(hours.mercores) < MIN_TRIPS && sum(hours.domingo) < MIN_TRIPS) continue;
      const [o, d] = pair.split('|') as [string, string];
      const a = centroids.get(o);
      const b = centroids.get(d);
      if (!a || !b) throw new Error(`No MITMA centroid for ${o} or ${d}`);
      const label = (z: string) => {
        const n = members.get(z)?.size ?? 1;
        const name = names.get(z) ?? z;
        return n > 1 ? `${name} e arredores (${n} concellos)` : name;
      };
      features.push({
        type: 'Feature',
        id: pair,
        geometry: {
          type: 'LineString',
          coordinates: [
            [round(a[0]), round(a[1])],
            [round(b[0]), round(b[1])],
          ],
        },
        properties: {
          orixe: o,
          destino: d,
          nome_orixe: label(o),
          nome_destino: label(d),
          distancia_km: round(distanceKm(a, b), 1),
          viaxes_mercores: sum(hours.mercores),
          viaxes_domingo: sum(hours.domingo),
          mercores: hours.mercores,
          domingo: hours.domingo,
        },
      });
    }
    const publishedAt = raw.lastModified ? new Date(raw.lastModified).toISOString() : null;
    return { collection: { type: 'FeatureCollection', features }, publishedAt };
  },
};

export default adapter;
