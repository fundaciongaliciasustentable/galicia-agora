// /pulso/lume/ model: a month-long clock over satellite detections. Times are seconds since
// 1 August 2025 00:00 in Galicia (CEST, UTC+2). Detections come in passes: every detection of
// one product at one minute.

export const START_UTC = Date.UTC(2025, 6, 31, 22, 0, 0); // 1 Aug 2025 00:00 CEST
export const MONTH = 31 * 24 * 3600;

export interface Detection {
  /** Seconds since the start of the month (local). */
  t: number;
  lonlat: [number, number];
  frp: number;
  product: string;
  concello: string;
}

export const secondsOf = (iso: string) => (Date.parse(iso) - START_UTC) / 1000;

/** Index of the first detection later than `s` in a list sorted by time. */
export function upTo(ds: Detection[], s: number): number {
  let lo = 0;
  let hi = ds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((ds[mid] as Detection).t <= s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface Pass {
  t: number;
  product: string;
  count: number;
}

/** Detections grouped into passes (same product, same minute), in time order. */
export function passes(ds: Detection[]): Pass[] {
  const out: Pass[] = [];
  for (const d of ds) {
    const last = out[out.length - 1];
    if (last && last.product === d.product && Math.abs(last.t - d.t) < 60) last.count++;
    else out.push({ t: d.t, product: d.product, count: 1 });
  }
  return out;
}

/** Detections per local day (31 values). */
export function perDay(ds: Detection[]): number[] {
  const out: number[] = Array(31).fill(0);
  for (const d of ds) {
    const i = Math.floor(d.t / 86400);
    if (i >= 0 && i < 31) out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}

/**
 * Look of a detection `age` seconds after it was seen: a bright flash that cools over three
 * days to a dark ember, which stays as the scar of the month.
 */
export function ember(age: number): { r: number; g: number; b: number; a: number; glow: number } {
  const h = age / 3600;
  if (h < 3) return { r: 255, g: 236, b: 150, a: 1, glow: 1 - h / 3 };
  if (h < 72) {
    const f = (h - 3) / 69;
    return { r: 255 - 55 * f, g: 120 - 75 * f, b: 40 - 20 * f, a: 0.9 - 0.3 * f, glow: 0 };
  }
  return { r: 200, g: 45, b: 20, a: 0.6, glow: 0 };
}
