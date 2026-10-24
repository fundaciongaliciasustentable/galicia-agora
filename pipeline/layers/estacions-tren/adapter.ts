// Railway stations in Galicia from Renfe's static GTFS: AV/LD/MD (google_transit.zip, ~1 MB)
// and Cercanías + ancho métrico (fomento_transit.zip, ~15 MB, carries the Ferrol–Ortigueira–
// Ribadeo line). Each ZIP is written to a temporary file and its members streamed through the
// system `unzip -p` (stop_times.txt of the Cercanías feed is ~270 MB uncompressed).
//
// Output: one point per station (parent station when the feed has them, else the stop) inside
// the Galician bbox (pad 0.05°). Renfe's station list (estaciones.csv, optional) gives the
// province, used to drop the Asturian ancho-métrico stations that fall inside the bbox.
//
// servizos_dia = number of distinct trips that call at the station on the reference day: the
// first Wednesday on or after the run date (Europe/Madrid), using calendar.txt and
// calendar_dates.txt. A holiday falling on that Wednesday lowers the count; it is a weekday
// snapshot, not an average. Some trains are in both feeds (the Ferrol–Ortigueira regionals are
// REGIONAL in AV/LD/MD and C1 in Cercanías, with the same times): at a station, a Cercanías trip
// whose departure time equals that of an AV/LD/MD trip is counted once.

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  type Adapter,
  type AdapterContext,
  type Feature,
  inGalicia,
  point,
} from '../../lib/adapter.ts';
import { forEachRow } from '../buses-xunta/adapter.ts';

export const FEEDS = {
  ld: 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip',
  cercanias: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
} as const;
export const STATIONS_URL = 'https://ssl.renfe.com/ftransit/Fichero_estaciones/estaciones.csv';

export type FeedKey = keyof typeof FEEDS;
export const REDE: Record<FeedKey, string> = { ld: 'AV/LD/MD', cercanias: 'Cercanías' };

export const PAD = 0.05;
export const MAX_LINES = 10;
const DOWNLOAD_TIMEOUT_MS = 300_000;
const GALICIAN_PROVINCES = /CORUÑA|LUGO|OURENSE|ORENSE|PONTEVEDRA/;

const execFileP = promisify(execFile);

export interface Raw {
  /** Temporary directory holding the ZIPs; removed by normalize. */
  dir: string;
  zips: Record<FeedKey, string>;
  /** Last-Modified of each ZIP as sent by the server (HTTP date), or null. */
  lastModified: Record<FeedKey, string | null>;
  /** estaciones.csv (latin-1), or null if the optional request failed. */
  stations: Buffer | null;
}

/** Members of a ZIP (unzip -Z1). */
export async function listMembers(zipPath: string): Promise<string[]> {
  const { stdout } = await execFileP('unzip', ['-Z1', zipPath], { maxBuffer: 1 << 20 });
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Map station code → province from Renfe's estaciones.csv (latin-1, `;`, quoted). */
export function parseProvinces(buf: Buffer | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!buf) return out;
  const lines = new TextDecoder('latin1').decode(buf).split(/\r?\n/);
  const split = (l: string) => l.split(';').map((v) => v.replace(/^"|"$/g, '').trim());
  const header = split(lines[0] ?? '');
  const iCode = header.indexOf('CODIGO');
  const iProv = header.indexOf('PROVINCIA');
  if (iCode < 0 || iProv < 0) return out;
  for (const l of lines.slice(1)) {
    if (!l.trim()) continue;
    const v = split(l);
    const code = v[iCode];
    if (code) out.set(code, (v[iProv] ?? '').toUpperCase());
  }
  return out;
}

/** In the bbox, and not in a known non-Galician province. */
export function keepStation(
  id: string,
  lon: number,
  lat: number,
  provinces: Map<string, string>,
): boolean {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !inGalicia(lon, lat, PAD)) return false;
  const prov = provinces.get(id);
  return prov === undefined || prov === '' || GALICIAN_PROVINCES.test(prov);
}

/** First Wednesday on or after the run date in Europe/Madrid, as YYYYMMDD. */
export function referenceDay(now: Date): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** HTTP date → ISO UTC, or null. */
export function httpDateToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

interface Station {
  id: string;
  name: string;
  lon: number;
  lat: number;
  redes: Set<FeedKey>;
  lines: Set<string>;
  /** Trips running on the reference day: trip id → departure time, per feed. */
  trips: Record<FeedKey, Map<string, string>>;
}

/** "8:23:00" → "08:23:00" (GTFS allows one-digit hours). */
export function normTime(t: string): string {
  return t.length === 7 ? `0${t}` : t;
}

/** Trips on the reference day, counting a Cercanías trip at an AV/LD/MD time only once. */
export function countTrips(trips: Station['trips']): number {
  const ldTimes = new Set(trips.ld.values());
  let n = trips.ld.size;
  for (const t of trips.cercanias.values()) if (!ldTimes.has(t)) n++;
  return n;
}

/** Read one feed and add its stations, lines and trips to `acc` (keyed by station id). */
export async function readFeed(
  key: FeedKey,
  zipPath: string,
  day: string,
  provinces: Map<string, string>,
  acc: Map<string, Station>,
): Promise<void> {
  const members = new Set(await listMembers(zipPath));
  for (const m of ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']) {
    if (!members.has(m)) throw new Error(`Renfe ${key}: GTFS without ${m}`);
  }
  if (!members.has('calendar.txt') && !members.has('calendar_dates.txt')) {
    throw new Error(`Renfe ${key}: GTFS without calendar`);
  }

  // stops.txt → stations in Galicia; child stops point to their parent station.
  const stationOf = new Map<string, string>();
  const rows: Array<[string, string, number, number, string, string]> = [];
  await forEachRow(
    zipPath,
    'stops.txt',
    ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'parent_station'],
    ([id = '', name = '', lat = '', lon = '', type = '', parent = '']) => {
      rows.push([id, name, Number.parseFloat(lat), Number.parseFloat(lon), type, parent]);
    },
    ['location_type', 'parent_station'],
  );
  if (rows.length === 0) throw new Error(`Renfe ${key}: stops.txt has no stops`);
  for (const [id, name, lat, lon, type, parent] of rows) {
    if (type !== '' && type !== '0' && type !== '1') continue; // entrances, nodes, areas
    const stationId = type === '1' || parent === '' ? id : parent;
    if (stationId === id) {
      if (!keepStation(id, lon, lat, provinces)) continue;
      const prev = acc.get(id);
      if (prev) prev.redes.add(key);
      else {
        acc.set(id, {
          id,
          name: name.replace(/\s+/g, ' ').trim(),
          lon,
          lat,
          redes: new Set([key]),
          lines: new Set(),
          trips: { ld: new Map(), cercanias: new Map() },
        });
      }
    }
    stationOf.set(id, stationId);
  }

  // Services running on the reference day.
  const active = new Set<string>();
  const weekday = WEEKDAYS[
    new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T12:00:00Z`).getUTCDay()
  ] as string;
  if (members.has('calendar.txt')) {
    await forEachRow(
      zipPath,
      'calendar.txt',
      ['service_id', weekday, 'start_date', 'end_date'],
      ([id = '', on = '', start = '', end = '']) => {
        if (on === '1' && start <= day && day <= end) active.add(id);
      },
    );
  }
  if (members.has('calendar_dates.txt')) {
    await forEachRow(
      zipPath,
      'calendar_dates.txt',
      ['service_id', 'date', 'exception_type'],
      ([id = '', date = '', type = '']) => {
        if (date !== day) return;
        if (type === '1') active.add(id);
        else if (type === '2') active.delete(id);
      },
    );
  }

  // routes.txt → short name; trips.txt → route and whether it runs on the reference day.
  const routeName = new Map<string, string>();
  await forEachRow(
    zipPath,
    'routes.txt',
    ['route_id', 'route_short_name', 'route_long_name'],
    ([id = '', short = '', long = '']) => {
      routeName.set(id, (short || long || id).replace(/\s+/g, ' ').trim());
    },
    ['route_short_name', 'route_long_name'],
  );
  const trips = new Map<string, { line: string; runs: boolean }>();
  await forEachRow(
    zipPath,
    'trips.txt',
    ['trip_id', 'route_id', 'service_id'],
    ([trip = '', route = '', service = '']) => {
      trips.set(trip, { line: routeName.get(route) ?? route, runs: active.has(service) });
    },
  );

  // stop_times.txt (streamed): lines (any day) and trips on the reference day per station.
  await forEachRow(
    zipPath,
    'stop_times.txt',
    ['trip_id', 'stop_id', 'departure_time', 'arrival_time'],
    ([trip = '', stop = '', dep = '', arr = '']) => {
      const sid = stationOf.get(stop);
      if (sid === undefined) return;
      const st = acc.get(sid);
      const t = trips.get(trip);
      if (!st || !t) return;
      st.lines.add(t.line);
      if (t.runs) st.trips[key].set(trip, normTime(dep || arr));
    },
    ['departure_time', 'arrival_time'],
  );
}

/** Stations with at least one line, as features (exported for tests). */
export function stationFeatures(acc: Map<string, Station>, day: string): Feature[] {
  const isoDay = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;
  const features: Feature[] = [];
  for (const s of [...acc.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (s.lines.size === 0) continue;
    const lines = [...s.lines].sort((a, b) => a.localeCompare(b, 'es')).slice(0, MAX_LINES);
    features.push({
      type: 'Feature',
      id: s.id,
      geometry: point(s.lon, s.lat),
      properties: {
        id: s.id,
        nome: s.name,
        servizos_dia: countTrips(s.trips),
        linas: lines.join(' · '),
        rede: (Object.keys(REDE) as FeedKey[])
          .filter((k) => s.redes.has(k))
          .map((k) => REDE[k])
          .join(' · '),
        dia_referencia: isoDay,
      },
    });
  }
  return features;
}

async function download(ctx: AdapterContext, key: FeedKey, dir: string) {
  const res = await ctx.get(FEEDS[key], { timeoutMs: DOWNLOAD_TIMEOUT_MS });
  const body = res.body;
  // ZIP local file header "PK\x03\x04".
  if (body.length < 4 || body.readUInt32LE(0) !== 0x04034b50) {
    const head = body.subarray(0, 100).toString('utf8').replace(/\s+/g, ' ');
    throw new Error(`Renfe ${key}: download is not a ZIP (${body.length} bytes): ${head}`);
  }
  const path = join(dir, `${key}.zip`);
  await writeFile(path, body);
  return { path, lastModified: res.lastModified ?? res.headers?.['last-modified'] ?? null };
}

const adapter = {
  async fetch(ctx) {
    const dir = await mkdtemp(join(tmpdir(), 'estacions-tren-'));
    try {
      const ld = await download(ctx, 'ld', dir);
      const cercanias = await download(ctx, 'cercanias', dir);
      let stations: Buffer | null = null;
      try {
        stations = (await ctx.get(STATIONS_URL, { timeoutMs: 60_000, retries: 1 })).body;
      } catch {
        stations = null; // optional: without it only the bbox filters
      }
      return {
        dir,
        zips: { ld: ld.path, cercanias: cercanias.path },
        lastModified: { ld: ld.lastModified, cercanias: cercanias.lastModified },
        stations,
      };
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw err;
    }
  },

  async normalize(raw, ctx) {
    try {
      const day = referenceDay(ctx.now);
      const provinces = parseProvinces(raw.stations);
      const acc = new Map<string, Station>();
      for (const key of Object.keys(FEEDS) as FeedKey[]) {
        await readFeed(key, raw.zips[key], day, provinces, acc);
      }
      const features = stationFeatures(acc, day);
      if (features.length === 0) throw new Error('Renfe GTFS: no served stations in Galicia');
      const times = (Object.keys(FEEDS) as FeedKey[])
        .map((k) => httpDateToIso(raw.lastModified[k]))
        .filter((t): t is string => t !== null)
        .sort();
      return {
        collection: { type: 'FeatureCollection', features },
        // Newest ZIP Last-Modified: when Renfe last regenerated the timetables.
        publishedAt: times.at(-1) ?? null,
      };
    } finally {
      await rm(raw.dir, { recursive: true, force: true });
    }
  },
} satisfies Adapter<Raw>;

export default adapter;
