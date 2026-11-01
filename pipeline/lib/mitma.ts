// MITMA big-data mobility (estudios básicos, viajes): helpers shared by the mobility layers.
//
// - zoning: INE census section → MITMA district / municipality / GAU zone;
// - zone centroids: point shapefile in ETRS89 / UTM 30N, read without dependencies;
// - daily trip files: 140–165 MB gzip each (13–15 million rows for Spain). They are streamed
//   and reduced on the fly to the few flows a layer needs; nothing is kept whole in memory.
//
// See datos/fontes/mitma-mobilidade/README.md for the source checks (licence, method break of
// July 2025, small-flow floor, rural zones grouped in _AM blocks).

import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { utmToLonLat } from './utm.ts';

export const MITMA_BASE = 'https://movilidad-opendata.mitma.es';
export const ZONING_URL = `${MITMA_BASE}/zonificacion/relacion_ine_zonificacionMitma.csv`;
export const POPULATION_URL = `${MITMA_BASE}/zonificacion/poblacion.csv`;
export const CENTROIDS_URL = `${MITMA_BASE}/zonificacion/zonificacion_municipios/zonificacion_municipios_centroides`;
export const GALICIA_PROVINCES = ['15', '27', '32', '36'];
/** Daily files are large and the server is slow; allow ten minutes per file. */
export const DAY_TIMEOUT_MS = 600_000;

export type Level = 'municipios' | 'distritos' | 'GAU';

export const DAY_KINDS = ['mercores', 'domingo'] as const;
export type DayKind = (typeof DAY_KINDS)[number];
/**
 * Reference days of the animated maps (decided 1/11/2026): May 2025, inside MITMA's
 * January 2022–June 2025 method block. 4 May (end of a long weekend) is replaced by 1 June.
 */
export const REFERENCE_DAYS: Record<DayKind, string[]> = {
  mercores: ['2025-05-07', '2025-05-14', '2025-05-21', '2025-05-28'],
  domingo: ['2025-05-11', '2025-05-18', '2025-05-25', '2025-06-01'],
};
export const NAMES_URL = `${MITMA_BASE}/zonificacion/zonificacion_municipios/nombres_municipios.csv`;

/** Readable zone names: «Coruña, A» → «A Coruña»; grouped zones keep their head concello. */
export function zoneNames(csv: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = csv.split(/\r?\n/);
  const head = (lines[0] ?? '').split('|');
  const iId = head.indexOf('ID');
  const iName = head.indexOf('name');
  if (iId < 0 || iName < 0) throw new Error('Unexpected MITMA names header');
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const cols = line.split('|');
    let name = (cols[iName] ?? '').replace(/ agregacion de municipios$/, '').trim();
    const m = /^(.*), (A|O|As|Os)$/.exec(name);
    if (m) name = `${m[2]} ${m[1]}`;
    out.set(cols[iId] as string, name);
  }
  return out;
}

export function dayUrl(isoDate: string, level: Level = 'municipios'): string {
  const ymd = isoDate.replaceAll('-', '');
  return `${MITMA_BASE}/estudios_basicos/por-${level}/viajes/ficheros-diarios/${isoDate.slice(0, 7)}/${ymd}_Viajes_${level}.csv.gz`;
}

/** MITMA municipal zone of each INE concello code (Galicia only by default). */
export function municipalZones(
  csv: string,
  provinces: string[] = GALICIA_PROVINCES,
): { zoneOf: Map<string, string>; members: Map<string, Set<string>> } {
  const zoneOf = new Map<string, string>();
  const members = new Map<string, Set<string>>();
  const lines = csv.split(/\r?\n/);
  const head = (lines[0] ?? '').split('|');
  const iIne = head.indexOf('municipio_ine');
  const iZone = head.indexOf('municipio_mitma');
  if (iIne < 0 || iZone < 0) throw new Error('Unexpected MITMA zoning header');
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const cols = line.split('|');
    const ine = cols[iIne] as string;
    if (!provinces.includes(ine.slice(0, 2))) continue;
    const zone = cols[iZone] as string;
    zoneOf.set(ine, zone);
    const set = members.get(zone) ?? new Set<string>();
    set.add(ine);
    members.set(zone, set);
  }
  return { zoneOf, members };
}

/** Resident population per municipal zone (MITMA's own base, not the Padrón). */
export function zonePopulation(csv: string): Map<string, number> {
  const out = new Map<string, number>();
  const lines = csv.split(/\r?\n/);
  const head = (lines[0] ?? '').split('|');
  const iZone = head.indexOf('municipio');
  const iPop = head.indexOf('poblacion');
  if (iZone < 0 || iPop < 0) throw new Error('Unexpected MITMA population header');
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const cols = line.split('|');
    const v = Number(cols[iPop]);
    // Only foreign zones (Portugal, France) carry NA.
    if (!Number.isFinite(v)) continue;
    const zone = cols[iZone] as string;
    out.set(zone, (out.get(zone) ?? 0) + v);
  }
  return out;
}

/** Zone id → [lon, lat] from the centroid shapefile (.shp points + .dbf ID column). */
export function zoneCentroids(shp: Buffer, dbf: Buffer): Map<string, [number, number]> {
  const n = dbf.readUInt32LE(4);
  const headerLen = dbf.readUInt16LE(8);
  const recordLen = dbf.readUInt16LE(10);
  // Locate the ID field among the 32-byte descriptors.
  let offset = 1; // deletion flag
  let idOffset = -1;
  let idLen = 0;
  for (let i = 32; dbf[i] !== 0x0d; i += 32) {
    const name = dbf.toString('latin1', i, i + 11).replace(/\0.*$/, '');
    const len = dbf[i + 16] as number;
    if (name === 'ID') {
      idOffset = offset;
      idLen = len;
    }
    offset += len;
  }
  if (idOffset < 0) throw new Error('No ID field in MITMA centroid .dbf');
  const out = new Map<string, [number, number]>();
  let pos = 100;
  for (let r = 0; r < n; r++) {
    const contentBytes = shp.readInt32BE(pos + 4) * 2;
    const type = shp.readInt32LE(pos + 8);
    const rec = headerLen + r * recordLen;
    const id = dbf.toString('latin1', rec + idOffset, rec + idOffset + idLen).trim();
    if (type === 1) {
      const [lon, lat] = utmToLonLat(shp.readDoubleLE(pos + 12), shp.readDoubleLE(pos + 20), 30);
      out.set(id, [lon, lat]);
    }
    pos += 8 + contentBytes;
  }
  return out;
}

/** Trips of one day per hour (0–23) and folded origin/destination: key `${h}|${o}|${d}`. */
export type DayFlows = Map<string, number>;

/**
 * Stream a national daily file and keep the rows `keep(o, d)` accepts, summing trips by hour
 * and by the folded origin and destination (`fold` maps a zone to its bucket, e.g. outside
 * zones to one id). Returns the flows and the number of rows read.
 */
export async function reduceDay(
  gz: Buffer,
  keep: (o: string, d: string) => boolean,
  fold: (zone: string) => string = (z) => z,
): Promise<{ flows: DayFlows; rows: number }> {
  const lines = createInterface({
    input: Readable.from(gz).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  const flows: DayFlows = new Map();
  let iHour = -1;
  let iO = -1;
  let iD = -1;
  let iTrips = -1;
  let rows = 0;
  for await (const line of lines) {
    if (iHour < 0) {
      const head = line.split('|');
      iHour = head.indexOf('periodo');
      iO = head.indexOf('origen');
      iD = head.indexOf('destino');
      iTrips = head.indexOf('viajes');
      if ([iHour, iO, iD, iTrips].includes(-1)) throw new Error('Unexpected MITMA trips header');
      continue;
    }
    if (!line) continue;
    rows++;
    const cols = line.split('|');
    const o = cols[iO] as string;
    const d = cols[iD] as string;
    if (!keep(o, d)) continue;
    const key = `${Number(cols[iHour])}|${fold(o)}|${fold(d)}`;
    flows.set(key, (flows.get(key) ?? 0) + Number(cols[iTrips]));
  }
  if (iHour < 0) throw new Error('Empty MITMA trips file');
  return { flows, rows };
}
