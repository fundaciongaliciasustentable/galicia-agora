// Inventory of Galician wetlands (Inventario de Zonas Húmidas de Galicia, IZHG) from the
// IET / IDEG service LugaresProtexidos/ENC_InventarioZonasHumidas/MapServer/0: 1,170
// polygons, one per element of a wetland (111 wetlands have several), two pages.
// Polygons generalised on the server (0.0002°, ≈ 20 m).
//
// TIP_IZHG is a typology code ("2.33", "4.71"); the service publishes no legend for it, so
// the code is kept as given. publishedAt is the latest DOG publication date in the data.

import type { Adapter, Feature } from '../../lib/adapter.ts';
import { allFeatures, cleanGeometry, fetchLayer, IDEG, num, str } from '../../lib/arcgis.ts';
import { epochDate } from '../inundacion-costeira/adapter.ts';

export const LAYER_URL = `${IDEG}/LugaresProtexidos/ENC_InventarioZonasHumidas/MapServer/0`;
export const MAX_ALLOWABLE_OFFSET = 0.0002;
export const FIELDS = 'COD_IZHG,NOM_IZHG,TIP_IZHG,CODELEM,NOMELEM,SUPELEM,PUBL_DOG';

export type Raw = Awaited<ReturnType<typeof fetchLayer>>;

const adapter = {
  fetch: (ctx) =>
    fetchLayer(ctx, LAYER_URL, { outFields: FIELDS, maxAllowableOffset: MAX_ALLOWABLE_OFFSET }),

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    let latest: string | null = null;
    for (const f of allFeatures(raw, 'humidais')) {
      const p = f.properties ?? {};
      const id = str(p.CODELEM);
      const nome = str(p.NOM_IZHG);
      if (!id || !nome) throw new Error(`humidais: feature ${f.id} without CODELEM or name`);
      const geometry = cleanGeometry(f.geometry);
      if (!geometry) continue;
      const dog = epochDate(p.PUBL_DOG);
      if (dog && (!latest || dog > latest)) latest = dog;
      features.push({
        type: 'Feature',
        id,
        geometry,
        properties: {
          id,
          codigo_humidal: str(p.COD_IZHG),
          nome,
          elemento: str(p.NOMELEM),
          tipoloxia: str(p.TIP_IZHG),
          superficie_ha: num(p.SUPELEM, 2),
          data_dog: dog,
        },
      });
    }
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: latest ? `${latest}T00:00:00.000Z` : null,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
