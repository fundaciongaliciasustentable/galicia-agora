// Galician protected-area figures outside Natura 2000 (Rede Galega de Espazos
// Protexidos) from the IET / IDEG ArcGIS REST service
// LugaresProtexidos/EN_EspazosProtexidos. One query per sublayer; each feature
// gets a readable Galician `figura` label. Geometry is generalised server-side
// with maxAllowableOffset (degrees).

import {
  type Adapter,
  type AdapterContext,
  type Feature,
  type FeatureCollection,
  round,
} from '../../lib/adapter.ts';

export const BASE =
  'https://ideg.xunta.gal/servizos/rest/services/LugaresProtexidos/EN_EspazosProtexidos/MapServer';

/** Sublayer id → figura label (sublayer names checked on 2026-10-18). */
export const FIGURAS: Record<number, string> = {
  1: 'Parque nacional',
  2: 'Parque natural',
  3: 'Humidal protexido',
  4: 'Zona de especial protección dos valores naturais',
  5: 'Monumento natural',
  6: 'Paisaxe protexida',
};

export const PAGE_SIZE = 1000;
/** Generalisation tolerance in output degrees (≈ 10 m); areas are small. */
export const MAX_ALLOWABLE_OFFSET = 0.0001;
const MAX_PAGES = 10;

interface ArcFeature {
  id?: number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

interface ArcPage {
  type?: string;
  features?: ArcFeature[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
}

export type Raw = Array<{ layer: number; pages: ArcPage[] }>;

export function queryUrl(layer: number, offset: number): string {
  const q = new URLSearchParams({
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    where: '1=1',
    // "*" so the object id comes back as the feature id (its name differs per sublayer).
    outFields: '*',
    outSR: '4326',
    maxAllowableOffset: String(MAX_ALLOWABLE_OFFSET),
    geometryPrecision: '5',
    f: 'geojson',
  });
  return `${BASE}/${layer}/query?${q}`;
}

function checkPage(page: ArcPage, what: string): ArcFeature[] {
  if (page?.error) throw new Error(`IDEG ${what}: ${page.error.message ?? 'service error'}`);
  if (page?.type !== 'FeatureCollection' || !Array.isArray(page.features)) {
    throw new Error(`IDEG ${what}: unexpected response (no FeatureCollection)`);
  }
  return page.features;
}

async function fetchAll(ctx: AdapterContext, layer: number): Promise<ArcPage[]> {
  const pages: ArcPage[] = [];
  let offset = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const what = `layer ${layer} offset ${offset}`;
    let page: ArcPage;
    try {
      page = JSON.parse((await ctx.get(queryUrl(layer, offset))).body.toString('utf8'));
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(`IDEG ${what}: response is not JSON`);
      throw err;
    }
    const features = checkPage(page, what);
    pages.push(page);
    if (!page.exceededTransferLimit) return pages;
    if (features.length === 0) throw new Error(`IDEG ${what}: empty page with more to come`);
    offset += features.length;
  }
  throw new Error(`IDEG layer ${layer}: more than ${MAX_PAGES} pages`);
}

export function roundCoords(c: unknown): unknown {
  if (typeof c === 'number') return round(c);
  if (Array.isArray(c)) return c.map(roundCoords);
  return c;
}

function superficie(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
}

export default {
  async fetch(ctx) {
    const raw: Raw = [];
    for (const layer of Object.keys(FIGURAS).map(Number)) {
      raw.push({ layer, pages: await fetchAll(ctx, layer) });
    }
    return raw;
  },

  normalize(raw, _ctx) {
    if (!Array.isArray(raw)) throw new Error('IDEG espazos: unexpected raw input');
    const features: Feature[] = [];
    for (const { layer, pages } of raw) {
      const figura = FIGURAS[layer];
      if (!figura) throw new Error(`IDEG espazos: unknown sublayer ${layer}`);
      for (const page of pages) {
        for (const f of checkPage(page, `layer ${layer}`)) {
          const nome = typeof f.properties?.NOME === 'string' ? f.properties.NOME.trim() : '';
          if (!nome) throw new Error(`IDEG espazos: feature without NOME in layer ${layer}`);
          if (!f.geometry) continue;
          features.push({
            type: 'Feature',
            id: `${layer}-${f.id ?? features.length}`,
            geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
            properties: { figura, nome, superficie_ha: superficie(f.properties.SUP_HAS) },
          });
        }
      }
    }
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    // The service publishes no edition or update date.
    return { collection, publishedAt: null };
  },
} satisfies Adapter<Raw>;
