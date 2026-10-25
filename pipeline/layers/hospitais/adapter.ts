// Hospitals and specialty centres from the SERGAS services map KMZ (one request per run, shared
// reader in ../centros-saude/sergas.ts). Two folders overlap: "Hospitais e centros de
// especialidades" (83, one point per building, with COMPLEJO) and "Hospitais centros de
// especialidades e pacs" (31, one point per hospital complex, placed on one of its buildings).
// On 2026-10-24 all 31 complex points sat exactly on a point of the first folder. The first
// folder is kept whole; a complex point is added only if no first-folder point in the same
// concello has the same normalised name or lies within DEDUP_METRES.
// The source says nothing about public or private ownership, so no such field is published.

import { type Adapter, type Feature, inGalicia, point } from '../../lib/adapter.ts';
import {
  concelloKey,
  FOLDERS,
  fetchSergasKml,
  folder,
  normalise,
  PAD,
  type Placemark,
  parseKml,
  place,
  slug,
} from '../centros-saude/sergas.ts';

export type Raw = string;

export const DEDUP_METRES = 150;

/** Equirectangular distance in metres; fine at hospital scale. */
export function metres(a: Placemark, b: Placemark): number {
  const k = Math.PI / 180;
  const x = (a.lon - b.lon) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (a.lat - b.lat) * k;
  return Math.hypot(x, y) * 6_371_000;
}

function sameConcello(a: Placemark, b: Placemark): boolean {
  return concelloKey(a.fields.CONCELLO ?? '') === concelloKey(b.fields.CONCELLO ?? '');
}

export function isDuplicate(p: Placemark, kept: Placemark[]): boolean {
  const n = normalise(p.fields.NOMBRE ?? p.name);
  return kept.some(
    (q) =>
      sameConcello(p, q) &&
      (normalise(q.fields.NOMBRE ?? q.name) === n || metres(p, q) <= DEDUP_METRES),
  );
}

const adapter = {
  fetch: (ctx) => fetchSergasKml(ctx),

  normalize(raw, _ctx) {
    const folders = parseKml(raw);
    const kept = [...folder(folders, FOLDERS.hospitais)];
    for (const p of folder(folders, FOLDERS.complexos)) {
      if (!isDuplicate(p, kept)) kept.push(p);
    }

    const features: Feature[] = [];
    const seen = new Map<string, number>();
    for (const p of kept) {
      if (!inGalicia(p.lon, p.lat, PAD)) continue;
      const nome = p.fields.NOMBRE ?? p.name;
      if (!nome) continue;
      const base = `${slug(nome)}-${slug(concelloKey(p.fields.CONCELLO ?? ''))}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const id = n === 1 ? base : `${base}-${n}`;
      features.push({
        type: 'Feature',
        id,
        geometry: point(p.lon, p.lat),
        properties: {
          id,
          nome,
          tipo: p.fields.TIPOCENTRO ?? null,
          complexo: p.fields.COMPLEJO ?? null,
          ...place(p),
        },
      });
    }
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
