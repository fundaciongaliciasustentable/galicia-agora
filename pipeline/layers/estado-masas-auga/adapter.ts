// Status of surface water bodies in the Galicia-Costa river basin (hydrological plan
// 2021–2027), from the Augas de Galicia service on IDEG: IDE_DHGC/PHGC2021_2027_Estado,
// sublayers 5 (rivers, 412 lines), 1 (lakes and reservoirs, 24), 3 (transitional, 22),
// 2 (coastal, 29) and 4 (ports, 7). Groundwater bodies (sublayer 0) are left out: they
// cover the land and would hide the rest.
//
// Rivers come as hundreds of two-point parts per body; they are chained and simplified
// (lib/arcgis.ts tidyLines). Status values are the plan's, translated to Galician.

import type { Adapter, Feature } from '../../lib/adapter.ts';
import { allFeatures, cleanGeometry, fetchLayer, IDEG, str, tidyLines } from '../../lib/arcgis.ts';
import { titleCase } from '../zonas-bano/adapter.ts';

export const MAPSERVER = `${IDEG}/IDE_DHGC/PHGC2021_2027_Estado/MapServer`;

export const SUBLAYERS = [
  { layer: 2, categoria: 'costeira', offset: 0.0003 },
  { layer: 4, categoria: 'porto', offset: 0.0002 },
  { layer: 3, categoria: 'transicion', offset: 0.0002 },
  { layer: 1, categoria: 'lago', offset: 0.0002 },
  { layer: 5, categoria: 'rio', offset: 0.0005 },
] as const;

/** Douglas–Peucker tolerance for the chained river lines (≈ 30 m). */
export const RIVER_TOLERANCE = 0.0003;
const FIELDS = 'COD_MASA,NOM_MASA,NATURALEZA,ETOTAL,EECO,EQUIM';

export const ESTADO_GLOBAL: Record<string, string> = {
  'BUENO O MEJOR': 'bo ou mellor',
  'PEOR QUE BUENO': 'peor que bo',
};
export const ESTADO_ECOLOXICO: Record<string, string> = {
  'MUY BUENO': 'moi bo',
  BUENO: 'bo',
  'BUENO O SUPERIOR': 'bo ou superior',
  MODERADO: 'moderado',
  DEFICIENTE: 'deficiente',
  MALO: 'malo',
};
export const ESTADO_QUIMICO: Record<string, string> = {
  BUENO: 'bo',
  'NO ALCANZA EL BUENO': 'non alcanza o bo',
};
export const NATUREZA: Record<string, string> = {
  Natural: 'natural',
  'Muy modificada': 'moi modificada',
  Artificial: 'artificial',
};

export type Raw = Array<{ layer: number; pages: Awaited<ReturnType<typeof fetchLayer>> }>;

function mapped(
  table: Record<string, string>,
  v: unknown,
  what: string,
  id: string,
): string | null {
  const s = str(v);
  if (!s) return null;
  const out = table[s];
  if (!out) throw new Error(`estado-masas-auga: unknown ${what} "${s}" in ${id}`);
  return out;
}

const adapter = {
  async fetch(ctx) {
    const raw: Raw = [];
    for (const { layer, offset } of SUBLAYERS) {
      raw.push({
        layer,
        pages: await fetchLayer(ctx, `${MAPSERVER}/${layer}`, {
          outFields: FIELDS,
          maxAllowableOffset: offset,
        }),
      });
    }
    return raw;
  },

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    for (const { layer, pages } of raw) {
      const sub = SUBLAYERS.find((s) => s.layer === layer);
      if (!sub) throw new Error(`estado-masas-auga: unknown sublayer ${layer}`);
      for (const f of allFeatures(pages, `estado ${layer}`)) {
        const p = f.properties ?? {};
        const codigo = str(p.COD_MASA);
        if (!codigo) throw new Error(`estado-masas-auga: feature without COD_MASA in ${layer}`);
        // Some codes appear in two sublayers (Punta Langosteira: coastal and port).
        const id = `${sub.categoria}-${codigo}`;
        const clean = cleanGeometry(f.geometry);
        const geometry = sub.categoria === 'rio' ? tidyLines(clean, RIVER_TOLERANCE) : clean;
        if (!geometry) continue;
        const nome = str(p.NOM_MASA);
        features.push({
          type: 'Feature',
          id,
          geometry,
          properties: {
            id,
            codigo,
            nome: nome ? titleCase(nome) : codigo,
            categoria: sub.categoria,
            natureza: mapped(NATUREZA, p.NATURALEZA, 'NATURALEZA', id),
            estado_global: mapped(ESTADO_GLOBAL, p.ETOTAL, 'ETOTAL', id),
            estado_ecoloxico: mapped(ESTADO_ECOLOXICO, p.EECO, 'EECO', id),
            estado_quimico: mapped(ESTADO_QUIMICO, p.EQUIM, 'EQUIM', id),
          },
        });
      }
    }
    // The plan service has no edition date of its own.
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
