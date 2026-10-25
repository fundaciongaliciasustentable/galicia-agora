// Shared reader for the DGT DATEX II v3.7 SituationPublication feed (all of Spain,
// ~3 MB uncompressed). Used by trafico-incidencias and trafico-balizas-v16: both layers
// read the same file, so the download is memoised for a short time and a single ingest
// run downloads it once. The file is scanned in chunks and cut into <situation>
// elements; each one (a few KB) is read with regular expressions. No XML library.

import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';
import type { AdapterContext } from '../../lib/adapter.ts';

export const SITUATIONS_URL =
  'https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml';

const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Long enough to cover both layers of one ingest run, short enough to never reuse a stale file. */
export const MEMO_TTL_MS = 120_000;

let memo: { at: number; body: Promise<Buffer> } | null = null;

/** Forget the memoised download (tests). */
export function clearSituationsCache(): void {
  memo = null;
}

/**
 * Download the feed once per MEMO_TTL_MS. Failed downloads are not memoised, so the
 * second layer retries on its own instead of inheriting the error.
 */
export function fetchSituations(ctx: AdapterContext, clock = Date.now): Promise<Buffer> {
  const now = clock();
  if (memo && now - memo.at < MEMO_TTL_MS) return memo.body;
  const body = ctx
    .get(SITUATIONS_URL, { headers: { 'accept-encoding': 'gzip' }, timeoutMs: DOWNLOAD_TIMEOUT_MS })
    .then((res) => res.body);
  const entry = { at: now, body };
  memo = entry;
  body.catch(() => {
    if (memo === entry) memo = null;
  });
  return body;
}

// --- streaming scan --------------------------------------------------------------------

/** Yield the body as text chunks, gunzipping it first if it is still gzip-encoded. */
export async function* textChunks(body: Buffer, size = 1 << 20): AsyncGenerator<string> {
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

// "situation" followed by whitespace or ">" so that situationRecord does not match.
const OPEN = /<(?:[\w.-]+:)?situation(?=[\s>])/g;
const CLOSE = /<\/(?:[\w.-]+:)?situation\s*>/g;
const HEADER_MAX = 64 * 1024;

/** Split the publication into <situation> elements. Returns the header text and the count. */
export async function scanSituations(
  chunks: AsyncIterable<string>,
  onSituation: (xml: string) => void,
): Promise<{ header: string; situations: number }> {
  let buf = '';
  let header: string | null = null;
  let situations = 0;
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
      onSituation(buf.slice(open.index, end));
      situations++;
      pos = end;
    }
  }
  if (header === null) header = buf.slice(0, HEADER_MAX);
  return { header, situations };
}

// --- small XML helpers -----------------------------------------------------------------

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
    `<(?:[\\w.-]+:)?${local}(?=[\\s/>])(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${local}\\s*>)`,
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

/** Trimmed text of the first element with this local name, or null. */
export function text(xml: string, local: string): string | null {
  const inner = first(xml, local);
  if (inner === null) return null;
  const t = decodeXml(inner.replace(/<[^>]*>/g, '')).trim();
  return t || null;
}

export function toIso(s: string | null): string | null {
  if (!s) return null;
  const ms = Date.parse(s.trim());
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** publicationTime from the header, as ISO UTC. Throws if the header is not a DATEX II payload. */
export function publicationTime(header: string): string {
  if (!/SituationPublication/.test(header)) {
    throw new Error('Unexpected response: not a SituationPublication');
  }
  const pub = /<(?:[\w.-]+:)?publicationTime>([^<]+)</.exec(header)?.[1] ?? null;
  const iso = toIso(pub);
  if (!iso) throw new Error(`Unexpected response: no valid publicationTime (${pub})`);
  return iso;
}

// --- records ---------------------------------------------------------------------------

export interface LocPoint {
  lat: number;
  lon: number;
  galicia: boolean;
  pk: number | null;
  concello: string | null;
  provincia: string | null;
}

export interface SituationRecord {
  situationId: string;
  id: string;
  /** xsi:type without prefix, e.g. RoadOrCarriagewayOrLaneManagement. */
  recordType: string;
  /** True for connected V16 beacons (situationRecordCreationReference V16_…). Never published. */
  v16: boolean;
  source: string | null;
  start: string | null;
  end: string | null;
  severity: string | null;
  causeType: string | null;
  /** Value of the element inside detailedCauseType (accidentType, roadMaintenanceType…). */
  detailedCause: string | null;
  /** Record-level measure: management type, instruction, road condition… */
  measures: string[];
  laneUsage: string | null;
  carriageway: string | null;
  road: string | null;
  direction: string | null;
  directionRoad: string | null;
  /** Linear locations: from and to. Point locations: from only. */
  from: LocPoint | null;
  to: LocPoint | null;
}

const MEASURE_ELEMENTS = [
  'roadOrCarriagewayOrLaneManagementType',
  'speedManagementType',
  'generalInstructionToRoadUsersType',
  'nonWeatherRelatedRoadConditionType',
  'abnormalTrafficType',
];

function locPoint(xml: string | null): LocPoint | null {
  if (xml === null) return null;
  const lat = Number(text(xml, 'latitude'));
  const lon = Number(text(xml, 'longitude'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  const km = text(xml, 'kilometerPoint');
  const pk = km === null ? null : Number(km);
  return {
    lat,
    lon,
    galicia: text(xml, 'autonomousCommunity') === 'Galicia',
    pk: pk !== null && Number.isFinite(pk) ? pk : null,
    concello: text(xml, 'municipality'),
    provincia: text(xml, 'province'),
  };
}

const RECORD = /<(?:[\w.-]+:)?situationRecord(?=[\s>])[\s\S]*?<\/(?:[\w.-]+:)?situationRecord\s*>/g;

/** Read every situationRecord of one <situation> element. */
export function parseSituation(xml: string): SituationRecord[] {
  const situationId = /^\s*<[^>]*\sid="([^"]*)"/.exec(xml)?.[1];
  if (!situationId) throw new Error('situation without id');
  // overallSeverity sits on the situation, outside the records.
  const overall = /<(?:[\w.-]+:)?overallSeverity>([^<]*)</.exec(xml)?.[1]?.trim() ?? null;

  return [...xml.matchAll(RECORD)].map(([rec]) => {
    const open = /^<[^>]*>/.exec(rec)?.[0] ?? '';
    const id = /\sid="([^"]*)"/.exec(open)?.[1];
    if (!id) throw new Error(`situationRecord without id in situation ${situationId}`);
    const recordType = /xsi:type="(?:[\w.-]+:)?(\w+)"/.exec(open)?.[1] ?? 'unknown';
    const ref = text(rec, 'situationRecordCreationReference') ?? '';

    const detailed = first(rec, 'detailedCauseType');
    const detailedCause =
      detailed === null ? null : decodeXml(detailed.replace(/<[^>]*>/g, '')).trim() || null;

    const linear = first(rec, 'tpegLinearLocation');
    const from = linear !== null ? locPoint(first(linear, 'from')) : locPoint(first(rec, 'point'));
    const to = linear !== null ? locPoint(first(linear, 'to')) : null;

    // <carriageway> nests a <carriageway> with the value, so match the leaf directly.
    const carriageway = [...rec.matchAll(/<(?:[\w.-]+:)?carriageway>\s*(\w+)\s*</g)]
      .map((m) => m[1])
      .find((c) => c !== 'unspecifiedCarriageway');

    return {
      situationId,
      id,
      recordType,
      v16: ref.startsWith('V16_'),
      source: text(rec, 'sourceIdentification'),
      start: toIso(text(rec, 'overallStartTime')),
      end: toIso(text(rec, 'overallEndTime')),
      severity: text(rec, 'severity') ?? overall,
      causeType: text(rec, 'causeType'),
      detailedCause,
      measures: MEASURE_ELEMENTS.map((m) => text(rec, m)).filter((m): m is string => m !== null),
      laneUsage: text(rec, 'laneUsage'),
      carriageway: carriageway ?? null,
      road: text(rec, 'roadName'),
      direction: text(rec, 'tpegDirection'),
      directionRoad: text(rec, 'tpegDirectionRoad'),
      from,
      to,
    };
  });
}

/** The point used to place a record in Galicia: from (or the single point), else to. */
export function galicianAnchor(r: SituationRecord): LocPoint | null {
  if (r.from?.galicia) return r.from;
  if (r.to?.galicia) return r.to;
  return null;
}

/** Read all records of the publication. */
export async function readRecords(
  body: Buffer,
  chunkSize?: number,
): Promise<{ records: SituationRecord[]; publishedAt: string; situations: number }> {
  if (!Buffer.isBuffer(body) || body.length === 0) throw new Error('Empty response');
  const records: SituationRecord[] = [];
  const { header, situations } = await scanSituations(textChunks(body, chunkSize), (xml) => {
    records.push(...parseSituation(xml));
  });
  return { records, publishedAt: publicationTime(header), situations };
}
