// Timed trajectories from a static GTFS: every trip that runs on a working day and on a
// Sunday, as the sequence of its stops with the time at each one. Shared by pulso-tren
// (Renfe) and pulso-bus (Xunta). The client animates them; nothing here is real-time.
//
// Geometry is the straight line between consecutive stops (no shapes.txt): close to the road
// for buses, whose stops are near each other, and a simplification for trains.
// Times are seconds after midnight of the service day, as in GTFS (they can pass 24:00).
// A stop with dwell time appears twice (arrival, then departure) so the vehicle waits there.
// Only the parts of a trip inside the Galician bbox are kept; a trip that leaves and comes
// back is split into one feature per stretch.

import type { Feature } from '../../lib/adapter.ts';
import { inGalicia, round } from '../../lib/adapter.ts';
import { forEachRow } from '../buses-xunta/adapter.ts';
import { listMembers, referenceDay } from '../estacions-tren/adapter.ts';

export type DayKind = 'laborable' | 'domingo';
export const DAY_KINDS: DayKind[] = ['laborable', 'domingo'];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Reference days as YYYYMMDD: the first Wednesday on or after the run date (as in
 * estacions-tren) and the Sunday after it.
 */
export function referenceDays(now: Date): Record<DayKind, string> {
  const wed = referenceDay(now);
  const d = new Date(`${wed.slice(0, 4)}-${wed.slice(4, 6)}-${wed.slice(6)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4);
  return { laborable: wed, domingo: d.toISOString().slice(0, 10).replaceAll('-', '') };
}

/** "25:07:30" → 90450; '' or malformed → null. */
export function gtfsSeconds(t: string): number | null {
  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export interface ReadOptions {
  days: Record<DayKind, string>;
  /** Bbox padding in degrees around Galicia. */
  pad: number;
  /** Line name shown for a route. */
  lineName(short: string, long: string, id: string): string;
  /** Feed label for error messages. */
  label: string;
}

export interface Trip {
  line: string;
  day: DayKind;
  coords: Array<[number, number]>;
  t: number[];
}

interface StopTime {
  seq: number;
  stop: string;
  arr: number;
  dep: number;
}

/** Trips of one GTFS ZIP that run on the reference days, clipped to Galicia. */
export async function readTrips(zipPath: string, opts: ReadOptions): Promise<Trip[]> {
  const members = new Set(await listMembers(zipPath));
  for (const m of ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']) {
    if (!members.has(m)) throw new Error(`${opts.label}: GTFS without ${m}`);
  }
  if (!members.has('calendar.txt') && !members.has('calendar_dates.txt')) {
    throw new Error(`${opts.label}: GTFS without calendar`);
  }

  const stops = new Map<string, [number, number]>();
  await forEachRow(
    zipPath,
    'stops.txt',
    ['stop_id', 'stop_lat', 'stop_lon'],
    ([id = '', lat = '', lon = '']) => {
      const la = Number.parseFloat(lat);
      const lo = Number.parseFloat(lon);
      if (Number.isFinite(la) && Number.isFinite(lo)) stops.set(id, [lo, la]);
    },
  );

  // Services active on each reference day.
  const active: Record<DayKind, Set<string>> = { laborable: new Set(), domingo: new Set() };
  if (members.has('calendar.txt')) {
    for (const kind of DAY_KINDS) {
      const day = opts.days[kind];
      const weekday = WEEKDAYS[
        new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T12:00:00Z`).getUTCDay()
      ] as string;
      await forEachRow(
        zipPath,
        'calendar.txt',
        ['service_id', weekday, 'start_date', 'end_date'],
        ([id = '', on = '', start = '', end = '']) => {
          if (on === '1' && start <= day && day <= end) active[kind].add(id);
        },
      );
    }
  }
  if (members.has('calendar_dates.txt')) {
    await forEachRow(
      zipPath,
      'calendar_dates.txt',
      ['service_id', 'date', 'exception_type'],
      ([id = '', date = '', type = '']) => {
        for (const kind of DAY_KINDS) {
          if (date !== opts.days[kind]) continue;
          if (type === '1') active[kind].add(id);
          else if (type === '2') active[kind].delete(id);
        }
      },
    );
  }

  const routeName = new Map<string, string>();
  await forEachRow(
    zipPath,
    'routes.txt',
    ['route_id', 'route_short_name', 'route_long_name'],
    ([id = '', short = '', long = '']) => routeName.set(id, opts.lineName(short, long, id)),
    ['route_short_name', 'route_long_name'],
  );

  // Trips running on at least one reference day.
  const tripInfo = new Map<string, { line: string; days: DayKind[] }>();
  await forEachRow(
    zipPath,
    'trips.txt',
    ['trip_id', 'route_id', 'service_id'],
    ([trip = '', route = '', service = '']) => {
      const days = DAY_KINDS.filter((k) => active[k].has(service));
      if (days.length) tripInfo.set(trip, { line: routeName.get(route) ?? route, days });
    },
  );

  // stop_times.txt is streamed; only rows of running trips are kept.
  const times = new Map<string, StopTime[]>();
  await forEachRow(
    zipPath,
    'stop_times.txt',
    ['trip_id', 'stop_id', 'stop_sequence', 'arrival_time', 'departure_time'],
    ([trip = '', stop = '', seq = '', arr = '', dep = '']) => {
      if (!tripInfo.has(trip)) return;
      const a = gtfsSeconds(arr);
      const d = gtfsSeconds(dep);
      // GTFS allows untimed intermediate stops; they are skipped (no time to place them).
      if (a === null && d === null) return;
      let list = times.get(trip);
      if (!list) {
        list = [];
        times.set(trip, list);
      }
      list.push({ seq: Number(seq), stop, arr: a ?? (d as number), dep: d ?? (a as number) });
    },
  );

  const out: Trip[] = [];
  for (const [trip, list] of times) {
    const info = tripInfo.get(trip);
    if (!info) continue;
    list.sort((a, b) => a.seq - b.seq);
    for (const stretch of clip(list, stops, opts.pad)) {
      for (const day of info.days) out.push({ line: info.line, day, ...stretch });
    }
  }
  return out;
}

/** Contiguous stretches inside Galicia, with dwell points doubled; at least two points each. */
export function clip(
  list: StopTime[],
  stops: Map<string, [number, number]>,
  pad: number,
): Array<{ coords: Array<[number, number]>; t: number[] }> {
  const out: Array<{ coords: Array<[number, number]>; t: number[] }> = [];
  let cur: { coords: Array<[number, number]>; t: number[] } | null = null;
  const flush = () => {
    if (cur && cur.coords.length >= 2 && (cur.t.at(-1) ?? 0) > (cur.t[0] ?? 0)) out.push(cur);
    cur = null;
  };
  for (const st of list) {
    const ll = stops.get(st.stop);
    if (!ll || !inGalicia(ll[0], ll[1], pad)) {
      flush();
      continue;
    }
    if (!cur) cur = { coords: [], t: [] };
    const c: [number, number] = [round(ll[0], 4), round(ll[1], 4)];
    const c2 = cur as { coords: Array<[number, number]>; t: number[] };
    c2.coords.push(c);
    c2.t.push(st.arr);
    if (st.dep > st.arr) {
      c2.coords.push(c);
      c2.t.push(st.dep);
    }
  }
  flush();
  return out;
}

/** Trips as LineString features (properties: modo, lina, dia, t). */
export function tripFeatures(
  trips: Trip[],
  modo: 'tren' | 'bus',
  days: Record<DayKind, string>,
): Feature[] {
  const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  return trips
    .sort((a, b) => a.day.localeCompare(b.day) || (a.t[0] ?? 0) - (b.t[0] ?? 0))
    .map((tr) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: tr.coords },
      properties: {
        modo,
        lina: tr.line,
        dia: tr.day,
        data: iso(days[tr.day]),
        t: tr.t,
      },
    }));
}
