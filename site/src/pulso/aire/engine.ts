// /pulso/aire/ model: ICA bands (MeteoGalicia IT/052: 0–1 boa … 5–6 pésima) and their colours.

export const BANDS = [
  { key: 'boa', colour: '#50f0e6' },
  { key: 'favorable', colour: '#50ccaa' },
  { key: 'regular', colour: '#f0e641' },
  { key: 'mala', colour: '#ff5050' },
  { key: 'moi_mala', colour: '#960032' },
  { key: 'pesima', colour: '#7d2181' },
] as const;

/** Band index (0–5) of an ICA value; values of 6 or more fall in the last band. */
export function band(ica: number): number {
  return Math.max(0, Math.min(BANDS.length - 1, Math.floor(ica)));
}

/** Stations per band in each hour (nulls are not counted). */
export function bandCounts(series: Array<Array<number | null>>, hours = 24): number[][] {
  const out = Array.from({ length: hours }, () => Array(BANDS.length).fill(0) as number[]);
  for (const s of series)
    for (let h = 0; h < hours; h++) {
      const v = s[h];
      if (v === null || v === undefined) continue;
      const row = out[h] as number[];
      const b = band(v);
      row[b] = (row[b] ?? 0) + 1;
    }
  return out;
}
