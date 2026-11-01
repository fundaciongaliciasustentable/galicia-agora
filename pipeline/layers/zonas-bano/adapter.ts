// Official bathing waters (zonas de baño, Náiade census) in the Galicia-Costa river basin, from
// the Augas de Galicia hydrological plan 2021–2027 on IDEG:
// IDE_DHGC/PHGC2021_2027_ZProtex_NEuropeo/MapServer/4 (458 polygons, 433 sea and 25 inland).
// That sublayer answers `query` without geometry, so the shapes come through `find`
// (lib/arcgis.ts), checked against the query count, generalised to 0.0002° (≈ 20 m).
// Zones with a deregistration date (FECHA_BAJA) are left out. Only the shapes: the season's
// water quality is an HTML page of the SERGAS, not a feed.

import { type Adapter, type Feature, round } from '../../lib/adapter.ts';
import { cleanGeometry, esriToGeoJSON, fetchByFind, IDEG, num, str } from '../../lib/arcgis.ts';

export const MAPSERVER = `${IDEG}/IDE_DHGC/PHGC2021_2027_ZProtex_NEuropeo/MapServer`;
export const LAYER = 4;
export const MAX_ALLOWABLE_OFFSET = 0.0002;

export type Raw = Awaited<ReturnType<typeof fetchByFind>>;

/** "PLAYA ARNELA - FONFORRON" → "Playa Arnela - Fonforron" (the census names are upper case). */
export function titleCase(s: string): string {
  const small = new Set(['de', 'do', 'da', 'dos', 'das', 'del', 'la', 'e', 'y']);
  return s
    .toLowerCase()
    .replace(/(^|[\s(-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/ (\p{L}+)/gu, (m, w: string) =>
      small.has(w.toLowerCase()) ? ` ${w.toLowerCase()}` : m,
    );
}

export function isoDate(v: unknown): string | null {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const adapter = {
  fetch: (ctx) => fetchByFind(ctx, MAPSERVER, LAYER, 'EUZPROTCOD', 'ES', MAX_ALLOWABLE_OFFSET),

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    const seen = new Set<string>();
    for (const r of raw.results) {
      const a = r.attributes;
      if (isoDate(a.FECHA_BAJA)) continue;
      const code = str(a.EUZPROTCOD);
      const nome = str(a.DEN_NAYADE);
      if (!code || !nome) throw new Error(`zonas-bano: feature ${String(a.OBJECTID)} without code`);
      const geometry = cleanGeometry(esriToGeoJSON(r.geometry));
      if (!geometry) continue;
      // One census code appears twice (two polygons): keep both with distinct ids.
      const id = seen.has(code) ? `${code}-${String(a.OBJECTID)}` : code;
      seen.add(code);
      const tipo = str(a.TIPO_ZPROT)?.toUpperCase();
      const area = num(a.AREA_HA, 2);
      features.push({
        type: 'Feature',
        id,
        geometry,
        properties: {
          id,
          nome: titleCase(nome),
          tipo: tipo === 'CONTINENTAL' ? 'continental' : 'maritima',
          superficie_ha: area === null ? null : round(area, 2),
          data_alta: isoDate(a.FECHA_ALTA),
        },
      });
    }
    // The plan layer has no edition date of its own.
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
