// Electric vehicle charging sites in Galicia from the national DATEX II v3 table
// (MITERD data published on the DGT National Access Point). One request per run.
// The file is ~83 MB uncompressed (2.6 MB gzip) and covers all of Spain, so it is never
// parsed as a whole: a small streaming scanner cuts it into energyInfrastructureSite
// elements and each site (a few KB) is read with regular expressions. No XML library.

import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';
import { type Adapter, type Feature, inGalicia, point, round } from '../../lib/adapter.ts';

export const URL =
  'https://nap.dgt.es/datex2/v3/miterd/EnergyInfrastructureTablePublication/electrolineras.xml';

/** Sites are kept by their address (Galicia); the bbox pad only guards against bad coordinates. */
export const PAD = 0.05;
const GALICIAN_PROVINCES = new Set(['15', '27', '32', '36']);
const DOWNLOAD_TIMEOUT_MS = 300_000;
const CHUNK = 1 << 20;

export type Raw = Buffer;

/** DATEX II connector codes -> common names (same in Galician and Spanish). */
export const CONNECTORS: Record<string, string> = {
  iec62196T2: 'Tipo 2',
  iec62196T2COMBO: 'CCS2',
  chademo: 'CHAdeMO',
  iec62196T1: 'Tipo 1',
  iec62196T1COMBO: 'CCS1',
  iec62196T3A: 'Tipo 3A',
  iec62196T3C: 'Tipo 3C',
  domesticF: 'Schuko',
  domesticE: 'Doméstico E',
  domesticA: 'Doméstico A',
  domesticL: 'Doméstico L',
  iec60309x2single16: 'CEE monofásico 16 A',
  iec60309x2three32: 'CEE trifásico 32 A',
};

/** Yield the body as text chunks, gunzipping it first if it is still gzip-encoded. */
export async function* textChunks(body: Buffer, size = CHUNK): AsyncGenerator<string> {
  const gzipped = body.length > 2 && body[0] === 0x1f && body[1] === 0x8b;
  const decoder = new StringDecoder('utf8');
  if (gzipped) {
    const stream = Readable.from([body]).pipe(createGunzip());
    for await (const part of stream) {
      const s = decoder.write(part as Buffer);
      if (s) yield s;
    }
  } else {
    for (let i = 0; i < body.length; i += size) {
      const s = decoder.write(body.subarray(i, i + size));
      if (s) yield s;
    }
  }
  const rest = decoder.end();
  if (rest) yield rest;
}

const OPEN = /<(?:[\w.-]+:)?energyInfrastructureSite(?=[\s>/])/g;
const CLOSE = /<\/(?:[\w.-]+:)?energyInfrastructureSite\s*>/g;
const HEADER_MAX = 64 * 1024;

/**
 * Split a DATEX II energy infrastructure table into site elements.
 * Returns the text before the first site (capped) and the number of sites seen.
 * Scans by index so each chunk is copied once, not once per site.
 */
export async function scanSites(
  chunks: AsyncIterable<string>,
  onSite: (xml: string) => void,
): Promise<{ header: string; sites: number }> {
  let buf = '';
  let header: string | null = null;
  let sites = 0;
  for await (const chunk of chunks) {
    buf += chunk;
    let pos = 0;
    for (;;) {
      OPEN.lastIndex = pos;
      const open = OPEN.exec(buf);
      if (!open) {
        if (header === null) {
          if (buf.length <= HEADER_MAX * 4) break; // still reading the header
          header = buf.slice(0, HEADER_MAX);
        }
        // Keep a tail long enough to hold a partial opening tag.
        buf = buf.slice(Math.max(pos, buf.length - 256));
        break;
      }
      if (header === null) header = buf.slice(0, Math.min(open.index, HEADER_MAX));
      CLOSE.lastIndex = open.index;
      const close = CLOSE.exec(buf);
      if (!close) {
        buf = buf.slice(open.index);
        break;
      }
      const end = close.index + close[0].length;
      onSite(buf.slice(open.index, end));
      sites++;
      pos = end;
    }
  }
  if (header === null) header = buf.slice(0, HEADER_MAX);
  return { header, sites };
}

// --- small XML helpers for one site element --------------------------------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const elementRe = (local: string, flags = '') =>
  new RegExp(
    `<(?:[\\w.-]+:)?${local}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${local}\\s*>)`,
    flags,
  );

/** Inner XML of the first element with this local name ('' if empty, null if absent). */
export function first(xml: string, local: string): string | null {
  const m = elementRe(local).exec(xml);
  return m ? (m[1] ?? '') : null;
}

export function all(xml: string, local: string): string[] {
  return [...xml.matchAll(elementRe(local, 'g'))].map((m) => m[1] ?? '');
}

function strip(xml: string, local: string): string {
  return xml.replace(elementRe(local, 'g'), '');
}

/** Text of the first multilingual value (com:values/com:value) inside an element. */
function text(xml: string | null): string | null {
  if (xml === null) return null;
  const v = first(xml, 'value');
  const t = decodeXml((v ?? xml).replace(/<[^>]*>/g, '')).trim();
  return t || null;
}

function toIso(s: string | null): string | null {
  if (!s) return null;
  const ms = Date.parse(s.trim());
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export interface Site {
  id: string;
  nome: string;
  operador: string | null;
  concello: string | null;
  galicia: boolean;
  lat: number;
  lon: number;
  puntos: number;
  potencia_max_kw: number | null;
  /** Readable connector names, sorted and joined ("CCS2, CHAdeMO, Tipo 2"); null if none. */
  conectores: string | null;
  actualizado: string | null;
}

/** Read one energyInfrastructureSite element. Returns null if it has no usable coordinates. */
export function parseSite(xml: string): Site | null {
  const id = /^\s*<[^>]*\sid="([^"]*)"/.exec(xml)?.[1];
  if (!id) throw new Error('energyInfrastructureSite without id');

  const operatorXml = first(xml, 'operator');
  const operador = operatorXml === null ? null : text(first(operatorXml, 'name'));

  const location = first(xml, 'locationReference') ?? '';
  const lat = Number(text(first(location, 'latitude')));
  const lon = Number(text(first(location, 'longitude')));

  const lines = all(location, 'addressLine').map((l) => text(first(l, 'text')) ?? '');
  const line = (label: string) =>
    lines
      .find((l) => l.startsWith(`${label}:`))
      ?.slice(label.length + 1)
      .trim() ?? null;
  const ccaa = line('Comunidad Autónoma');
  const postcode = text(first(location, 'postcode'));
  // Postcodes lose their leading zero in this feed ("3690" is Alicante 03690), so only a
  // 5-digit code says anything about the province.
  const galicia =
    ccaa !== null
      ? /galicia/i.test(ccaa)
      : postcode !== null &&
        /^\d{5}$/.test(postcode) &&
        GALICIAN_PROVINCES.has(postcode.slice(0, 2));

  // The site's own name is the first name once nested elements with names are removed.
  let own = xml;
  for (const local of [
    'operator',
    'energyInfrastructureStation',
    'locationReference',
    'operatingHours',
    'supplementalFacility',
    'associatedFacility',
  ]) {
    own = strip(own, local);
  }
  const nome = text(first(own, 'name')) ?? id;

  const points = all(xml, 'refillPoint');
  const powers = all(xml, 'maxPowerAtSocket')
    .map((p) => Number(p.trim()))
    .filter((p) => Number.isFinite(p) && p > 0);
  const names = [
    ...new Set(
      all(xml, 'connectorType')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => CONNECTORS[c] ?? c),
    ),
  ].sort((a, b) => a.localeCompare(b, 'gl'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return {
    id,
    nome,
    operador,
    concello: line('Municipio'),
    galicia,
    lat,
    lon,
    puntos: points.length,
    // maxPowerAtSocket is in watts.
    potencia_max_kw: powers.length ? round(Math.max(...powers) / 1000, 1) : null,
    conectores: names.length ? names.join(', ') : null,
    actualizado: toIso(text(first(own, 'lastUpdated'))),
  };
}

const adapter = {
  async fetch(ctx) {
    const res = await ctx.get(URL, {
      headers: { 'accept-encoding': 'gzip' },
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
    });
    return res.body;
  },

  async normalize(raw, _ctx) {
    if (!Buffer.isBuffer(raw) || raw.length === 0) throw new Error('Empty response');
    const features: Feature[] = [];
    const { header } = await scanSites(textChunks(raw), (xml) => {
      const s = parseSite(xml);
      if (!s?.galicia || !inGalicia(s.lon, s.lat, PAD)) return;
      features.push({
        type: 'Feature',
        id: s.id,
        geometry: point(s.lon, s.lat),
        properties: {
          id: s.id,
          nome: s.nome,
          operador: s.operador,
          concello: s.concello,
          puntos: s.puntos,
          potencia_max_kw: s.potencia_max_kw,
          conectores: s.conectores,
          actualizado: s.actualizado,
        },
      });
    });

    if (!/energyInfrastructureTable/.test(header) && features.length === 0) {
      throw new Error('Unexpected response: no energyInfrastructureTable');
    }
    const pub = /<(?:[\w.-]+:)?publicationTime>([^<]+)</.exec(header)?.[1] ?? null;
    if (!pub) throw new Error('Unexpected response: no publicationTime');
    const publishedAt = toIso(pub);
    if (!publishedAt) throw new Error(`Unparseable publicationTime: ${pub}`);

    return { collection: { type: 'FeatureCollection', features }, publishedAt };
  },
} satisfies Adapter<Raw>;

export default adapter;
