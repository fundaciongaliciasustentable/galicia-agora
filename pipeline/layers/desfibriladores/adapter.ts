// Registered automated external defibrillators (DESA) in Galicia, from the 061 register
// published on abertos.xunta.gal (dataset 0604): one Latin-1 CSV with lat/lon columns and a
// Last-Modified header, used as publishedAt.
//
// Privacy. `solicitante` (who registered the device) is never read into the output: some are
// natural persons. Devices in private homes are dropped (installation type "En Domicilio
// particular" or a location that says domicilio, vivienda, piso or particular). `ubicacion`
// is free text written by the applicant: phone numbers are removed, and when the applicant
// looks like a person and the text repeats any of their names, the text is dropped.

import { type Adapter, type Feature, point } from '../../lib/adapter.ts';
import { decodeText, latLon, records } from '../../lib/csv.ts';
import { httpDateToIso } from '../centros-maiores/adapter.ts';
import INE_NAMES from '../centros-saude/concellos-ine.json' with { type: 'json' };
import { lookupConcello, normalise } from '../centros-saude/sergas.ts';

export const URL = 'https://ficheiros-web.xunta.gal/abertos/desfibriladores/equipos-DESA-061.csv';

const COLUMNS = [
  'codequipo',
  'ubicacion',
  'municipio',
  'provincia',
  'lat',
  'lon',
  'tipoInstalacion',
];

/** Source installation type → short Galician label. */
export const TIPO: Record<string, string> = {
  'En empresa privada': 'Empresa privada',
  'En instalaciones deportivas': 'Instalación deportiva',
  Otros: 'Outros',
  'Administraciones o instituciones públicas': 'Administración pública',
  'En centros docentes': 'Centro docente',
  'Protección civil (no amb.)': 'Protección civil',
  'En Residencias 3ª edad.': 'Residencia de maiores',
  'Albergue de Peregrinos': 'Albergue de peregrinos',
  'En piscina': 'Piscina',
  'Cruz roja (no amb.)': 'Cruz Vermella',
  'En playa': 'Praia',
  'En aeropuertos, est.ferroviarias o marítimas': 'Aeroporto ou estación',
  'En Hoteles y otros alojamientos turísticos': 'Hotel ou aloxamento',
  'Tótem en vía pública': 'Tótem na vía pública',
};

const HOME_TYPE = 'En Domicilio particular';
const HOME_TEXT =
  /\bdomicilio\b|^vivienda\b(?!\s+comunit)|\bvivienda particular\b|^piso\b|\bparticular\b/i;
const PHONE = /\(?\b(?:\+?34\s?)?[6789]\d{2}\s?\d{3}\s?\d{3}\b\)?/g;

// Common given names (Galician and Spanish forms, accents folded). An applicant whose first
// word is one of them is treated as a natural person. Seen in the register on 2026-11-01
// plus the most frequent names in Galicia.
const GIVEN = new Set(
  (
    'abraham adrian alberto alejandro alfonso alicia ana andrea angel angela antonio asuncion ' +
    'beatriz brais carlos carmen carolina celia concepcion cristina daniel david diego dolores ' +
    'eduardo elena emilio enrique erick esther eva fernando francisco felipe gabriel gonzalo ' +
    'guillermo helena iago iliana ines irene isabel ivan javier jesus jorge jose josefa juan ' +
    'julia laura lorena lucia luis manuel manuela marcos margarita maria mario marta mercedes ' +
    'miguel modesto monica natalia nuria olga oscar pablo patricia paula pedro pilar rafael ' +
    'ramon raquel raul ricardo roberto rocio rosa ruben samuel sara sergio silvia simon sonia ' +
    'susana tamara teresa tomas uxia uxio vanesa veronica vicente victor xabier xavier xose ' +
    'xosefa xulia yolanda'
  ).split(' '),
);

/** True when the applicant's first word is a common given name (a natural person). */
export function looksLikePerson(name: string): boolean {
  const first = normalise(name).split(' ')[0] ?? '';
  return GIVEN.has(first);
}

/**
 * Public location text: phone numbers removed; null when it repeats a word (4+ letters) of a
 * person applicant's name, or when it is empty.
 */
export function ubicacion(text: string, solicitante: string): string | null {
  const s = text
    .replace(PHONE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  if (looksLikePerson(solicitante)) {
    const names = new Set(
      normalise(solicitante)
        .split(' ')
        .filter((w) => w.length >= 4),
    );
    if (
      normalise(s)
        .split(' ')
        .some((w) => names.has(w))
    )
      return null;
  }
  return s;
}

/** 061 short names that the shared lookup does not resolve (checked 2026-11-01). */
const ALIASES: Record<string, string> = {
  SANTIAGO: '15078',
  MONFORTE: '27031',
  'PONTES, AS': '15070',
  SALVATERRA: '36050',
  PEDRAFITA: '27045',
};

export function concello(raw: string): { ine: string; nome: string } | null {
  const ine = ALIASES[raw.trim().toUpperCase()];
  if (ine) return { ine, nome: (INE_NAMES as Record<string, string>)[ine] as string };
  return lookupConcello(raw);
}

export function isHome(tipo: string, text: string): boolean {
  return tipo === HOME_TYPE || HOME_TEXT.test(text);
}

export interface ParseStats {
  rows: number;
  homes: number;
  badCoords: number;
  textDropped: number;
}

export function toFeatures(csv: string): { features: Feature[]; stats: ParseStats } {
  const rows = records(csv, ',', [...COLUMNS, 'solicitante']);
  const stats: ParseStats = { rows: rows.length, homes: 0, badCoords: 0, textDropped: 0 };
  const features: Feature[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = r.codequipo ?? '';
    if (!/^\d+$/.test(id)) throw new Error(`desfibriladores: bad codequipo "${id}"`);
    const tipoRaw = r.tipoInstalacion ?? '';
    const rawText = r.ubicacion ?? '';
    if (isHome(tipoRaw, rawText)) {
      stats.homes++;
      continue;
    }
    // Wrong-signed or missing coordinates are dropped, not guessed.
    const pos = latLon(r.lat ?? '', r.lon ?? '');
    if (!pos) {
      stats.badCoords++;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const text = ubicacion(rawText, r.solicitante ?? '');
    if (text === null && rawText.trim()) stats.textDropped++;
    const hit = concello(r.municipio ?? '');
    features.push({
      type: 'Feature',
      id,
      geometry: point(pos.lon, pos.lat),
      properties: {
        id,
        ubicacion: text,
        tipo: TIPO[tipoRaw] ?? 'Outros',
        concello: hit?.nome ?? (r.municipio || null),
        codigo_ine: hit?.ine ?? null,
      },
    });
  }
  return { features, stats };
}

export interface Raw {
  csv: string;
  lastModified: string | null;
}

/** Stats of the last normalize call, for tests and logging. */
export let lastStats: ParseStats | null = null;

const adapter = {
  async fetch(ctx) {
    const res = await ctx.get(URL);
    return {
      csv: decodeText(res.body),
      lastModified: res.lastModified ?? res.headers?.['last-modified'] ?? null,
    };
  },

  normalize(raw, _ctx) {
    const { features, stats } = toFeatures(raw.csv);
    lastStats = stats;
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: httpDateToIso(raw.lastModified),
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
