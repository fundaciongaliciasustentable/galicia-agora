// Concellos and parroquias of Galicia from the IET / IDEG ArcGIS REST service
// (LimitesAdministrativos MapServer). One layer serves both levels: each
// feature carries `nivel: "concello" | "parroquia"` so the site styles by it.
// Geometry is generalised server-side with maxAllowableOffset (degrees).

import {
  type Adapter,
  type AdapterContext,
  type Feature,
  type FeatureCollection,
  madridToIso,
  round,
} from '../../lib/adapter.ts';

export const BASE =
  'https://ideg.xunta.gal/servizos/rest/services/LimitesAdministrativos/LimitesAdministrativos/MapServer';

/** Most detailed sublayers of "Concellos (…)" (11) and "Parroquias (…)" (17). */
export const CONCELLOS_LAYER = 12;
export const PARROQUIAS_LAYER = 18;
export const PAGE_SIZE = 1000;
/** Generalisation tolerance in output degrees (≈ 50 m at Galician latitudes). */
export const MAX_ALLOWABLE_OFFSET = 0.0005;
const MAX_PAGES = 20;

const FIELDS: Record<number, string> = {
  [CONCELLOS_LAYER]: 'CODCONC,NAMEUNIT,NOMECAPITA',
  [PARROQUIAS_LAYER]: 'CODPARRO,PARROQUIA,CODCONC,CONCELLO,CODIGOINE,NOMECAPITA',
};

/** INE province codes (first two digits of the municipality code). */
const PROVINCIAS: Record<string, string> = {
  '15': 'A Coruña',
  '27': 'Lugo',
  '32': 'Ourense',
  '36': 'Pontevedra',
};

const MESES = [
  'xaneiro',
  'febreiro',
  'marzo',
  'abril',
  'maio',
  'xuño',
  'xullo',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'decembro',
];

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

interface ServiceInfo {
  layers?: Array<{ id: number; name: string }>;
}

export interface Raw {
  service: ServiceInfo;
  concellos: ArcPage[];
  parroquias: ArcPage[];
}

export function queryUrl(layer: number, offset: number): string {
  const q = new URLSearchParams({
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    where: '1=1',
    outFields: FIELDS[layer] ?? '*',
    orderByFields: 'OBJECTID',
    outSR: '4326',
    maxAllowableOffset: String(MAX_ALLOWABLE_OFFSET),
    geometryPrecision: '5',
    f: 'geojson',
  });
  return `${BASE}/${layer}/query?${q}`;
}

function parseJson<T>(body: Buffer, what: string): T {
  try {
    return JSON.parse(body.toString('utf8')) as T;
  } catch {
    throw new Error(`IDEG ${what}: response is not JSON`);
  }
}

function checkPage(page: ArcPage, what: string): ArcFeature[] {
  if (page?.error) throw new Error(`IDEG ${what}: ${page.error.message ?? 'service error'}`);
  if (page?.type !== 'FeatureCollection' || !Array.isArray(page.features)) {
    throw new Error(`IDEG ${what}: unexpected response (no FeatureCollection)`);
  }
  return page.features;
}

/** Page through a layer while the server reports exceededTransferLimit. */
export async function fetchAll(ctx: AdapterContext, layer: number): Promise<ArcPage[]> {
  const pages: ArcPage[] = [];
  let offset = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const what = `layer ${layer} offset ${offset}`;
    const page = parseJson<ArcPage>((await ctx.get(queryUrl(layer, offset))).body, what);
    const features = checkPage(page, what);
    pages.push(page);
    if (!page.exceededTransferLimit) return pages;
    if (features.length === 0) throw new Error(`IDEG ${what}: empty page with more to come`);
    offset += features.length;
  }
  throw new Error(`IDEG layer ${layer}: more than ${MAX_PAGES} pages`);
}

/** Codes come as numbers (CODCONC double); keep them as fixed-width strings. */
export function code(v: unknown, width: number, what: string): string {
  const s = typeof v === 'number' ? String(Math.trunc(v)) : String(v ?? '').trim();
  if (!/^\d+$/.test(s) || s.length > width) throw new Error(`Bad ${what}: ${String(v)}`);
  return s.padStart(width, '0');
}

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export function roundCoords(c: unknown): unknown {
  if (typeof c === 'number') return round(c);
  if (Array.isArray(c)) return c.map(roundCoords);
  return c;
}

/** "Parroquias (Febreiro 2026)" → edition month as ISO UTC (day 1, Madrid midnight). */
export function editionFromName(name: string): string | null {
  const m = /\(([a-zñ]+)\s+(\d{4})\)/i.exec(name);
  if (!m) return null;
  const month = MESES.indexOf((m[1] ?? '').toLowerCase());
  if (month < 0) return null;
  return madridToIso(`${m[2]}-${String(month + 1).padStart(2, '0')}-01 00:00`);
}

export function publishedFromService(service: ServiceInfo): string | null {
  const dates = (service.layers ?? [])
    .filter((l) => /^(Concellos|Parroquias)\s*\(/.test(l.name))
    .map((l) => editionFromName(l.name))
    .filter((d): d is string => d !== null)
    .sort();
  return dates.at(-1) ?? null;
}

function geometry(f: ArcFeature): Feature['geometry'] {
  if (!f.geometry) return null;
  return { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) };
}

function concello(f: ArcFeature): Feature {
  const p = f.properties ?? {};
  const cod = code(p.CODCONC, 5, 'CODCONC');
  const nome = text(p.NAMEUNIT);
  if (!nome) throw new Error(`Concello ${cod} without name`);
  return {
    type: 'Feature',
    id: `concello-${cod}`,
    geometry: geometry(f),
    properties: {
      nivel: 'concello',
      nome,
      codigo_concello: cod,
      concello: nome,
      codigo_ine: cod,
      provincia: PROVINCIAS[cod.slice(0, 2)] ?? null,
      capital: text(p.NOMECAPITA),
    },
  };
}

function parroquia(f: ArcFeature): Feature {
  const p = f.properties ?? {};
  const cod = code(p.CODPARRO, 7, 'CODPARRO');
  const conc = code(p.CODCONC, 5, 'CODCONC');
  const nome = text(p.PARROQUIA);
  if (!nome) throw new Error(`Parroquia ${cod} without name`);
  return {
    type: 'Feature',
    id: `parroquia-${cod}`,
    geometry: geometry(f),
    properties: {
      nivel: 'parroquia',
      nome,
      codigo_parroquia: cod,
      parroquia: nome,
      codigo_concello: conc,
      concello: text(p.CONCELLO),
      codigo_ine: p.CODIGOINE != null ? code(p.CODIGOINE, 5, 'CODIGOINE') : conc,
      provincia: PROVINCIAS[conc.slice(0, 2)] ?? null,
      capital: text(p.NOMECAPITA),
    },
  };
}

export default {
  async fetch(ctx) {
    const service = parseJson<ServiceInfo>((await ctx.get(`${BASE}?f=json`)).body, 'service');
    if (!Array.isArray(service?.layers)) throw new Error('IDEG service: no layers list');
    const concellos = await fetchAll(ctx, CONCELLOS_LAYER);
    const parroquias = await fetchAll(ctx, PARROQUIAS_LAYER);
    return { service, concellos, parroquias };
  },

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    for (const page of raw.concellos) {
      for (const f of checkPage(page, 'concellos')) features.push(concello(f));
    }
    for (const page of raw.parroquias) {
      for (const f of checkPage(page, 'parroquias')) features.push(parroquia(f));
    }
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    return { collection, publishedAt: publishedFromService(raw.service) };
  },
} satisfies Adapter<Raw>;
