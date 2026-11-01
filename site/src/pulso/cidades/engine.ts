// /cidades/ model: from the hourly trips of a ring (mobilidade-cidades), the running presence
// at any second of the day and the particles that stand for trips arriving or leaving.
//
// Particles are stateless: each one is a deterministic function of (city, hour, index), so
// scrubbing the clock backwards or jumping gives the same picture as playing.

export type DayKind = 'mercores' | 'domingo';
export type Ring = 'anel0' | 'anel1';

export interface Hourly {
  entradas: number[];
  saidas: number[];
  internas: number[];
}

export interface RingData {
  concellos: string[];
  residentes: number;
  mercores: Hourly;
  domingo: Hourly;
}

export const DAY = 24 * 3600;
/** One particle per this share of the ring's residents (0.1 %): the same density means the
 * same share in every city, whatever its size. */
export const PARTICLE_SHARE = 0.001;
/** Seconds of the clock a particle takes to travel. */
export const TRAVEL = 50 * 60;

/** Trips in minus trips out since 00:00, at second `s`, spreading each hour evenly. */
export function presenceAt(h: Hourly, s: number): number {
  const t = Math.min(Math.max(s, 0), DAY) / 3600;
  const whole = Math.floor(t);
  let p = 0;
  for (let i = 0; i < whole && i < 24; i++) p += (h.entradas[i] ?? 0) - (h.saidas[i] ?? 0);
  if (whole < 24) p += (t - whole) * ((h.entradas[whole] ?? 0) - (h.saidas[whole] ?? 0));
  return p;
}

/** Presence curve in % of residents, one value every `step` seconds from 00:00 to 24:00. */
export function presenceCurve(h: Hourly, residentes: number, step = 600): number[] {
  const out: number[] = [];
  for (let s = 0; s <= DAY; s += step) out.push((100 * presenceAt(h, s)) / residentes);
  return out;
}

/** Small integer hash → [0, 1). */
export function rand(a: number, b: number, c: number): number {
  let x = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export interface Particle {
  /** Direction from the city, radians. */
  angle: number;
  /** 0 at the outer edge, 1 at the city (arrivals); the reverse for departures. */
  progress: number;
  inbound: boolean;
}

/** Particles in flight at second `s` for one city (seed) and ring data. */
export function particlesAt(h: Hourly, residentes: number, s: number, seed: number): Particle[] {
  const unit = residentes * PARTICLE_SHARE;
  const out: Particle[] = [];
  const first = Math.max(0, Math.floor((s - TRAVEL) / 3600));
  const last = Math.min(23, Math.floor(s / 3600));
  for (let hour = first; hour <= last; hour++) {
    for (const inbound of [true, false]) {
      const trips = (inbound ? h.entradas : h.saidas)[hour] ?? 0;
      const n = Math.round(trips / unit);
      for (let i = 0; i < n; i++) {
        const k = inbound ? i : i + 100_000;
        const start = hour * 3600 + ((i + rand(seed, hour, k)) / n) * 3600;
        const p = (s - start) / TRAVEL;
        if (p < 0 || p > 1) continue;
        out.push({ angle: rand(seed + 7, hour, k) * Math.PI * 2, progress: p, inbound });
      }
    }
  }
  return out;
}
