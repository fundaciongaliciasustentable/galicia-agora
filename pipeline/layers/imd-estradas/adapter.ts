// Average daily traffic (IMD, intensidade media diaria) on the Galician regional road network
// (RAEG), 2025, by road section, from the Axencia Galega de Infraestruturas (AXI) service on
// IDEG: AXI/MapaTrafico/MapServer/7 "IMD 2025 (por treitos RAEG)", 1,138 lines in one page
// (maxRecordCount 2000). Lines are generalised on the server (0.0002°, ≈ 20 m).
//
// The 2025 figure is not always a 2025 count: each section carries the year and kind of its
// last count (Anho_afo_u, Tipo_afo_u), and older counts are carried forward by the AXI. Both
// are published so the map can say how old the measurement is. Count stations (layer 0) are
// not included.

import type { Adapter, Feature } from '../../lib/adapter.ts';
import { allFeatures, cleanGeometry, fetchLayer, IDEG, num, str } from '../../lib/arcgis.ts';

export const LAYER_URL = `${IDEG}/AXI/MapaTrafico/MapServer/7`;
export const YEAR = 2025;
export const MAX_ALLOWABLE_OFFSET = 0.0002;
export const FIELDS = [
  'OBJECTID',
  'IMD_2025',
  'P_porcenta',
  'IMD_P_2025',
  'Tipo_afo_u',
  'Anho_afo_u',
  'Estrada',
  'Treito',
  'Pq_inicio',
  'Pq_fin',
  'Lonx',
  'Rede',
  'Clase',
].join(',');

export const REDE: Record<string, string> = {
  Estructurante: 'estruturante',
  Complementaria: 'complementaria',
  Local: 'local',
};

export const CLASE: Record<string, string> = {
  'Carretera convencional': 'Estrada convencional',
  Autovía: 'Autovía',
  'Vía para automóviles': 'Vía para automóbiles',
  Autopista: 'Autoestrada',
};

export type Raw = Awaited<ReturnType<typeof fetchLayer>>;

/** Year of the last count, or null when the source gives 0 or nothing. */
export function anoAforo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= 1980 && n <= YEAR ? n : null;
}

const adapter = {
  fetch: (ctx) =>
    fetchLayer(ctx, LAYER_URL, {
      outFields: FIELDS,
      pageSize: 2000,
      maxAllowableOffset: MAX_ALLOWABLE_OFFSET,
    }),

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    for (const f of allFeatures(raw, 'imd-estradas')) {
      const p = f.properties ?? {};
      const estrada = str(p.Estrada);
      const imd = num(p.IMD_2025, 0);
      const geometry = cleanGeometry(f.geometry);
      if (!estrada) throw new Error(`imd-estradas: feature ${f.id} without Estrada`);
      if (!geometry || imd === null || imd < 0) continue;
      const rede = str(p.Rede);
      const clase = str(p.Clase);
      const id = String(p.OBJECTID ?? f.id);
      features.push({
        type: 'Feature',
        id,
        geometry,
        properties: {
          id,
          estrada,
          treito: str(p.Treito),
          pk_inicio: num(p.Pq_inicio, 2),
          pk_fin: num(p.Pq_fin, 2),
          lonxitude_km: num(p.Lonx, 2),
          imd,
          pesados_pct: num(p.P_porcenta, 1),
          imd_pesados: num(p.IMD_P_2025, 0),
          ano: YEAR,
          ano_aforo: anoAforo(p.Anho_afo_u),
          tipo_aforo: str(p.Tipo_afo_u),
          rede: rede ? (REDE[rede] ?? rede) : null,
          clase: clase ? (CLASE[clase] ?? clase) : null,
        },
      });
    }
    // The service publishes no edition date; the year is in the layer name.
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
