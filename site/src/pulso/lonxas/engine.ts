// /pulso/lonxas/ model: a year-long clock over the first sale in each lonxa. Time is in days
// since 1 January 2025; a day's figures hold for the whole day (no blending between days).

export const YEAR = 2025;
export const DAYS = 365;
export const GROUPS = ['peixes', 'bivalvos', 'cefalopodos', 'crustaceos', 'outros'] as const;
export type Group = (typeof GROUPS)[number];
export const COLOURS: Record<Group, string> = {
  peixes: '#5fd3f3',
  bivalvos: '#f2d16b',
  cefalopodos: '#c79bff',
  crustaceos: '#ff7a5c',
  outros: '#9a9a90',
};

export interface Lonxa {
  id: string;
  name: string;
  zone: string;
  lonlat: [number, number] | null;
  eur: Record<Group, number[]>;
  kg: number[];
  total: number;
  tonnes: number;
  days: number;
  species: Array<{ especie: string; importe: number }>;
}

/** Calendar of a day index: month (0–11), day of month and weekday (0 = Sunday). */
export function dateOf(i: number): { month: number; day: number; weekday: number } {
  const d = new Date(Date.UTC(YEAR, 0, 1 + i));
  return { month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay() };
}

/** Day index of month (1–12) and day, or -1. */
export function indexOf(month: number, day: number): number {
  const t = Date.UTC(YEAR, month - 1, day);
  const d = new Date(t);
  if (d.getUTCFullYear() !== YEAR || d.getUTCMonth() !== month - 1) return -1;
  return Math.round((t - Date.UTC(YEAR, 0, 1)) / 86_400_000);
}

/** Euros of one day in the chosen groups, one value per group in GROUPS order (0 if off). */
export function slices(l: Lonxa, i: number, on: ReadonlySet<Group>): number[] {
  return GROUPS.map((g) => (on.has(g) ? (l.eur[g][i] ?? 0) : 0));
}

export const sum = (a: readonly number[]) => a.reduce((s, v) => s + v, 0);

/** Galicia per day and group: rows of GROUPS-length arrays. */
export function perDay(ls: Lonxa[], on: ReadonlySet<Group>): number[][] {
  return Array.from({ length: DAYS }, (_, i) => {
    const out = GROUPS.map(() => 0);
    for (const l of ls) {
      const s = slices(l, i, on);
      for (let k = 0; k < s.length; k++) out[k] = (out[k] as number) + (s[k] as number);
    }
    return out;
  });
}

/** Circle radius in px for a day's euros: area proportional to value. */
export const radius = (eur: number, k: number) => (eur > 0 ? Math.sqrt(eur) * k : 0);

/**
 * Swell of a lonxa on the day it sells: the circle opens a little larger at the start of the
 * day and settles, so each new day reads as a beat. `frac` is the fraction of the day passed.
 */
export const beat = (frac: number) => 1 + 0.18 * Math.exp(-6 * frac);
