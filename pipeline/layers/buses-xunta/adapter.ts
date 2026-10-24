// Xunta de Galicia bus stops from the regional GTFS published on the NAP (MITRAMS).
// The ZIP is ~144 MB (stop_times.txt ~202 MB and shapes.txt ~389 MB uncompressed), so it is
// written to a temporary file and each member is streamed line by line through the system
// `unzip -p`; stop_times.txt is never held in memory and shapes.txt is not read.
// Output: one point per stop served by at least one line, with the number of lines and
// up to 10 line names. Route geometries (shapes.txt) are future work.
// The NAP key goes in the ApiKey header; it must never reach meta.json, logs or errors.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  type Adapter,
  type AdapterContext,
  type Feature,
  inGalicia,
  madridToIso,
  point,
} from '../../lib/adapter.ts';

export const DOWNLOAD_URL = 'https://nap.transportes.gob.es/api/Fichero/download/1584';
/** Dataset metadata. Shape not verified (no working key yet): read defensively. */
export const META_URL = 'https://nap.transportes.gob.es/api/Fichero/1386';
export const KEY_ENV = 'NAP_API_KEY';

/** Lines run into Asturias, León and Zamora: keep stops just over the border. */
export const PAD = 0.1;
export const MAX_NAMES = 10;
const DOWNLOAD_TIMEOUT_MS = 300_000;

export interface Raw {
  /** Temporary directory holding the downloaded ZIP; removed by normalize. */
  dir: string;
  zipPath: string;
  /** Parsed metadata JSON, or null if the optional request failed. */
  meta: unknown;
}

/** Replace every occurrence of the key so it never leaks. */
export function redact(text: string, key: string | undefined): string {
  return key ? text.split(key).join(`[${KEY_ENV}]`) : text;
}

/** Minimal RFC 4180 line parser (GTFS fields are quoted when they contain commas). */
export function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Stream one CSV member of the ZIP through `unzip -p`, calling `onRow` with the values of
 * `columns` (in that order) for every data row. Columns missing from the header throw,
 * except those listed in `optional`, which read as ''.
 */
export async function forEachRow(
  zipPath: string,
  member: string,
  columns: string[],
  onRow: (values: string[]) => void,
  optional: string[] = [],
): Promise<void> {
  const child = spawn('unzip', ['-p', zipPath, member], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => {
    if (stderr.length < 2000) stderr += d.toString('utf8');
  });
  const exit = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? -1));
  });
  exit.catch(() => {}); // awaited below; avoid an unhandled rejection meanwhile

  let idx: number[] | null = null;
  try {
    const rl = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
    for await (const rawLine of rl) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (idx === null) {
        const header = parseCsvLine(line.replace(/^﻿/, '')).map((h) => h.trim());
        idx = columns.map((c) => {
          const i = header.indexOf(c);
          if (i < 0 && !optional.includes(c)) {
            throw new Error(`GTFS ${member}: missing column "${c}"`);
          }
          return i;
        });
        continue;
      }
      if (line === '') continue;
      const v = parseCsvLine(line);
      onRow(idx.map((i) => (i < 0 ? '' : (v[i] ?? '').trim())));
    }
  } finally {
    if (child.exitCode === null) child.kill();
  }
  const code = await exit;
  if (code !== 0) {
    throw new Error(`unzip -p ${member} exited with ${code}: ${stderr.trim().slice(0, 300)}`);
  }
  if (idx === null) throw new Error(`GTFS ${member}: empty file`);
}

/** A line is a route long name (case- and space-insensitive), whatever its direction. */
export function lineKey(shortName: string, longName: string, routeId: string): string {
  const base = longName || shortName || routeId;
  return base.replace(/\s+/g, ' ').trim().toLocaleLowerCase('gl');
}

const DATE_KEY = /actualizacion|modificacion|lastupdate|updated|modified/;

/**
 * Last-update time from the NAP metadata, if it can be read without guessing.
 * The JSON shape of /api/Fichero/{id} is not verified: look for a key that names an
 * update or modification date (any depth up to 3) and accept only unambiguous values.
 */
export function napUpdatedAt(meta: unknown, now: Date): string | null {
  const queue: Array<{ v: unknown; depth: number }> = [{ v: meta, depth: 0 }];
  while (queue.length) {
    const { v, depth } = queue.shift() as { v: unknown; depth: number };
    if (!v || typeof v !== 'object' || depth > 3) continue;
    const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v);
    for (const [k, x] of entries) {
      const name = k.toLowerCase().replace(/[^a-z]/g, '');
      if (typeof x === 'string' && DATE_KEY.test(name)) {
        const iso = parseNapDate(x);
        if (iso && Date.parse(iso) <= now.getTime() + 86_400_000) return iso;
      }
      if (x && typeof x === 'object') queue.push({ v: x, depth: depth + 1 });
    }
  }
  return null;
}

/** ISO 8601 (with zone, or local Madrid time without it) or d/m/y; ambiguous d/m vs m/d → null. */
export function parseNapDate(s: string): string | null {
  const t = s.trim();
  try {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(t)) {
      const ms = Date.parse(t);
      return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
    const iso = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/.exec(t);
    if (iso) return madridToIso(`${iso[1]} ${iso[2]}`);
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
    if (dmy) {
      const [, a, b, y, h = '00', mi = '00', sec = '00'] = dmy;
      const p = Number(a);
      const q = Number(b);
      let day: number;
      let month: number;
      if (p > 12 && q <= 12) [day, month] = [p, q];
      else if (q > 12 && p <= 12) [day, month] = [q, p];
      else return null; // 05/06/2026 could be either
      const pad = (n: number) => String(n).padStart(2, '0');
      return madridToIso(`${y}-${pad(month)}-${pad(day)} ${h}:${mi}:${sec}`);
    }
  } catch {
    return null;
  }
  return null;
}

/** Build features from stops and the lines that serve them (exported for tests). */
export function stopFeatures(
  stops: Array<{ id: string; name: string; lat: number; lon: number }>,
  served: Map<string, Set<number>>,
  lineNames: string[],
): Feature[] {
  const features: Feature[] = [];
  for (const s of stops) {
    const lines = served.get(s.id);
    if (!lines || lines.size === 0) continue;
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    if (!inGalicia(s.lon, s.lat, PAD)) continue;
    const names = [...lines]
      .map((i) => lineNames[i] as string)
      .sort((a, b) => a.localeCompare(b, 'gl'))
      .slice(0, MAX_NAMES);
    features.push({
      type: 'Feature',
      id: s.id,
      geometry: point(s.lon, s.lat),
      properties: {
        stop_id: s.id,
        nome: s.name,
        linas: lines.size,
        linas_nomes: names.join(' · '),
      },
    });
  }
  return features;
}

function keyOf(ctx: AdapterContext): string | undefined {
  return ctx.env[KEY_ENV]?.trim() || undefined;
}

const adapter = {
  async fetch(ctx) {
    const key = keyOf(ctx);
    if (!key) throw new Error(`${KEY_ENV} is not set: the NAP download needs a key`);
    const headers = { ApiKey: key };
    let body: Buffer;
    try {
      body = (await ctx.get(DOWNLOAD_URL, { headers, timeoutMs: DOWNLOAD_TIMEOUT_MS })).body;
    } catch (err) {
      throw new Error(redact(err instanceof Error ? err.message : String(err), key));
    }
    // ZIP local file header "PK\x03\x04".
    if (body.length < 4 || body.readUInt32LE(0) !== 0x04034b50) {
      const head = body.subarray(0, 100).toString('utf8').replace(/\s+/g, ' ');
      throw new Error(redact(`NAP download is not a ZIP (${body.length} bytes): ${head}`, key));
    }
    const dir = await mkdtemp(join(tmpdir(), 'buses-xunta-'));
    const zipPath = join(dir, 'gtfs.zip');
    try {
      await writeFile(zipPath, body);
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw err;
    }

    // Optional: publication time from the dataset metadata. Any failure → no time.
    let meta: unknown = null;
    try {
      const res = await ctx.get(META_URL, { headers, timeoutMs: 60_000, retries: 1 });
      meta = JSON.parse(res.body.toString('utf8'));
    } catch {
      meta = null;
    }
    return { dir, zipPath, meta };
  },

  async normalize(raw, ctx) {
    const key = keyOf(ctx);
    try {
      const { zipPath } = raw;
      // routes.txt → line index per route_id.
      const lineIndex = new Map<string, number>();
      const lineNames: string[] = [];
      const routeLine = new Map<string, number>();
      await forEachRow(
        zipPath,
        'routes.txt',
        ['route_id', 'route_short_name', 'route_long_name'],
        ([id = '', short = '', long = '']) => {
          const k = lineKey(short, long, id);
          let i = lineIndex.get(k);
          if (i === undefined) {
            i = lineNames.length;
            lineIndex.set(k, i);
            lineNames.push((long || short || id).replace(/\s+/g, ' ').trim());
          }
          routeLine.set(id, i);
        },
        ['route_short_name', 'route_long_name'],
      );
      if (routeLine.size === 0) throw new Error('GTFS routes.txt: no routes');

      // trips.txt → line index per trip_id.
      const tripLine = new Map<string, number>();
      await forEachRow(zipPath, 'trips.txt', ['trip_id', 'route_id'], ([trip = '', route = '']) => {
        const i = routeLine.get(route);
        if (i !== undefined) tripLine.set(trip, i);
      });

      // stop_times.txt (streamed) → set of line indexes per stop_id.
      const served = new Map<string, Set<number>>();
      await forEachRow(
        zipPath,
        'stop_times.txt',
        ['trip_id', 'stop_id'],
        ([trip = '', stop = '']) => {
          const i = tripLine.get(trip);
          if (i === undefined) return;
          let set = served.get(stop);
          if (!set) {
            set = new Set();
            served.set(stop, set);
          }
          set.add(i);
        },
      );

      const stops: Array<{ id: string; name: string; lat: number; lon: number }> = [];
      await forEachRow(
        zipPath,
        'stops.txt',
        ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'],
        ([id = '', name = '', lat = '', lon = '']) => {
          stops.push({ id, name, lat: Number.parseFloat(lat), lon: Number.parseFloat(lon) });
        },
      );

      return {
        collection: {
          type: 'FeatureCollection',
          features: stopFeatures(stops, served, lineNames),
        },
        // The GTFS has no publication time (calendar start_date is a validity date, not one).
        publishedAt: napUpdatedAt(raw.meta, ctx.now),
      };
    } catch (err) {
      throw new Error(redact(err instanceof Error ? err.message : String(err), key));
    } finally {
      await rm(raw.dir, { recursive: true, force: true });
    }
  },
} satisfies Adapter<Raw>;

export default adapter;
