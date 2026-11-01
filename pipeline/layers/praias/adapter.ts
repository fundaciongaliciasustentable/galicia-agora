// Beaches on the Galician coast from the IET / IDEG ArcGIS REST service
// CubertaTerrestre/Clasificacion_PRAIAS, layer 0 (987 points, one page). Each beach keeps
// the coastal-plan class the source gives (NATURAL / URBANA; 42 urban ones carry an
// unexplained "URBANA *", read as urban) and its stretch (TRAMO) when a beach is split.
//
// Blue Flag is not published: the service's B_AZUL field has no year, and the 2026 list
// on abertos.xunta.gal (PraiasBandeiraAzul_2026.csv) does not join cleanly by position
// (checked 2026-11-01: 29 of 118 nearest matches were another beach, and inland beaches
// are not in this layer).

import { type Adapter, type Feature, inGalicia } from '../../lib/adapter.ts';
import { allFeatures, cleanGeometry, fetchLayer, IDEG, str } from '../../lib/arcgis.ts';

export const LAYER_URL = `${IDEG}/CubertaTerrestre/Clasificacion_PRAIAS/MapServer/0`;

export type Raw = Awaited<ReturnType<typeof fetchLayer>>;

export function categoria(v: unknown): 'natural' | 'urbana' {
  const s = str(v)
    ?.toUpperCase()
    .replace(/\s*\*$/, '');
  if (s === 'NATURAL') return 'natural';
  if (s === 'URBANA') return 'urbana';
  throw new Error(`praias: unexpected CATEGORIA_ "${String(v)}"`);
}

/** "TRAMO2" → 2; "UNICO" → null. */
export function tramo(v: unknown): number | null {
  const m = /^TRAMO\s*(\d+)$/i.exec(str(v) ?? '');
  return m ? Number(m[1]) : null;
}

const adapter = {
  fetch: (ctx) => fetchLayer(ctx, LAYER_URL),

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    const seen = new Set<string>();
    for (const f of allFeatures(raw, 'praias')) {
      const p = f.properties ?? {};
      const id = str(p.COD_PRAIA);
      const nome = str(p.NOME_PRAIA);
      const geometry = cleanGeometry(f.geometry);
      if (!id || !nome) throw new Error(`praias: feature ${f.id} without COD_PRAIA or name`);
      const [lon, lat] = (geometry?.coordinates as number[] | undefined) ?? [];
      if (geometry?.type !== 'Point' || !inGalicia(lon as number, lat as number)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      features.push({
        type: 'Feature',
        id,
        geometry,
        properties: {
          id,
          nome,
          concello: str(p.CONCELLO),
          provincia: str(p.PROVINCIA),
          categoria: categoria(p.CATEGORIA_),
          tramo: tramo(p.TRAMO),
        },
      });
    }
    // The service publishes no edition or update date.
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
