// BIC elements (Bens de Interese Cultural) from the PBA "Afeccións do
// patrimonio cultural" MapServer, layer 2 only. ArcGIS REST, GeoJSON output,
// paginated with resultOffset/resultRecordCount (maxRecordCount 1000).
//
// Sensitivity rule: archaeological sites are not pinpointed. Their coordinates
// are rounded to 2 decimals (~1 km) and flagged localizacion_xeneralizada.

import { type Adapter, type Feature, type FeatureCollection, round } from '../../lib/adapter.ts';

export const SERVICE =
  'https://ideg.xunta.gal/servizos/rest/services/PBA/Afeccions_PatrimonioCultural/MapServer/2/query';
export const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

export function pageUrl(offset: number): string {
  const q = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    outSR: '4326',
    orderByFields: 'OBJECTID',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    f: 'geojson',
  });
  return `${SERVICE}?${q}`;
}

interface ArcFeature {
  geometry: { type: string; coordinates: [number, number] } | null;
  properties: Record<string, unknown>;
}

interface ArcPage {
  type?: string;
  features?: ArcFeature[];
  exceededTransferLimit?: boolean;
  properties?: { exceededTransferLimit?: boolean };
  error?: { message?: string };
}

export type Raw = ArcFeature[];

function parsePage(text: string, offset: number): ArcPage {
  const page = JSON.parse(text) as ArcPage;
  if (page?.error) throw new Error(`PBA query error at offset ${offset}: ${page.error.message}`);
  if (page?.type !== 'FeatureCollection' || !Array.isArray(page.features)) {
    throw new Error(`PBA: unexpected response at offset ${offset} (not a FeatureCollection)`);
  }
  return page;
}

/** Trim, collapse inner spaces, and map the source's placeholders ("-", " ") to null. */
function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s === '' || s === '-' ? null : s;
}

/** "15/03/2011" → "2011-03-15". */
function isoDate(v: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(typeof v === 'string' ? v.trim() : '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Archaeology check on the real values seen in the data (2026-10-18):
 * INTERESE "ARQ"; CATEGORIA "Zona arqueolóxica", "Xacemento arqueolóxico",
 * "Monumento / Zona arqueolóxica"; XENERICO "Arte rupestre", "Castro".
 */
export function isArchaeological(p: Record<string, unknown>): boolean {
  const interese = text(p.INTERESE)?.toUpperCase();
  const categoria = text(p.CATEGORIA) ?? '';
  const xenerico = text(p.XENERICO) ?? '';
  return interese === 'ARQ' || /arqueol/i.test(categoria) || /rupestre|^castro$/i.test(xenerico);
}

export function normalizeFeatures(raw: Raw): FeatureCollection {
  const features: Feature[] = [];
  for (const f of raw) {
    const c = f.geometry?.coordinates;
    if (f.geometry?.type !== 'Point' || !Array.isArray(c)) continue;
    const [lon, lat] = c;
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    const p = f.properties ?? {};
    const id = text(p.ID_BIC);
    if (!id) continue;
    const generalised = isArchaeological(p);
    const decimals = generalised ? 2 : 5;
    features.push({
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: [round(lon, decimals), round(lat, decimals)] },
      properties: {
        id,
        nome: text(p.NOME),
        concello: text(p.CONCELLO),
        // A hamlet name would undo the ~1 km generalisation of archaeological sites.
        lugar: generalised ? null : text(p.LUGAR),
        categoria: text(p.CATEGORIA),
        interese: text(p.INTERESE),
        data_declaracion: isoDate(p.DATA),
        dog: text(p.DOG),
        boe: text(p.BOE),
        localizacion_xeneralizada: generalised,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export default {
  async fetch(ctx) {
    const all: ArcFeature[] = [];
    let offset = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      const res = await ctx.get(pageUrl(offset));
      const page = parsePage(res.body.toString('utf8'), offset);
      const got = page.features ?? [];
      all.push(...got);
      const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit ?? false;
      if (!more || got.length === 0) return all;
      offset += got.length;
    }
    throw new Error(`PBA: more than ${MAX_PAGES} pages; refusing a partial download`);
  },
  normalize(raw) {
    // The service gives only a month in the layer name ("xuño 2026"), no exact date.
    return { collection: normalizeFeatures(raw), publishedAt: null };
  },
} satisfies Adapter<Raw>;
