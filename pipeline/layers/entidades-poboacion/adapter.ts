// Population entities (entidades de poboación, PBA) of Galicia from the IET / IDEG ArcGIS
// REST service. ~36,000 points paged 1,000 at a time with a short pause between requests.
// Base for the place search and for later "distance to services" work, so codes are kept
// as clean strings: COD_IGRP (11 digits) as `codigo`, COD_ENT_CO (7 digits) as
// `codigo_parroquia`, and the INE municipality code taken from the parroquia code.
//
// COD_IGRP is not unique: the Xunta "lugares" (LU) and urban-planning entries (PU) carry a
// parroquia-level placeholder (…0099 / …0098) shared by every place of the parroquia. The
// feature id therefore adds an ordinal when a code repeats. Malformed codes become null.

import {
  type Adapter,
  type AdapterContext,
  type Feature,
  type FeatureCollection,
  inGalicia,
  madridToIso,
  point,
} from '../../lib/adapter.ts';

export const BASE =
  'https://ideg.xunta.gal/servizos/rest/services/PBA/EntidadesPoboacion_PBA/MapServer';
export const LAYER = 0;
export const PAGE_SIZE = 1000;
/** Pause between requests, to be gentle with the service (tests set it to 0). */
export const timing = { pauseMs: 500 };
/** Final count may differ from returnCountOnly by at most this fraction. */
export const COUNT_TOLERANCE = 0.01;
const OUT_FIELDS =
  'OBJECTID,COD_IGRP,ETIQUETA_M,NOME_LUGAR,TIPO_ENTID,COD_ENT_CO,POB_2024,NOMEN_XUNT,NOMEN_INE';

/**
 * TIPO_ENTID codes. The service publishes no code list: these labels are inferred from
 * the data (NOMEN_INE flag, population and the last digits of COD_IGRP) and are
 * unverified; the raw code is always published next to them.
 */
export const TIPOS: Record<string, { gl: string; es: string }> = {
  EN: { gl: 'Entidade con núcleo', es: 'Entidad con núcleo' },
  ED: { gl: 'Entidade en diseminado', es: 'Entidad en diseminado' },
  END: { gl: 'Entidade con núcleo e diseminado', es: 'Entidad con núcleo y diseminado' },
  NU: { gl: 'Núcleo', es: 'Núcleo' },
  EH: { gl: 'Entidade histórica', es: 'Entidad histórica' },
  LU: { gl: 'Lugar (Nomenclátor da Xunta)', es: 'Lugar (Nomenclátor de la Xunta)' },
  PU: { gl: 'Núcleo do planeamento urbanístico', es: 'Núcleo del planeamiento urbanístico' },
};

/** Types that are not INE entities: the service reports 0 inhabitants, which means "no data". */
const SEN_POBOACION = new Set(['LU', 'PU']);

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
  serviceDescription?: string;
  description?: string;
  documentInfo?: Record<string, string>;
  layers?: unknown[];
}

export interface Raw {
  service: ServiceInfo;
  count: number;
  pages: ArcPage[];
}

export function queryUrl(offset: number): string {
  const q = new URLSearchParams({
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    where: '1=1',
    outFields: OUT_FIELDS,
    orderByFields: 'OBJECTID',
    outSR: '4326',
    f: 'geojson',
  });
  return `${BASE}/${LAYER}/query?${q}`;
}

export const COUNT_URL = `${BASE}/${LAYER}/query?where=1%3D1&returnCountOnly=true&f=json`;

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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** "… Decembro 2025" → edition month as ISO UTC (day 1, Madrid midnight). */
export function editionFromText(text: string | undefined): string | null {
  const m = /([a-zñ]+)\s+(\d{4})\s*$/i.exec(text?.trim() ?? '');
  if (!m) return null;
  const month = MESES.indexOf((m[1] ?? '').toLowerCase());
  if (month < 0) return null;
  return madridToIso(`${m[2]}-${String(month + 1).padStart(2, '0')}-01 00:00`);
}

/**
 * The service names its edition in free text: `description` and documentInfo say
 * "Decembro 2025" while `serviceDescription` still says "Xuño 2025". Take the newest.
 */
export function publishedFromService(service: ServiceInfo): string | null {
  const texts = [
    service.description,
    service.serviceDescription,
    service.documentInfo?.Subject,
    service.documentInfo?.Comments,
  ];
  const dates = texts.map(editionFromText).filter((d): d is string => d !== null);
  return dates.sort().at(-1) ?? null;
}

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** 11-digit COD_IGRP, or null when the source value is malformed. */
export function cleanCodigo(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^\d{11}$/.test(s) ? s : null;
}

/** COD_ENT_CO (integer) → 7-digit parroquia code; throws when unusable. */
export function codigoParroquia(v: unknown): string {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : String(v ?? '').trim();
  if (!/^\d{6,7}$/.test(s)) throw new Error(`Bad COD_ENT_CO: ${String(v)}`);
  const c = s.padStart(7, '0');
  if (!['15', '27', '32', '36'].includes(c.slice(0, 2))) {
    throw new Error(`COD_ENT_CO outside Galicia: ${c}`);
  }
  return c;
}

function nomenclator(v: unknown): boolean | null {
  const t = text(v);
  if (t === 'SI') return true;
  if (t === 'NO') return false;
  return null;
}

interface Row {
  base: string;
  lon: number;
  lat: number;
  properties: Record<string, unknown>;
}

function toRow(f: ArcFeature): Row {
  const p = f.properties ?? {};
  const coords = f.geometry?.type === 'Point' ? (f.geometry.coordinates as unknown[]) : null;
  const lon = Number(coords?.[0]);
  const lat = Number(coords?.[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error(`Entity ${String(p.COD_IGRP)} without point geometry`);
  }
  const codigo = cleanCodigo(p.COD_IGRP);
  const parroquia = codigoParroquia(p.COD_ENT_CO);
  // When both are valid the parroquia code is the first 7 digits of COD_IGRP (checked on
  // the full download of 24/10/2026: no exceptions); a disagreement is a broken record.
  if (codigo && codigo.slice(0, 7) !== parroquia) {
    throw new Error(`COD_IGRP ${codigo} does not match COD_ENT_CO ${parroquia}`);
  }
  const nome = text(p.ETIQUETA_M) ?? text(p.NOME_LUGAR);
  if (!nome) throw new Error(`Entity ${codigo ?? parroquia} without name`);
  const tipo = text(p.TIPO_ENTID);
  if (!tipo) throw new Error(`Entity ${codigo ?? parroquia} without TIPO_ENTID`);
  const pob = p.POB_2024;
  const poboacion =
    SEN_POBOACION.has(tipo) || typeof pob !== 'number' || !Number.isInteger(pob) || pob < 0
      ? null
      : pob;
  return {
    base: codigo ?? `${parroquia}-sen-codigo`,
    lon,
    lat,
    properties: {
      codigo,
      nome,
      tipo,
      tipo_nome: TIPOS[tipo]?.gl ?? null,
      codigo_parroquia: parroquia,
      codigo_ine: parroquia.slice(0, 5),
      poboacion,
      nomenclator_xunta: nomenclator(p.NOMEN_XUNT),
    },
  };
}

/** Stable ids: the code when unique, else code + ordinal sorted by name and position. */
export function assignIds(rows: Row[]): Feature[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const g = groups.get(r.base);
    if (g) g.push(r);
    else groups.set(r.base, [r]);
  }
  const features: Feature[] = [];
  for (const [base, g] of groups) {
    g.sort(
      (a, b) =>
        String(a.properties.nome).localeCompare(String(b.properties.nome), 'gl') ||
        a.lon - b.lon ||
        a.lat - b.lat,
    );
    g.forEach((r, i) => {
      features.push({
        type: 'Feature',
        id: g.length === 1 ? base : `${base}-${i + 1}`,
        geometry: point(r.lon, r.lat),
        properties: r.properties,
      });
    });
  }
  return features;
}

async function fetchPages(ctx: AdapterContext, count: number): Promise<ArcPage[]> {
  const pages: ArcPage[] = [];
  const maxPages = Math.ceil(count / PAGE_SIZE) + 5;
  let offset = 0;
  for (let i = 0; i < maxPages; i++) {
    if (i > 0) await sleep(timing.pauseMs);
    const what = `offset ${offset}`;
    const page = parseJson<ArcPage>((await ctx.get(queryUrl(offset))).body, what);
    const features = checkPage(page, what);
    pages.push(page);
    if (!page.exceededTransferLimit) return pages;
    if (features.length === 0) throw new Error(`IDEG ${what}: empty page with more to come`);
    offset += features.length;
  }
  throw new Error(`IDEG entidades: more than ${maxPages} pages`);
}

export default {
  async fetch(ctx) {
    const service = parseJson<ServiceInfo>((await ctx.get(`${BASE}?f=json`)).body, 'service');
    if (!Array.isArray(service?.layers)) throw new Error('IDEG service: no layers list');
    await sleep(timing.pauseMs);
    const c = parseJson<{ count?: unknown; error?: { message?: string } }>(
      (await ctx.get(COUNT_URL)).body,
      'count',
    );
    if (c?.error) throw new Error(`IDEG count: ${c.error.message ?? 'service error'}`);
    const count = c?.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) {
      throw new Error(`IDEG count: unexpected value ${JSON.stringify(c)}`);
    }
    await sleep(timing.pauseMs);
    const pages = await fetchPages(ctx, count);
    return { service, count, pages };
  },

  normalize(raw, _ctx) {
    const rows: Row[] = [];
    let total = 0;
    for (const page of raw.pages) {
      for (const f of checkPage(page, 'entidades')) {
        total++;
        const row = toRow(f);
        if (inGalicia(row.lon, row.lat, 0.05)) rows.push(row);
      }
    }
    if (Math.abs(total - raw.count) > raw.count * COUNT_TOLERANCE) {
      throw new Error(`IDEG entidades: got ${total} features, service counts ${raw.count}`);
    }
    if (rows.length < total * (1 - COUNT_TOLERANCE)) {
      throw new Error(`IDEG entidades: ${total - rows.length} of ${total} points outside Galicia`);
    }
    const collection: FeatureCollection = { type: 'FeatureCollection', features: assignIds(rows) };
    return { collection, publishedAt: publishedFromService(raw.service) };
  },
} satisfies Adapter<Raw>;
