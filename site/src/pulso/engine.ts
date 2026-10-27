// Pure timetable maths for /pulso/: where each scheduled vehicle is at a given second of the
// service day, and how many are running through the day. No DOM here.

export type Mode = 'tren' | 'bus';
export type DayKind = 'laborable' | 'domingo';

export interface Trip {
  mode: Mode;
  day: DayKind;
  line: string;
  lon: Float64Array;
  lat: Float64Array;
  /** Seconds after midnight of the service day, one per vertex, non-decreasing. */
  t: Int32Array;
}

interface FeatureLike {
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

/** Features of pulso-tren / pulso-bus → trips; malformed ones are skipped. */
export function toTrips(features: FeatureLike[]): Trip[] {
  const out: Trip[] = [];
  for (const f of features) {
    const p = f.properties;
    const coords = f.geometry?.type === 'LineString' ? (f.geometry.coordinates as number[][]) : [];
    const t = Array.isArray(p.t) ? (p.t as number[]) : [];
    if (coords.length < 2 || coords.length !== t.length) continue;
    if ((p.modo !== 'tren' && p.modo !== 'bus') || (p.dia !== 'laborable' && p.dia !== 'domingo')) {
      continue;
    }
    out.push({
      mode: p.modo,
      day: p.dia,
      line: String(p.lina ?? ''),
      lon: Float64Array.from(coords, (c) => c[0] ?? 0),
      lat: Float64Array.from(coords, (c) => c[1] ?? 0),
      t: Int32Array.from(t),
    });
  }
  return out.sort((a, b) => (a.t[0] ?? 0) - (b.t[0] ?? 0));
}

export function start(trip: Trip): number {
  return trip.t[0] ?? 0;
}

export function end(trip: Trip): number {
  return trip.t[trip.t.length - 1] ?? 0;
}

/** Position at second `s`, linearly between stops; null when the trip is not running. */
export function positionAt(trip: Trip, s: number): [number, number] | null {
  const { t } = trip;
  const n = t.length;
  if (n < 2 || s < (t[0] as number) || s > (t[n - 1] as number)) return null;
  // Last vertex with time <= s.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((t[mid] as number) <= s) lo = mid;
    else hi = mid - 1;
  }
  if (lo >= n - 1) return [trip.lon[n - 1] as number, trip.lat[n - 1] as number];
  const t0 = t[lo] as number;
  const t1 = t[lo + 1] as number;
  const f = t1 > t0 ? (s - t0) / (t1 - t0) : 0;
  return [
    (trip.lon[lo] as number) + ((trip.lon[lo + 1] as number) - (trip.lon[lo] as number)) * f,
    (trip.lat[lo] as number) + ((trip.lat[lo + 1] as number) - (trip.lat[lo] as number)) * f,
  ];
}

/**
 * Vehicles running at each step of the day (default every 5 minutes, 00:00 to 28:00 so
 * night services past midnight are counted). Index i covers second i × step.
 */
export function runningCurve(trips: Trip[], step = 300, until = 28 * 3600): Int32Array {
  const n = Math.floor(until / step) + 1;
  const diff = new Int32Array(n + 1);
  for (const tr of trips) {
    const a = Math.ceil(start(tr) / step);
    const b = Math.floor(end(tr) / step);
    if (b < a || a >= n) continue;
    diff[a] = (diff[a] as number) + 1;
    diff[Math.min(n, b + 1)] = (diff[Math.min(n, b + 1)] as number) - 1;
  }
  const out = new Int32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += diff[i] as number;
    out[i] = acc;
  }
  return out;
}

/** "08:05" for 29100 s; hours past 24 wrap (night services). */
export function clock(s: number): string {
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
