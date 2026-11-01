// Coastal flood areas for the 100- and 500-year return periods (Directive 2007/60/EC, flood
// hazard maps of the Galicia-Costa coast, cycle 2015–2021), from the Augas de Galicia service
// on IDEG: IDE_DHGC/D2007_60_MapasInundablesCosteiros/MapServer/3 (T100) and /4 (T500),
// 28 polygons each, one per coastal ARPSI. Vector shapes, generalised on the server to
// 0.0001° (≈ 10 m); the existing inundacion-perigo-* layers are SNCZI river rasters.
// T500 features come first so the T100 areas draw on top.

import type { Adapter, Feature } from '../../lib/adapter.ts';
import { allFeatures, cleanGeometry, fetchLayer, IDEG, num, str } from '../../lib/arcgis.ts';

export const MAPSERVER = `${IDEG}/IDE_DHGC/D2007_60_MapasInundablesCosteiros/MapServer`;
export const LAYERS = [
  { layer: 4, periodo: 500 },
  { layer: 3, periodo: 100 },
] as const;
export const MAX_ALLOWABLE_OFFSET = 0.0001;
const FIELDS = 'ID_ZONA,ZONA,LONG_KM,AREA_KM2,COTA_MAX,FECHA,ZI_DIRECTI';

export type Raw = Array<{ periodo: 100 | 500; pages: Awaited<ReturnType<typeof fetchLayer>> }>;

/** Epoch milliseconds (ArcGIS date field) → "YYYY-MM-DD", or null. */
export function epochDate(v: unknown): string | null {
  return typeof v === 'number' && Number.isFinite(v)
    ? new Date(v).toISOString().slice(0, 10)
    : null;
}

const adapter = {
  async fetch(ctx) {
    const raw: Raw = [];
    for (const { layer, periodo } of LAYERS) {
      const pages = await fetchLayer(ctx, `${MAPSERVER}/${layer}`, {
        outFields: FIELDS,
        maxAllowableOffset: MAX_ALLOWABLE_OFFSET,
      });
      raw.push({ periodo, pages });
    }
    return raw;
  },

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    for (const { periodo, pages } of raw) {
      for (const f of allFeatures(pages, `costeira T${periodo}`)) {
        const p = f.properties ?? {};
        const id = str(p.ID_ZONA);
        if (!id) throw new Error(`inundacion-costeira: T${periodo} feature without ID_ZONA`);
        const geometry = cleanGeometry(f.geometry);
        if (!geometry) continue;
        features.push({
          type: 'Feature',
          id,
          geometry,
          properties: {
            id,
            arpsi: str(p.ZI_DIRECTI),
            zona: str(p.ZONA),
            periodo_retorno: periodo,
            superficie_km2: num(p.AREA_KM2, 3),
            lonxitude_km: num(p.LONG_KM, 2),
            cota_max_m: num(p.COTA_MAX, 2),
            data_estudo: epochDate(p.FECHA),
          },
        });
      }
    }
    // The study date (FECHA, 2014) is a property; the service gives no publication time.
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
