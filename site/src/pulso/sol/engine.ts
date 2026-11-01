// /pulso/sol/ model: where the sun is over Galicia at any instant of a chosen day. Solar
// position from the NOAA solar calculator equations (Meeus, «Astronomical Algorithms»):
// accurate to about a minute for sunrise and sunset at these latitudes, which is all the map
// needs. No data source: everything is computed in the browser.

const RAD = Math.PI / 180;
/** Sun's centre at the horizon with standard refraction and the sun's radius. */
export const HORIZON = -0.833;
export const TWILIGHTS = [-6, -12, -18] as const;

export interface Sun {
  /** Declination, radians. */
  decl: number;
  /** Equation of time, minutes. */
  eot: number;
  /** Minutes since 00:00 UTC of the instant. */
  utcMinutes: number;
}

/** The sun for an instant (ms since the epoch); the same for every place. */
export function sunAt(ms: number): Sun {
  const jd = ms / 86_400_000 + 2_440_587.5;
  const t = (jd - 2_451_545) / 36_525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const eot =
    (4 / RAD) *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  const utcMinutes = (((ms % 86_400_000) + 86_400_000) % 86_400_000) / 60_000;
  return { decl, eot, utcMinutes };
}

/** Elevation of the sun's centre above the horizon, degrees, without refraction. */
export function elevation(sun: Sun, lon: number, lat: number): number {
  const tst = sun.utcMinutes + sun.eot + 4 * lon;
  const ha = (tst / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZ =
    Math.sin(phi) * Math.sin(sun.decl) + Math.cos(phi) * Math.cos(sun.decl) * Math.cos(ha);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
}

/** Offset of Europe/Madrid from UTC at an instant, minutes (60 or 120). */
export function madridOffset(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((local - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/** 00:00 in Galicia of a date (aaaa-mm-dd) as ms since the epoch, and the day's length. */
export function localDay(date: string): { start: number; end: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const noon = Date.UTC(y, m - 1, d, 12);
  const start = Date.UTC(y, m - 1, d) - madridOffset(noon - 12 * 3_600_000) * 60_000;
  const next = Date.UTC(y, m - 1, d + 1);
  const end = next - madridOffset(noon + 12 * 3_600_000) * 60_000;
  return { start, end };
}

/**
 * Instants (ms) when the sun crosses `level` going up and coming down at a place during
 * [start, end); null when it does not cross that day.
 */
export function crossings(
  lon: number,
  lat: number,
  start: number,
  end: number,
  level = HORIZON,
): { rise: number | null; set: number | null } {
  const step = 10 * 60_000;
  const f = (t: number) => elevation(sunAt(t), lon, lat) - level;
  let rise: number | null = null;
  let set: number | null = null;
  let t0 = start;
  let v0 = f(t0);
  for (let t1 = start + step; t1 <= end; t1 += step) {
    const v1 = f(t1);
    if (v0 < 0 !== v1 < 0) {
      let a = t0;
      let b = t1;
      for (let k = 0; k < 20; k++) {
        const mid = (a + b) / 2;
        if (f(mid) < 0 === v0 < 0) a = mid;
        else b = mid;
      }
      if (v0 < 0) rise ??= (a + b) / 2;
      else set ??= (a + b) / 2;
    }
    t0 = t1;
    v0 = v1;
  }
  return { rise, set };
}

/** Night shade over the map for a sun elevation: 0 by day, darker through each twilight. */
export function shade(elev: number): number {
  if (elev >= HORIZON) return 0;
  if (elev >= -6) return 0.22;
  if (elev >= -12) return 0.38;
  if (elev >= -18) return 0.5;
  return 0.62;
}
