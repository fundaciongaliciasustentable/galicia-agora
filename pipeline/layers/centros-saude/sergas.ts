// Shared reader for the SERGAS health services map (dataset 0253 on abertos.xunta.gal):
// an undocumented ArcGIS KmlServer behind an ASP.NET proxy that returns one KMZ (~145 KB,
// doc.kml ~2.8 MB) with six folders: blood donation points, two hospital folders, health
// centres, PACs and pharmacies. Used by the centros-saude, hospitais and farmacias layers;
// each layer run downloads the KMZ once.
//
// Each Placemark carries its attributes as an HTML "Field Name / Field Value" table inside a
// CDATA description. Empty values come as "<Null>", double-escaped ("&#38;lt;Null&#38;gt;").

import { inflateRawSync } from 'node:zlib';
import type { AdapterContext } from '../../lib/adapter.ts';
import INE_NAMES from './concellos-ine.json' with { type: 'json' };

export const SERGAS_URL =
  'https://extranet.sergas.es/sixsanweb/SIXSAN_WEB/proxyKml.ashx?SIXSAN_WEB_KML/MapServer/KmlServer?Composite=false&BBOX=-9.35,41.8,-6.7,43.8';

/** Folder names in the KMZ (verified 2026-10-24). */
export const FOLDERS = {
  doazon: 'Puntos fijos de donación de sangre',
  hospitais: 'Hospitais e centros de especialidades',
  complexos: 'Hospitais centros de especialidades e pacs',
  centrosSaude: 'Centros de saúde',
  pac: 'Puntos de atención continuada',
  farmacias: 'Farmacias',
} as const;

/** Points just over a provincial border still belong to Galicia: small pad. */
export const PAD = 0.05;

export interface Placemark {
  name: string;
  lon: number;
  lat: number;
  /** Attribute table; empty and "<Null>" values are dropped. */
  fields: Record<string, string>;
}

export type Folders = Map<string, Placemark[]>;

/** Download the KMZ (one request) and return doc.kml as text. */
export async function fetchSergasKml(ctx: AdapterContext): Promise<string> {
  const res = await ctx.get(SERGAS_URL, { timeoutMs: 120_000 });
  return extractZipEntry(res.body, 'doc.kml').toString('utf8');
}

/**
 * Minimal ZIP reader: find `name` in the central directory and inflate it.
 * Supports stored (0) and deflate (8) entries, which is what the KmlServer writes.
 */
export function extractZipEntry(zip: Buffer, name: string): Buffer {
  // End of central directory record: signature 0x06054b50, within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP/KMZ file (no end of central directory)');
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const entryName = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (entryName === name) {
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Corrupt ZIP local header');
      const start =
        localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const data = zip.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Unsupported ZIP compression method ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} not found in KMZ`);
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode XML/HTML character references, repeatedly (the source double-escapes some). */
export function decodeEntities(s: string): string {
  let prev = '';
  let cur = s;
  for (let i = 0; i < 3 && cur !== prev; i++) {
    prev = cur;
    cur = cur.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    });
  }
  return cur;
}

function clean(s: string): string {
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

/** Parse doc.kml into folders of placemarks. Throws if the structure is not recognised. */
export function parseKml(kml: string): Folders {
  const folders: Folders = new Map();
  const parts = kml.split(/<Folder\b[^>]*>/).slice(1);
  if (parts.length === 0) throw new Error('Unexpected KML: no folders');
  for (const part of parts) {
    const body = part.split('</Folder>')[0] ?? '';
    const folderName = clean(/<name>([\s\S]*?)<\/name>/.exec(body)?.[1] ?? '');
    const list: Placemark[] = [];
    for (const m of body.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g)) {
      const pm = m[1] ?? '';
      const coords = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm)?.[1]?.trim().split(',');
      const lon = Number(coords?.[0]);
      const lat = Number(coords?.[1]);
      if (!coords || !Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new Error(`Placemark without point coordinates in "${folderName}"`);
      }
      const fields: Record<string, string> = {};
      for (const row of pm.matchAll(/<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g)) {
        const k = clean(row[1] ?? '');
        const v = clean(row[2] ?? '');
        if (k && v && v !== '<Null>') fields[k] = v;
      }
      list.push({ name: clean(/<name>([\s\S]*?)<\/name>/.exec(pm)?.[1] ?? ''), lon, lat, fields });
    }
    folders.set(folderName, list);
  }
  return folders;
}

/** Placemarks of a folder; throws if the folder is missing (source changed). */
export function folder(folders: Folders, name: string): Placemark[] {
  const list = folders.get(name);
  if (!list) throw new Error(`Folder "${name}" not found; got: ${[...folders.keys()].join(', ')}`);
  return list;
}

/** Lower-case ASCII words: "CORUÑA (A)" -> "coruna a". */
export function normalise(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slug(s: string): string {
  return normalise(s).replace(/ /g, '-');
}

const ARTICLES = new Set(['a', 'o', 'as', 'os']);

/**
 * Concello name key without the leading or trailing article, so that "CORUÑA (A)",
 * "POBRA DO CARAMIÑAL A" and "A Pobra do Caramiñal" all match.
 */
export function concelloKey(s: string): string {
  const words = normalise(s).split(' ');
  if (words.length > 1 && ARTICLES.has(words[0] as string)) words.shift();
  else if (words.length > 1 && ARTICLES.has(words[words.length - 1] as string)) words.pop();
  return words.join(' ');
}

/**
 * SERGAS short names that differ from the IET names in concellos-parroquias (checked one by one
 * on 2026-10-25). "CARBALLEDA" is left out on purpose: it can be Carballeda de Avia or de
 * Valdeorras, so it gets no code.
 */
const ALIASES: Record<string, string> = {
  fornelos: '36019', // Fornelos de Montes
  alfoz: '27002', // Alfoz do Castrodouro
  'castro caldelas': '32023', // O Castro de Caldelas
  cangas: '36008', // Cangas (Cangas de Morrazo in the IET data)
  cabana: '15014', // Cabana de Bergantiños
};

const BY_KEY = new Map<string, { ine: string; nome: string }>();
for (const [ine, nome] of Object.entries(INE_NAMES as Record<string, string>)) {
  BY_KEY.set(concelloKey(nome), { ine, nome });
}
for (const [key, ine] of Object.entries(ALIASES)) {
  BY_KEY.set(key, { ine, nome: (INE_NAMES as Record<string, string>)[ine] as string });
}

/** INE code and official name of a concello from its SERGAS spelling, or null if unsure. */
export function lookupConcello(s: string): { ine: string; nome: string } | null {
  return BY_KEY.get(concelloKey(s)) ?? null;
}

/** "15006" -> "15006"; anything else -> null. */
export function postcode(s: string | undefined): string | null {
  return s && /^\d{5}$/.test(s) ? s : null;
}

/** Common properties: address, postcode and concello (official name when known). */
export function place(p: Placemark): {
  enderezo: string;
  cp: string | null;
  concello: string;
  codigo_ine: string | null;
} {
  const raw = p.fields.CONCELLO ?? '';
  const hit = lookupConcello(raw);
  return {
    enderezo: p.fields.DIRECCION ?? '',
    cp: postcode(p.fields.CODIGOPOST),
    concello: hit?.nome ?? raw,
    codigo_ine: hit?.ine ?? null,
  };
}
