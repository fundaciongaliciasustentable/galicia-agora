// /pulso/tempo/ model: hourly station readings read at any second of the day, a colour scale
// for temperature and the wind particles of a station.

import { rand } from '../cidades/engine.ts';

export const DAY = 24 * 3600;

/** Value at second `s`, linear between hourly readings (index h at h:00); null if missing. */
export function valueAt(hours: Array<number | null>, s: number): number | null {
  const t = Math.min(Math.max(s, 0), DAY - 1) / 3600;
  const h = Math.floor(t);
  const a = hours[h] ?? null;
  const b = hours[Math.min(23, h + 1)] ?? null;
  if (a === null) return b === null ? null : t - h > 0.5 ? b : null;
  if (b === null) return a;
  return a + (b - a) * (t - h);
}

/** Wind direction (degrees the wind comes FROM) at second `s`, through the shortest turn. */
export function directionAt(hours: Array<number | null>, s: number): number | null {
  const t = Math.min(Math.max(s, 0), DAY - 1) / 3600;
  const h = Math.floor(t);
  const a = hours[h] ?? null;
  const b = hours[Math.min(23, h + 1)] ?? null;
  if (a === null || b === null) return a ?? b;
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * (t - h) + 360) % 360;
}

/** Diverging temperature scale, 4 °C (deep blue) to 32 °C (deep red), as an rgb() string. */
const STOPS: Array<[number, [number, number, number]]> = [
  [4, [49, 54, 149]],
  [10, [69, 117, 180]],
  [14, [116, 173, 209]],
  [17, [224, 243, 248]],
  [20, [254, 224, 144]],
  [24, [253, 174, 97]],
  [28, [244, 109, 67]],
  [32, [165, 0, 38]],
];
export const T_MIN = 4;
export const T_MAX = 32;

export function tempColour(t: number, alpha = 1): string {
  const v = Math.min(T_MAX, Math.max(T_MIN, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i] as [number, [number, number, number]];
    const [t0, c0] = STOPS[i - 1] as [number, [number, number, number]];
    if (v <= t1) {
      const f = (v - t0) / (t1 - t0);
      const c = c0.map((x, k) => Math.round(x + ((c1[k] as number) - x) * f));
      return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
    }
  }
  return `rgba(165, 0, 38, ${alpha})`;
}

/**
 * Wind particles of a station at second `s`: offsets in units of the station's reach (0–1
 * along the wind), going where the wind blows TO. Faster wind sends particles further and
 * more often.
 */
export function windParticles(
  speed: number,
  fromDeg: number,
  s: number,
  seed: number,
): Array<{ dx: number; dy: number; life: number }> {
  if (speed <= 0.2) return [];
  const n = Math.min(10, Math.round(2 + speed * 1.2));
  const to = ((fromDeg + 180) * Math.PI) / 180;
  // Screen axes: x east, y south.
  const ux = Math.sin(to);
  const uy = -Math.cos(to);
  const period = 1800; // seconds of clock per trip of a particle
  const reach = Math.min(1, 0.25 + speed / 10);
  const out: Array<{ dx: number; dy: number; life: number }> = [];
  for (let i = 0; i < n; i++) {
    const life = (s / period + rand(seed, i, 11)) % 1;
    const side = (rand(seed, i, 23) - 0.5) * 0.5;
    const along = life * reach;
    out.push({ dx: ux * along - uy * side * 0.3, dy: uy * along + ux * side * 0.3, life });
  }
  return out;
}
