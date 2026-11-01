// Landscape walking routes from the IET / IDEG ArcGIS REST services in the `sendas` folder:
// - sendas/sendas/MapServer/0, "Itinerarios de interese paisaxístico" (266 lines in five
//   kinds: panoramic, heritage, BIC heritage, natural and the lighthouse "Senda Litoral");
// - sendas/Camiño_do_Litoral/MapServer/0, the 52 stages of the Camiño do Litoral.
// Lines are generalised on the server (maxAllowableOffset 0.0001°, ≈ 10 m). The source's
// AVG_SLOPE has no stated unit and FICHA is a bare PDF file name: neither is published.

import type { Adapter, Feature } from '../../lib/adapter.ts';
import { allFeatures, cleanGeometry, fetchLayer, IDEG, num, str } from '../../lib/arcgis.ts';

export const ITINERARIOS_URL = `${IDEG}/sendas/sendas/MapServer/0`;
export const LITORAL_URL = `${IDEG}/sendas/Cami%C3%B1o_do_Litoral/MapServer/0`;
export const MAX_ALLOWABLE_OFFSET = 0.0001;

/** TIPO_ITINERARIO → readable kind (values checked 2026-11-01). */
export const TIPO: Record<string, string> = {
  panoramicos: 'Itinerario panorámico',
  pat_xenerico: 'Itinerario patrimonial',
  p_bics: 'Itinerario patrimonial (BIC)',
  naturais: 'Itinerario natural',
  senda_faros: 'Senda Litoral (faros)',
};
export const TIPO_ETAPA = 'Camiño do Litoral (etapa)';

export interface Raw {
  itinerarios: Awaited<ReturnType<typeof fetchLayer>>;
  litoral: Awaited<ReturnType<typeof fetchLayer>>;
}

const LINES = new Set(['LineString', 'MultiLineString']);

const adapter = {
  async fetch(ctx) {
    const o = { maxAllowableOffset: MAX_ALLOWABLE_OFFSET };
    return {
      itinerarios: await fetchLayer(ctx, ITINERARIOS_URL, {
        ...o,
        outFields: 'ID,NAME,LONXITUDE,TIPO_ITINERARIO',
      }),
      litoral: await fetchLayer(ctx, LITORAL_URL, {
        ...o,
        outFields: 'KM,ETAPA_DET,CONC_ORIXE,CONC_FIN,COD_ETAPA',
      }),
    };
  },

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    for (const f of allFeatures(raw.itinerarios, 'sendas')) {
      const p = f.properties ?? {};
      const code = str(p.TIPO_ITINERARIO);
      const tipo = code ? TIPO[code] : undefined;
      if (!tipo) throw new Error(`sendas: unknown TIPO_ITINERARIO "${String(code)}"`);
      const geometry = cleanGeometry(f.geometry);
      if (!geometry || !LINES.has(geometry.type)) continue;
      const id = `itinerario-${str(p.ID) ?? f.id}`;
      features.push({
        type: 'Feature',
        id,
        geometry,
        properties: {
          id,
          nome: str(p.NAME) ?? tipo,
          tipo,
          lonxitude_km: num(p.LONXITUDE, 1),
          concello_inicio: null,
          concello_fin: null,
        },
      });
    }
    for (const f of allFeatures(raw.litoral, 'camino-litoral')) {
      const p = f.properties ?? {};
      const etapa = str(p.COD_ETAPA);
      if (!etapa) throw new Error(`camino-litoral: feature ${f.id} without COD_ETAPA`);
      const geometry = cleanGeometry(f.geometry);
      if (!geometry || !LINES.has(geometry.type)) continue;
      const id = `litoral-${etapa}`;
      features.push({
        type: 'Feature',
        id,
        geometry,
        properties: {
          id,
          nome: str(p.ETAPA_DET) ?? `Etapa ${etapa}`,
          tipo: TIPO_ETAPA,
          lonxitude_km: num(p.KM, 1),
          concello_inicio: str(p.CONC_ORIXE),
          concello_fin: str(p.CONC_FIN),
        },
      });
    }
    // Neither service publishes an edition or update date.
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
