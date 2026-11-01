// /pulso/movemento/ model: trips between zones as particles along a gently curved path.
//
// Each particle stands for UNIT trips. A pair with fewer trips in an hour still gets a particle
// with the matching probability (deterministic, so the expected count is right and scrubbing
// gives the same picture). Travel time grows with distance at a schematic SPEED_KMH: these are
// not real journeys, only when and between where people travel.

import { rand } from '../cidades/engine.ts';

export type DayKind = 'mercores' | 'domingo';
export const DAY = 24 * 3600;
export const UNIT = 100;
export const SPEED_KMH = 40;
const MIN_TRAVEL = 6 * 60;

export interface Flow {
  from: [number, number];
  to: [number, number];
  km: number;
  hours: Record<DayKind, number[]>;
}

/** Seconds a particle takes over a flow of `km` kilometres. */
export function travelSeconds(km: number): number {
  return Math.max(MIN_TRAVEL, (km / SPEED_KMH) * 3600);
}

/** Particles started in one hour: whole units plus one more with the remainder's probability. */
export function particlesInHour(trips: number, seed: number, hour: number): number {
  const whole = Math.floor(trips / UNIT);
  return whole + (rand(seed, hour, 999_983) < trips / UNIT - whole ? 1 : 0);
}

/** Progress (0–1) of each particle of a flow in flight at second `s`. */
export function progressAt(hours: number[], km: number, s: number, seed: number): number[] {
  const travel = travelSeconds(km);
  const out: number[] = [];
  const first = Math.max(0, Math.floor((s - travel) / 3600));
  const last = Math.min(23, Math.floor(s / 3600));
  for (let hour = first; hour <= last; hour++) {
    const n = particlesInHour(hours[hour] ?? 0, seed, hour);
    for (let i = 0; i < n; i++) {
      const start = hour * 3600 + ((i + rand(seed, hour, i)) / n) * 3600;
      const p = (s - start) / travel;
      if (p >= 0 && p <= 1) out.push(p);
    }
  }
  return out;
}

/**
 * Point at `t` (0–1) on a quadratic curve from a to b that bows to the right of the direction
 * of travel, so the two directions of a pair run on separate lanes.
 */
export function along(
  a: [number, number],
  b: [number, number],
  t: number,
  bow = 0.12,
): [number, number] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // Right-hand normal in screen space (y grows downwards).
  const cx = mx - dy * bow;
  const cy = my + dx * bow;
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * cx + t * t * b[0],
    u * u * a[1] + 2 * u * t * cy + t * t * b[1],
  ];
}

/** Trips per hour of a day over all flows. */
export function hourlyTotals(flows: Flow[], day: DayKind): number[] {
  const out: number[] = Array(24).fill(0);
  for (const f of flows)
    for (let h = 0; h < 24; h++) out[h] = (out[h] ?? 0) + (f.hours[day][h] ?? 0);
  return out;
}
