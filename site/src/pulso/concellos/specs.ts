// The pulse maps that colour every concello by one value through time (a year or a month per
// step): births per 100 deaths, tourist flats per 1,000 residents, schools against 2005. One
// page view (ConcellosTempo.astro) and one client (concellos.ts) draw all of them from these
// specs; the layers share the shape codigo_ine, nome, periodos[], valor[] plus their counts.

export interface Concello {
  code: string;
  name: string;
  props: Record<string, unknown>;
  value: Array<number | null>;
}

/** Numbers of one concello (or Galicia) at a step, for the panel and table texts. */
export type Vars = Record<string, number | null>;

export interface Spec {
  slug: string;
  layer: string;
  /** Prefix of the i18n keys of the page. */
  prefix: string;
  /** Colour stops of the value (linear between them). */
  stops: Array<[number, string]>;
  /** Labels under the colour scale: first, middle and last stop. */
  scale: [string, string, string];
  /** Seconds per step when playing. */
  speeds: number[];
  /** Step label kind: years ('1975') or months ('2017M06'). */
  monthly: boolean;
  /** A colour that overrides the scale (e.g. no school left), or null. */
  special?: (c: Concello, i: number) => string | null;
  /** Figures of a concello at a step. */
  vars: (c: Concello, i: number) => Vars;
  /** Galicia's figures at a step, from all concellos. */
  galicia: (list: Concello[], i: number) => Vars;
  /** The Galicia figure drawn as bars under the map. */
  bar: (g: Vars) => number;
  /** The two count columns of the table (keys of vars), before the value. */
  columns: [string, string];
}

const arr = (c: Concello, k: string) => c.props[k] as Array<number | null>;
const sumAt = (list: Concello[], k: string, i: number) =>
  list.reduce((s, c) => s + (arr(c, k)[i] ?? 0), 0);

export const SPECS: Record<string, Spec> = {
  vida: {
    slug: 'vida',
    layer: 'nacementos-mortes',
    prefix: 'life',
    stops: [
      [25, '#7f3b08'],
      [50, '#e08214'],
      [75, '#fdb863'],
      [100, '#f7f7f2'],
      [150, '#a6dba0'],
      [250, '#1b7837'],
    ],
    scale: ['25', '100', '250'],
    speeds: [0.6, 1.2, 2.4],
    monthly: false,
    vars: (c, i) => ({
      births: arr(c, 'nacementos')[i] ?? null,
      deaths: arr(c, 'defuncions')[i] ?? null,
      value: c.value[i] ?? null,
    }),
    galicia: (list, i) => {
      const births = sumAt(list, 'nacementos', i);
      const deaths = sumAt(list, 'defuncions', i);
      const positive = list.filter((c) => (c.value[i] ?? 0) > 100).length;
      return { births, deaths, balance: births - deaths, positive };
    },
    bar: (g) => g.births ?? 0,
    columns: ['births', 'deaths'],
  },
  pisos: {
    slug: 'pisos',
    layer: 'vut-mensual',
    prefix: 'flats',
    stops: [
      [0, '#262a2b'],
      [2, '#2f5361'],
      [10, '#3f8a8c'],
      [30, '#9cc69b'],
      [80, '#f0d77b'],
      [150, '#f08a4b'],
      [300, '#c2241a'],
    ],
    scale: ['0', '30', '300'],
    speeds: [0.15, 0.3, 0.6],
    monthly: true,
    vars: (c, i) => ({
      flats: arr(c, 'vut')[i] ?? null,
      places: arr(c, 'prazas')[i] ?? null,
      value: c.value[i] ?? null,
    }),
    galicia: (list, i) => ({
      flats: sumAt(list, 'vut', i),
      places: sumAt(list, 'prazas', i),
      with: list.filter((c) => (arr(c, 'vut')[i] ?? 0) > 0).length,
    }),
    bar: (g) => g.flats ?? 0,
    columns: ['flats', 'places'],
  },
  escolas: {
    slug: 'escolas',
    layer: 'escolas-concello',
    prefix: 'school',
    stops: [
      [-6, '#7f3b08'],
      [-3, '#e08214'],
      [-1, '#fdb863'],
      [0, '#f7f7f2'],
      [1, '#a6dba0'],
      [3, '#1b7837'],
    ],
    scale: ['−6', '0', '+3'],
    speeds: [0.6, 1.2, 2.4],
    monthly: false,
    special: (c, i) => (arr(c, 'centros')[i] === 0 ? '#111210' : null),
    vars: (c, i) => ({
      schools: arr(c, 'centros')[i] ?? null,
      first: arr(c, 'centros')[0] ?? null,
      value: c.value[i] ?? null,
    }),
    galicia: (list, i) => ({
      schools: sumAt(list, 'centros', i),
      first: sumAt(list, 'centros', 0),
      none: list.filter((c) => arr(c, 'centros')[i] === 0).length,
      fewer: list.filter((c) => (c.value[i] ?? 0) < 0).length,
    }),
    bar: (g) => g.schools ?? 0,
    columns: ['first', 'schools'],
  },
};

/** CSS gradient of a colour scale, stops placed by value. */
export function gradientOf(stops: Array<[number, string]>): string {
  const lo = stops[0]?.[0] ?? 0;
  const hi = stops[stops.length - 1]?.[0] ?? 1;
  const parts = stops.map(([v, c]) => `${c} ${Math.round(((v - lo) / (hi - lo)) * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
