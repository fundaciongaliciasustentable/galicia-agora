// Per-concello layers (geometry: none + join): rows are drawn on another
// layer's polygons, matched by key. Indicators are shown relative to Galicia:
// index (Galicia = 100) or difference in points. The scale is diverging and
// centred on Galicia; it describes distance from the average, not good or bad.

export interface Indicator {
  id: string;
  label: { gl: string; es: string };
  unit: string;
  comparison: 'index' | 'points';
  higher_is?: 'more' | 'less' | 'neutral';
  source: string;
  note?: { gl: string; es: string };
}

export type Row = Record<string, unknown>;

export interface LegendItem {
  color: string;
  label: string;
}

export interface Classified {
  /** MapLibre `match` expression over the join key. */
  fillColor: unknown;
  legend: LegendItem[];
}

/** Five classes from "well below Galicia" to "well above Galicia". */
export const DIVERGING = {
  light: ['#8b5e3c', '#cfae8f', '#eeece4', '#8db4c9', '#2e6b8a'],
  dark: ['#c2946e', '#7d5d41', '#45463f', '#41687d', '#6fa8c7'],
};
const NO_DATA = 'rgba(0,0,0,0)';

const WARNING_COLORS = ['rgba(0,0,0,0)', '#f2c94c', '#f2994a', '#c0392b'];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Distance from Galicia: 0 means equal to the Galicia value. Indices are
 * compared as ratios (log2), so "half of Galicia" and "double Galicia" sit at
 * the same distance from the centre; points are plain differences.
 */
export function deviation(row: Row, ind: Indicator): number | null {
  const rel = num(row[`${ind.id}_rel`]);
  if (rel === null) return null;
  if (ind.comparison === 'points') return rel;
  return rel > 0 ? Math.log2(rel / 100) : null;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i] ?? 0;
}

/** Round to a readable step for legend labels. */
function nice(n: number): number {
  const a = Math.abs(n);
  const step = a >= 50 ? 5 : a >= 10 ? 1 : a >= 1 ? 0.5 : a >= 0.2 ? 0.05 : 0.01;
  return Math.round(n / step) * step;
}

export function breaksFor(rows: Row[], ind: Indicator): { near: number; strong: number } {
  const devs = rows
    .map((r) => deviation(r, ind))
    .filter((d): d is number => d !== null)
    .map(Math.abs)
    .sort((a, b) => a - b);
  const t = quantile(devs, 0.9) || 1;
  const minNear = ind.comparison === 'index' ? 0.05 : 0.1;
  return { near: nice(Math.max(t * 0.15, minNear)), strong: nice(Math.max(t * 0.6, minNear * 2)) };
}

export function classIndex(d: number, b: { near: number; strong: number }): number {
  if (d <= -b.strong) return 0;
  if (d < -b.near) return 1;
  if (d <= b.near) return 2;
  if (d < b.strong) return 3;
  return 4;
}

const fmt = (n: number, lang: string) =>
  new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES', { maximumFractionDigits: 1 }).format(n);

export function classifyIndicator(
  rows: Row[],
  ind: Indicator,
  key: string,
  palette: string[],
  lang: 'gl' | 'es',
): Classified {
  const b = breaksFor(rows, ind);
  const pairs: unknown[] = [];
  for (const r of rows) {
    const code = r[key];
    const d = deviation(r, ind);
    if (typeof code !== 'string' || d === null) continue;
    pairs.push(code, palette[classIndex(d, b)]);
  }
  const fillColor = pairs.length ? ['match', ['get', key], ...pairs, NO_DATA] : NO_DATA;

  // Labels in the comparison's own terms: index values (Galicia = 100) or points.
  const gl = lang === 'gl';
  const v =
    ind.comparison === 'index'
      ? (x: number) => fmt(Math.round(100 * 2 ** x), lang)
      : (x: number) => `${x > 0 ? '+' : ''}${fmt(x, lang)} p.`;
  const legend: LegendItem[] = [
    {
      color: palette[0] ?? '',
      label: `${gl ? 'Moi por debaixo' : 'Muy por debajo'} (≤ ${v(-b.strong)})`,
    },
    { color: palette[1] ?? '', label: gl ? 'Por debaixo' : 'Por debajo' },
    {
      color: palette[2] ?? '',
      label: `${gl ? 'Similar a Galicia' : 'Similar a Galicia'} (${v(-b.near)} a ${v(b.near)})`,
    },
    { color: palette[3] ?? '', label: gl ? 'Por enriba' : 'Por encima' },
    {
      color: palette[4] ?? '',
      label: `${gl ? 'Moi por enriba' : 'Muy por encima'} (≥ ${v(b.strong)})`,
    },
  ];
  return { fillColor, legend };
}

/** Warning levels by concello (0 none, 1 yellow, 2 orange, 3 red). */
export function classifyWarnings(rows: Row[], key: string, lang: 'gl' | 'es'): Classified {
  const pairs: unknown[] = [];
  for (const r of rows) {
    const code = r[key];
    const n = num(r.nivel);
    if (typeof code !== 'string' || n === null || n <= 0) continue;
    pairs.push(code, WARNING_COLORS[Math.min(3, n)]);
  }
  const fillColor = pairs.length ? ['match', ['get', key], ...pairs, NO_DATA] : NO_DATA;
  const gl = lang === 'gl';
  return {
    fillColor,
    legend: [
      { color: WARNING_COLORS[1] ?? '', label: gl ? 'Amarelo' : 'Amarillo' },
      { color: WARNING_COLORS[2] ?? '', label: gl ? 'Laranxa' : 'Naranja' },
      { color: WARNING_COLORS[3] ?? '', label: gl ? 'Vermello' : 'Rojo' },
    ],
  };
}

export { WARNING_COLORS };
