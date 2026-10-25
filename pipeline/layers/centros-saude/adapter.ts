// Health centres and PACs (puntos de atención continuada) from the SERGAS services map KMZ.
// One request per run (see sergas.ts). The source has no code for these centres, so the id is
// built from type + name + concello. 92 of the 100 PACs share name and place with a health
// centre (the PAC works in the centre); both are kept, told apart by `tipo`.
// The KMZ carries no publication time (its ZIP entry dates are the request time): publishedAt
// is null.

import { type Adapter, type Feature, inGalicia, point } from '../../lib/adapter.ts';
import {
  concelloKey,
  FOLDERS,
  fetchSergasKml,
  folder,
  PAD,
  parseKml,
  place,
  slug,
} from './sergas.ts';

export type Raw = string;

const TIPOS = [
  { folder: FOLDERS.centrosSaude, tipo: 'centro_saude', prefix: 'cs' },
  { folder: FOLDERS.pac, tipo: 'pac', prefix: 'pac' },
] as const;

const adapter = {
  fetch: (ctx) => fetchSergasKml(ctx),

  normalize(raw, _ctx) {
    const folders = parseKml(raw);
    const features: Feature[] = [];
    const seen = new Map<string, number>();
    for (const t of TIPOS) {
      for (const p of folder(folders, t.folder)) {
        if (!inGalicia(p.lon, p.lat, PAD)) continue;
        const nome = p.fields.NOMBRE ?? p.name;
        if (!nome) continue;
        const base = `${t.prefix}-${slug(nome)}-${slug(concelloKey(p.fields.CONCELLO ?? ''))}`;
        // Same name in the same concello twice: suffix in source order (not seen 2026-10-24).
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const id = n === 1 ? base : `${base}-${n}`;
        features.push({
          type: 'Feature',
          id,
          geometry: point(p.lon, p.lat),
          properties: { id, nome, tipo: t.tipo, ...place(p) },
        });
      }
    }
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
