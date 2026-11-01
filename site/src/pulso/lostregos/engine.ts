// /pulso/lostregos/ model: a year of lightning, day by day. Each strike flashes at its second of
// the day and fades within the hour to a faint mark that stays for the rest of the year.

export interface StormDay {
  /** aaaa-mm-dd, local. */
  day: string;
  /** Strikes in time order: seconds since local midnight, lon, lat, kA. */
  t: number[];
  lon: number[];
  lat: number[];
  ka: Array<number | null>;
}

/** Every date from `from` to `to` inclusive (aaaa-mm-dd). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Strikes per date (0 for dates without any). */
export function perDay(dates: string[], storms: StormDay[]): number[] {
  const n = new Map(storms.map((s) => [s.day, s.t.length]));
  return dates.map((d) => n.get(d) ?? 0);
}

/** Index of the first strike later than `second` in a day's sorted times. */
export function upTo(times: number[], second: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] as number) <= second) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Look of a strike `age` seconds after it: a white flash for the first minutes that cools to
 * blue and settles, after an hour, at a faint mark.
 */
export function flash(age: number): { glow: number; alpha: number } {
  if (age < 0) return { glow: 0, alpha: 0 };
  const m = age / 60;
  if (m < 8) return { glow: 1 - m / 8, alpha: 1 };
  if (m < 60) return { glow: 0, alpha: 1 - (0.75 * (m - 8)) / 52 };
  return { glow: 0, alpha: 0.25 };
}

/** The busiest hour of a day: [hour, strikes]. */
export function busiestHour(times: number[]): [number, number] {
  const h = Array(25).fill(0) as number[];
  for (const t of times) {
    const k = Math.min(24, Math.floor(t / 3600));
    h[k] = (h[k] ?? 0) + 1;
  }
  const max = Math.max(...h);
  return [h.indexOf(max), max];
}
