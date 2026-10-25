// Pharmacies from the SERGAS services map KMZ (one request per run, shared reader in
// ../centros-saude/sergas.ts). id = SIGLAS, the pharmacy code ("C-224-F", "PO-12-F").
// The source names pharmacies only by their licence holders (TITULAR1–3, personal names) and
// gives a phone: neither is published. nome is "Farmacia <SIGLAS>".

import { type Adapter, type Feature, inGalicia, point } from '../../lib/adapter.ts';
import { FOLDERS, fetchSergasKml, folder, PAD, parseKml, place } from '../centros-saude/sergas.ts';

export type Raw = string;

export const SIGLAS = /^(C|LU|OR|PO)-\d+-F$/;

const adapter = {
  fetch: (ctx) => fetchSergasKml(ctx),

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    const seen = new Set<string>();
    for (const p of folder(parseKml(raw), FOLDERS.farmacias)) {
      const id = p.fields.SIGLAS ?? p.name;
      // Unknown code shapes and repeated codes are skipped (none seen on 2026-10-24).
      if (!SIGLAS.test(id) || seen.has(id) || !inGalicia(p.lon, p.lat, PAD)) continue;
      seen.add(id);
      features.push({
        type: 'Feature',
        id,
        geometry: point(p.lon, p.lat),
        properties: { id, nome: `Farmacia ${id}`, ...place(p) },
      });
    }
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
