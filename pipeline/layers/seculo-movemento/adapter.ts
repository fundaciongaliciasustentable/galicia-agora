// A century in motion (/pulso/seculo-movemento/): every concello with its population in each
// census from 1900 to 2021 (poboacion-seculo) and up to ANCHORS points where its people live
// today (the places of entidades-poboacion with a population, weighted by it), so the page can
// draw one dot per thousand people where the houses are, and move them from census to census.
//
// The anchors are today's places: in 1900 the people of a concello were spread differently
// within it. The page says so; between concellos the counts are the INE censuses.

import type {
  Adapter,
  AdapterContext,
  Feature,
  FeatureCollection,
  PublishedLayer,
} from '../../lib/adapter.ts';
import { centroid } from '../galicia-linas/adapter.ts';

export const INPUTS = ['poboacion-seculo', 'entidades-poboacion', 'galicia-deformada'] as const;
export type InputId = (typeof INPUTS)[number];
export type Raw = Record<InputId, PublishedLayer>;
/** Places kept per concello, the most populated first. */
export const ANCHORS = 24;

export function build(raw: Raw): Feature[] {
  const places = new Map<string, Array<[number, number, number]>>();
  for (const f of raw['entidades-poboacion'].collection.features) {
    const pop = Number(f.properties.poboacion);
    if (!(pop > 0) || f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const code = String(f.properties.codigo_ine);
    const list = places.get(code) ?? [];
    list.push([Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, pop]);
    places.set(code, list);
  }
  const shapes = new Map<string, Feature['geometry']>();
  for (const f of raw['galicia-deformada'].collection.features) {
    shapes.set(String(f.properties.codigo_ine), f.geometry);
  }
  const features: Feature[] = [];
  for (const f of raw['poboacion-seculo'].collection.features) {
    const p = f.properties;
    const code = String(p.codigo_ine);
    const centre = centroid(shapes.get(code) ?? null);
    if (!centre) continue;
    const top = (places.get(code) ?? []).sort((a, b) => b[2] - a[2]).slice(0, ANCHORS);
    const anchors = top.length ? top : [[centre[0], centre[1], 1] as [number, number, number]];
    features.push({
      type: 'Feature',
      id: code,
      geometry: {
        type: 'Point',
        coordinates: [Math.round(centre[0] * 1e4) / 1e4, Math.round(centre[1] * 1e4) / 1e4],
      },
      properties: {
        codigo_ine: code,
        nome: p.nome,
        censos: p.censos,
        poboacion: p.poboacion,
        anclas: anchors,
      },
    });
  }
  return features;
}

const adapter = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('seculo-movemento needs ctx.readLayer');
    const raw = {} as Raw;
    for (const id of INPUTS) raw[id] = await ctx.readLayer(id);
    return raw;
  },
  normalize(raw) {
    const collection: FeatureCollection = { type: 'FeatureCollection', features: build(raw) };
    return { collection, publishedAt: raw['poboacion-seculo'].meta.published_at ?? null };
  },
} satisfies Adapter<Raw>;

export default adapter;
