// How each catalogue layer is drawn: MapLibre layer specs, the legend that
// explains them and, for live layers, which marks pulse. One encoding per
// layer, chosen for what that layer says (a price, an age, a flow, a size),
// in a quiet palette that leaves the basemap readable.
//
// `sourceLayer` is set when the layer is served as PMTiles (vector source).
// `stats` holds values computed in the browser from the layer's own data
// (price quantiles, categories present); `_h` is the age in hours that the
// client adds to time-stamped features (see TIME_FIELD).

interface LayerLike {
  id: string;
  geometry: string;
  style: { kind: string; label_field?: string };
}

export type Spec = Record<string, unknown>;
type Bi = { gl: string; es: string };

export type LegendShape = 'dot' | 'ring' | 'fill' | 'line' | 'dash' | 'arrow' | 'pulse';

export interface LegendEntry {
  color: string;
  label: string | Bi;
  shape?: LegendShape;
  /** Diameter in px for dots and rings. */
  size?: number;
}

export interface LegendBlock {
  title?: Bi;
  entries?: LegendEntry[];
  /** Continuous scale: colours left to right and labels under the ends (and middle). */
  ramp?: { colors: string[]; labels: Array<string | Bi> };
  note?: Bi;
}

export interface Stats {
  /** Quantiles (0.2, 0.4, 0.6, 0.8) of a numeric field. */
  q?: Record<string, number[]>;
  /** Distinct values of a field with the colour the data carries (calidade-aire). */
  cats?: Record<string, Array<{ value: string; color: string }>>;
}

export interface Encoding {
  specs: Spec[];
  legend: LegendBlock[];
  /** Style layer ids whose marks pulse (live, recent events). */
  pulse: string[];
}

export interface StyleContext {
  color: string;
  dark: boolean;
  sourceLayer?: string;
  stats?: Stats;
}

/** Series layers live on their own animated pages (/pulso/), not on the main map. */
export const SERIES_LAYERS = new Set([
  'pulso-tren',
  'pulso-bus',
  'meteo-dia',
  'meteo-24h',
  'mobilidade-cidades',
  'mobilidade-fluxos',
  'focos-agosto-2025',
  'aire-24h',
  'lonxas-2025',
  'raios-ano',
  'construcion-edificios',
  'nacementos-mortes',
  'escolas-concello',
  'vut-mensual',
]);

/** Time field per layer: the client adds `_h`, hours since that instant. */
export const TIME_FIELD: Record<string, string> = {
  raios: 'data',
  'sismos-recentes': 'data',
  'focos-calor': 'data_deteccion',
  'trafico-incidencias': 'inicio',
  'trafico-balizas-v16': 'desde',
  'perimetros-queimados': 'data_lume',
};

/** Numeric fields whose quantiles the encoding needs. */
export const QUANTILE_FIELDS: Record<string, string[]> = {
  gasolineiras: ['gasoleo_a'],
};

/** Fields whose distinct (value, colour) pairs feed a legend. */
export const CATEGORY_FIELDS: Record<string, [string, string]> = {
  'calidade-aire': ['categoria_gl', 'cor'],
};

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Medium'];

const T = (gl: string, es = gl): Bi => ({ gl, es });

// Temperature: cold blues, a pale middle around 12 °C, warm to hot.
const TEMP_STOPS: Array<[number, string]> = [
  [-5, '#2c5d8a'],
  [3, '#5b97c2'],
  [9, '#a9cfe0'],
  [14, '#ece4c2'],
  [20, '#f2b36b'],
  [27, '#d9603b'],
  [35, '#9b2226'],
];

// Five classes from cheap to dear (prices), and from near to far (distances).
const CHEAP_DEAR: [string, string, string, string, string] = [
  '#2e6b8a',
  '#7fb0c8',
  '#e9e1c6',
  '#e8a15e',
  '#b5452c',
];

const interpolate = (input: unknown, stops: Array<[number, unknown]>): unknown[] => [
  'interpolate',
  ['linear'],
  input,
  ...stops.flat(),
];

const byZoom = (pairs: Array<[number, number]>): unknown[] => interpolate(['zoom'], pairs);

/** Zoom must be the top-level input: scale a data-driven size by zoom factors. */
const zoomTimes = (factors: Array<[number, number]>, expr: unknown): unknown[] => [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...factors.flatMap(([z, k]) => [z, ['*', k, expr]]),
];

/** Two zoom ramps chosen per feature: zoom stays top-level, the case goes inside. */
const zoomCase = (
  cond: unknown,
  a: Array<[number, number]>,
  b: Array<[number, number]>,
): unknown[] => [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...a.flatMap(([z, va], i) => [z, ['case', cond, va, b[i]?.[1] ?? va]]),
];

const num = (field: string, fallback = 0): unknown[] => [
  'to-number',
  ['coalesce', ['get', field], fallback],
  fallback,
];

/** sqrt scale for sizes: area grows with the value. */
const sqrtRadius = (field: string, pairs: Array<[number, number]>): unknown[] =>
  interpolate(
    ['sqrt', ['max', 0, num(field)]],
    pairs.map(([v, r]) => [Math.sqrt(v), r] as [number, number]),
  );

const fmt = (n: number, digits = 3) =>
  new Intl.NumberFormat('gl-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);

export function encodeLayer(layer: LayerLike, ctx: StyleContext): Encoding {
  const { color, dark, sourceLayer, stats } = ctx;
  const halo = dark ? '#161714' : '#ffffff';
  const ink = dark ? '#e8e8e2' : '#3e3e38';
  const muted = dark ? '#7d7d74' : '#9a9a90';
  const base = (suffix: string, extra: Spec): Spec => ({
    id: `${layer.id}__${suffix}`,
    source: layer.id,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
    ...extra,
  });
  const label = (suffix: string, field: unknown, minzoom: number, extra: Spec = {}): Spec =>
    base(suffix, {
      type: 'symbol',
      minzoom,
      layout: {
        'text-field': field,
        'text-font': FONT,
        'text-size': 11,
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'text-optional': true,
        ...((extra.layout as Spec) ?? {}),
      },
      paint: {
        'text-color': ink,
        'text-halo-color': halo,
        'text-halo-width': 1.4,
        ...((extra.paint as Spec) ?? {}),
      },
      ...(extra.filter ? { filter: extra.filter } : {}),
    });
  /** A transparent ring the client animates outwards (pulse). */
  const pulse = (filter?: unknown, ringColor = color): Spec =>
    base('pulse', {
      type: 'circle',
      ...(filter ? { filter } : {}),
      paint: {
        'circle-radius': 6,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': ringColor,
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.6,
      },
    });
  const enc = (specs: Spec[], legend: LegendBlock[] = [], pulseIds: string[] = []): Encoding => ({
    specs,
    legend,
    pulse: pulseIds,
  });

  if (layer.geometry === 'raster') {
    // Keep the source's own colours: the legend is in the layer's context notes.
    return enc([
      {
        id: `${layer.id}__raster`,
        source: layer.id,
        type: 'raster',
        paint: { 'raster-opacity': 0.8, 'raster-resampling': 'nearest' },
      },
    ]);
  }

  switch (layer.id) {
    // ───────────────────────── Tempo e aire ─────────────────────────
    case 'estacions-meteo': {
      const temp = interpolate(num('temperatura', 12), TEMP_STOPS);
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 3.5],
                [10, 6],
                [13, 8],
              ]),
              'circle-color': ['case', ['has', 'temperatura'], temp, muted],
              // Raining in the last 10 minutes: a blue rim.
              'circle-stroke-color': ['case', ['>', num('chuvia_10min'), 0], '#2e6b8a', halo],
              'circle-stroke-width': ['case', ['>', num('chuvia_10min'), 0], 2.5, 1],
            },
          }),
          // Wind: an arrow pointing where the air goes, longer the stronger it blows.
          base('wind', {
            type: 'symbol',
            filter: ['all', ['has', 'vento_direccion'], ['>=', num('vento_velocidade'), 0.5]],
            layout: {
              'icon-image': 'ga-arrow',
              'icon-rotate': ['+', num('vento_direccion'), 180],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-size': interpolate(num('vento_velocidade'), [
                [0.5, 0.45],
                [5, 0.8],
                [12, 1.3],
              ]),
              'icon-offset': [0, -14],
            },
            paint: { 'icon-color': ink, 'icon-opacity': 0.75 },
          }),
          label('label', ['concat', ['to-string', ['round', num('temperatura')]], '°'], 8, {
            filter: ['has', 'temperatura'],
            layout: {
              'text-font': FONT_BOLD,
              'text-size': 12,
              'text-offset': [0.9, -0.2],
              'text-anchor': 'left',
            },
          }),
        ],
        [
          {
            title: T('Temperatura (°C)', 'Temperatura (°C)'),
            ramp: { colors: TEMP_STOPS.map(([, c]) => c), labels: ['−5', '14', '35'] },
          },
          {
            entries: [
              {
                shape: 'arrow',
                color: ink,
                label: T(
                  'Vento: cara a onde vai; máis longa, máis forte',
                  'Viento: hacia dónde va; más larga, más fuerte',
                ),
              },
              {
                shape: 'ring',
                color: '#2e6b8a',
                size: 10,
                label: T('Chove agora (últimos 10 min)', 'Llueve ahora (últimos 10 min)'),
              },
            ],
          },
        ],
      );
    }
    case 'calidade-aire': {
      const cats = stats?.cats?.categoria_gl ?? [];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 5],
                [12, 9],
              ]),
              'circle-color': ['coalesce', ['get', 'cor'], muted],
              'circle-stroke-color': halo,
              'circle-stroke-width': 1.5,
            },
          }),
          label('label', ['get', 'nome'], 10),
        ],
        cats.length
          ? [
              {
                title: T('Índice de calidade do aire', 'Índice de calidad del aire'),
                entries: cats.map((c) => ({
                  shape: 'dot' as const,
                  color: c.color,
                  size: 10,
                  label: c.value,
                })),
              },
            ]
          : [],
      );
    }
    case 'raios': {
      const age = num('_h', 99);
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 2.5],
                [11, 4.5],
              ]),
              'circle-color': ['step', age, '#ffe066', 1, '#f2b84b', 6, '#d9822b', 24, muted],
              'circle-opacity': interpolate(age, [
                [0, 1],
                [24, 0.7],
                [72, 0.35],
              ]),
              'circle-stroke-color': halo,
              'circle-stroke-width': 0.6,
            },
          }),
          pulse(['<', age, 0.5], '#d9822b'),
        ],
        [
          {
            title: T('Raios, por idade', 'Rayos, por antigüedad'),
            entries: [
              {
                shape: 'pulse',
                color: '#ffe066',
                size: 8,
                label: T('Menos de 1 hora', 'Menos de 1 hora'),
              },
              { shape: 'dot', color: '#f2b84b', size: 8, label: T('1 a 6 horas', '1 a 6 horas') },
              { shape: 'dot', color: '#d9822b', size: 8, label: T('6 a 24 horas', '6 a 24 horas') },
              {
                shape: 'dot',
                color: muted,
                size: 8,
                label: T('Máis de 24 horas', 'Más de 24 horas'),
              },
            ],
          },
        ],
        [`${layer.id}__pulse`],
      );
    }
    case 'avisos-aemet':
      return enc(
        [
          base('fill', {
            type: 'fill',
            paint: {
              'fill-color': [
                'match',
                ['get', 'nivel'],
                'vermello',
                '#c0392b',
                'laranxa',
                '#f2994a',
                '#f2c94c',
              ],
              'fill-opacity': 0.35,
            },
          }),
          base('line', {
            type: 'line',
            paint: {
              'line-color': [
                'match',
                ['get', 'nivel'],
                'vermello',
                '#c0392b',
                'laranxa',
                '#d9822b',
                '#c9a227',
              ],
              'line-width': 1.5,
            },
          }),
        ],
        [
          {
            entries: [
              { shape: 'fill', color: '#f2c94c', label: T('Amarelo', 'Amarillo') },
              { shape: 'fill', color: '#f2994a', label: T('Laranxa', 'Naranja') },
              { shape: 'fill', color: '#c0392b', label: T('Vermello', 'Rojo') },
            ],
          },
        ],
      );

    // ───────────────────────── Lume e monte ─────────────────────────
    case 'focos-calor': {
      const age = num('_h', 99);
      const fire = ['step', age, '#ff4d1a', 6, '#f2994a', 24, '#b07a5a'];
      const r = sqrtRadius('frp', [
        [0, 3],
        [10, 5],
        [100, 10],
        [1000, 18],
      ]);
      return enc(
        [
          // A soft glow under each focus: heat, not a pin.
          base('glow', {
            type: 'circle',
            paint: {
              'circle-radius': ['*', r, 2.4],
              'circle-color': fire,
              'circle-blur': 1,
              'circle-opacity': 0.35,
            },
          }),
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': r,
              'circle-color': fire,
              'circle-stroke-color': halo,
              'circle-stroke-width': 0.8,
            },
          }),
          pulse(['<', age, 6], '#ff4d1a'),
        ],
        [
          {
            title: T('Focos de calor', 'Focos de calor'),
            entries: [
              {
                shape: 'pulse',
                color: '#ff4d1a',
                size: 10,
                label: T('Últimas 6 horas', 'Últimas 6 horas'),
              },
              {
                shape: 'dot',
                color: '#f2994a',
                size: 10,
                label: T('6 a 24 horas', '6 a 24 horas'),
              },
              {
                shape: 'dot',
                color: '#b07a5a',
                size: 10,
                label: T('Máis de 24 horas', 'Más de 24 horas'),
              },
              {
                shape: 'dot',
                color: muted,
                size: 18,
                label: T(
                  'Máis grande, máis potencia radiada (FRP)',
                  'Más grande, más potencia radiada (FRP)',
                ),
              },
            ],
          },
        ],
        [`${layer.id}__pulse`],
      );
    }
    case 'perimetros-queimados': {
      const recent = ['<', num('_h', 9e9), 24 * 14];
      return enc(
        [
          base('fill', {
            type: 'fill',
            paint: { 'fill-color': ['case', recent, '#c2410c', color], 'fill-opacity': 0.45 },
          }),
          base('line', {
            type: 'line',
            paint: { 'line-color': ['case', recent, '#c2410c', color], 'line-width': 1 },
          }),
          label('label', ['concat', ['to-string', ['round', num('area_ha')]], ' ha'], 10, {
            filter: ['>=', num('area_ha'), 1],
            layout: { 'text-offset': [0, 0], 'text-anchor': 'center' },
          }),
        ],
        [
          {
            entries: [
              {
                shape: 'fill',
                color: '#c2410c',
                label: T('Queimado nas últimas dúas semanas', 'Quemado en las últimas dos semanas'),
              },
              {
                shape: 'fill',
                color,
                label: T('Antes, nesta tempada', 'Antes, en esta temporada'),
              },
            ],
          },
        ],
      );
    }
    case 'historial-queimados': {
      const years: Array<[number, string]> = [
        [2016, '#ead9c0'],
        [2019, '#d6a77a'],
        [2022, '#b5652e'],
        [2025, '#5e2412'],
      ];
      return enc(
        [
          base('fill', {
            type: 'fill',
            paint: { 'fill-color': interpolate(num('ano', 2016), years), 'fill-opacity': 0.75 },
          }),
          base('line', {
            type: 'line',
            minzoom: 9,
            paint: { 'line-color': interpolate(num('ano', 2016), years), 'line-width': 0.6 },
          }),
          label('label', ['to-string', ['get', 'ano']], 11, {
            filter: ['>=', num('area_ha'), 50],
            layout: { 'text-offset': [0, 0], 'text-anchor': 'center' },
          }),
        ],
        [
          {
            title: T('Ano do lume', 'Año del incendio'),
            ramp: { colors: years.map(([, c]) => c), labels: ['2016', '2020', '2025'] },
          },
        ],
      );
    }

    // ───────────────────────── Auga e mar ─────────────────────────
    case 'caudais-rios':
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': sqrtRadius('caudal_m3s', [
                [0, 2.5],
                [1, 5],
                [10, 10],
                [100, 20],
              ]),
              'circle-color': color,
              'circle-opacity': 0.75,
              'circle-stroke-color': halo,
              'circle-stroke-width': 1,
            },
          }),
          label(
            'label',
            ['concat', ['number-format', num('caudal_m3s'), { 'max-fraction-digits': 1 }], ' m³/s'],
            9,
            { filter: ['has', 'caudal_m3s'] },
          ),
        ],
        [
          {
            title: T('Caudal (m³/s)', 'Caudal (m³/s)'),
            entries: [
              { shape: 'dot', color, size: 7, label: '0,1' },
              { shape: 'dot', color, size: 10, label: '1' },
              { shape: 'dot', color, size: 20, label: '10' },
            ],
          },
        ],
      );

    case 'praias': {
      const urbana = ['==', ['get', 'categoria'], 'urbana'];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 2.2],
                [12, 5.5],
              ]),
              'circle-color': ['case', urbana, halo, color],
              'circle-stroke-color': color,
              'circle-stroke-width': ['case', urbana, 1.6, 0.8],
            },
          }),
          label('label', ['get', 'nome'], 12),
        ],
        [
          {
            entries: [
              { shape: 'dot', color, size: 9, label: T('Praia natural', 'Playa natural') },
              { shape: 'ring', color, size: 9, label: T('Praia urbana', 'Playa urbana') },
            ],
            note: T('Praias da costa; sen as fluviais.', 'Playas de la costa; sin las fluviales.'),
          },
        ],
      );
    }
    case 'zonas-bano': {
      const rio = ['==', ['get', 'tipo'], 'continental'];
      return enc(
        [
          base('fill', {
            type: 'fill',
            paint: { 'fill-color': ['case', rio, '#6b8f47', color], 'fill-opacity': 0.35 },
          }),
          base('line', {
            type: 'line',
            paint: { 'line-color': ['case', rio, '#6b8f47', color], 'line-width': 1 },
          }),
          // Small at low zoom: a dot marks each zone until the polygon is visible.
          base('dot', {
            type: 'circle',
            maxzoom: 10,
            paint: {
              'circle-radius': 2.5,
              'circle-color': ['case', rio, '#6b8f47', color],
              'circle-stroke-color': halo,
              'circle-stroke-width': 0.8,
            },
          }),
          label('label', ['get', 'nome'], 12, {
            layout: { 'text-offset': [0, 0], 'text-anchor': 'center' },
          }),
        ],
        [
          {
            entries: [
              { shape: 'fill', color, label: T('Zona de baño no mar', 'Zona de baño en el mar') },
              {
                shape: 'fill',
                color: '#6b8f47',
                label: T('Zona de baño en río ou encoro', 'Zona de baño en río o embalse'),
              },
            ],
            note: T(
              'Censo oficial de Galicia-Costa; sen a calidade da auga da tempada.',
              'Censo oficial de Galicia-Costa; sin la calidad del agua de la temporada.',
            ),
          },
        ],
      );
    }
    // ───────────────────────── Mobilidade ─────────────────────────
    case 'tren': {
      const cercanias = ['==', ['get', 'rede'], 'Cercanías'];
      const stopped = ['==', ['get', 'estado'], 'STOPPED_AT'];
      const c = ['case', cercanias, '#c8872b', color];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 4.5],
                [12, 7],
              ]),
              'circle-color': ['case', stopped, halo, c],
              'circle-stroke-color': c,
              'circle-stroke-width': 2,
            },
          }),
          label('label', ['get', 'tren'], 8, { layout: { 'text-size': 10 } }),
        ],
        [
          {
            entries: [
              {
                shape: 'dot',
                color,
                size: 10,
                label: T(
                  'Media e longa distancia, en marcha',
                  'Media y larga distancia, en marcha',
                ),
              },
              {
                shape: 'dot',
                color: '#c8872b',
                size: 10,
                label: T('Cercanías, en marcha', 'Cercanías, en marcha'),
              },
              {
                shape: 'ring',
                color,
                size: 10,
                label: T('Parado nunha estación', 'Parado en una estación'),
              },
            ],
            note: T(
              'Posición publicada por Renfe, con atraso de seguridade.',
              'Posición publicada por Renfe, con retraso de seguridad.',
            ),
          },
        ],
      );
    }
    case 'estacions-tren':
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': sqrtRadius('servizos_dia', [
                [1, 3],
                [10, 5],
                [50, 9],
                [100, 12],
              ]),
              'circle-color': halo,
              'circle-stroke-color': color,
              'circle-stroke-width': 2,
            },
          }),
          label('label', ['get', 'nome'], 9, {
            layout: { 'symbol-sort-key': ['-', 0, num('servizos_dia')] },
          }),
        ],
        [
          {
            title: T('Trens que paran nun día laborable', 'Trenes que paran en un día laborable'),
            entries: [
              { shape: 'ring', color, size: 7, label: '1–5' },
              { shape: 'ring', color, size: 13, label: '25' },
              { shape: 'ring', color, size: 22, label: '100' },
            ],
          },
        ],
      );
    case 'buses-xunta':
      return enc([
        base('circle', {
          type: 'circle',
          minzoom: 9,
          paint: {
            'circle-radius': byZoom([
              [9, 1.5],
              [14, 4.5],
            ]),
            'circle-color': color,
            'circle-opacity': 0.8,
          },
        }),
        label('label', ['get', 'nome'], 14),
      ]);
    case 'aeroportos': {
      const r = ['match', ['get', 'tipo'], 'grande', 10, 'mediano', 8, 'pequeno', 4.5, 3];
      const heli = ['==', ['get', 'tipo'], 'heliporto'];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': r,
              'circle-color': ['case', heli, halo, color],
              'circle-stroke-color': color,
              'circle-stroke-width': ['case', heli, 1.2, 1.5],
            },
          }),
          label('label', ['get', 'nome'], 7, {
            filter: ['in', ['get', 'tipo'], ['literal', ['grande', 'mediano']]],
            layout: { 'text-offset': [0, 1.2] },
          }),
          label('label-small', ['get', 'nome'], 10, {
            filter: ['!', ['in', ['get', 'tipo'], ['literal', ['grande', 'mediano']]]],
          }),
        ],
        [
          {
            entries: [
              {
                shape: 'dot',
                color,
                size: 18,
                label: T('Aeroporto con voos regulares', 'Aeropuerto con vuelos regulares'),
              },
              { shape: 'dot', color, size: 9, label: T('Aeródromo', 'Aeródromo') },
              { shape: 'ring', color, size: 7, label: T('Heliporto', 'Helipuerto') },
            ],
          },
        ],
      );
    }
    case 'gasolineiras': {
      const q = stats?.q?.gasoleo_a ?? [1.8, 1.85, 1.9, 1.95];
      const price = num('gasoleo_a', 0);
      const classes = [
        'step',
        price,
        CHEAP_DEAR[0],
        q[0],
        CHEAP_DEAR[1],
        q[1],
        CHEAP_DEAR[2],
        q[2],
        CHEAP_DEAR[3],
        q[3],
        CHEAP_DEAR[4],
      ];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 3],
                [11, 5.5],
                [14, 7],
              ]),
              'circle-color': ['case', ['>', price, 0], classes, muted],
              'circle-stroke-color': halo,
              'circle-stroke-width': 1,
            },
          }),
          label(
            'label',
            ['number-format', price, { locale: 'gl-ES', 'min-fraction-digits': 3 }],
            11,
            {
              filter: ['>', price, 0],
            },
          ),
        ],
        [
          {
            title: T(
              'Gasóleo A, €/litro (de máis barato a máis caro)',
              'Gasóleo A, €/litro (de más barato a más caro)',
            ),
            entries: [
              { shape: 'dot', color: CHEAP_DEAR[0], size: 10, label: `< ${fmt(q[0] ?? 0)}` },
              {
                shape: 'dot',
                color: CHEAP_DEAR[1],
                size: 10,
                label: `${fmt(q[0] ?? 0)} – ${fmt(q[1] ?? 0)}`,
              },
              {
                shape: 'dot',
                color: CHEAP_DEAR[2],
                size: 10,
                label: `${fmt(q[1] ?? 0)} – ${fmt(q[2] ?? 0)}`,
              },
              {
                shape: 'dot',
                color: CHEAP_DEAR[3],
                size: 10,
                label: `${fmt(q[2] ?? 0)} – ${fmt(q[3] ?? 0)}`,
              },
              { shape: 'dot', color: CHEAP_DEAR[4], size: 10, label: `≥ ${fmt(q[3] ?? 0)}` },
            ],
            note: T(
              'Cada cor agrupa un quinto das gasolineiras.',
              'Cada color agrupa un quinto de las gasolineras.',
            ),
          },
        ],
      );
    }
    case 'puntos-recarga': {
      const kw = num('potencia_max_kw');
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': ['step', kw, 3, 22, 4.5, 50, 6.5, 150, 9],
              'circle-color': ['case', ['>=', kw, 50], color, halo],
              'circle-stroke-color': color,
              'circle-stroke-width': 1.8,
            },
          }),
          label('label', ['concat', ['to-string', kw], ' kW'], 12),
        ],
        [
          {
            title: T('Potencia máxima', 'Potencia máxima'),
            entries: [
              { shape: 'ring', color, size: 6, label: T('Lenta (< 22 kW)', 'Lenta (< 22 kW)') },
              {
                shape: 'ring',
                color,
                size: 9,
                label: T('Semirrápida (22–50 kW)', 'Semirrápida (22–50 kW)'),
              },
              {
                shape: 'dot',
                color,
                size: 13,
                label: T('Rápida (50–150 kW)', 'Rápida (50–150 kW)'),
              },
              {
                shape: 'dot',
                color,
                size: 18,
                label: T('Ultrarrápida (≥ 150 kW)', 'Ultrarrápida (≥ 150 kW)'),
              },
            ],
          },
        ],
      );
    }
    case 'bicis-arteixo': {
      const share = ['/', num('bicis_libres'), ['max', 1, num('capacidade', 1)]];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [9, 5],
                [14, 11],
              ]),
              'circle-color': [
                'case',
                ['==', ['get', 'operativa'], false],
                muted,
                interpolate(share, [
                  [0, '#b5452c'],
                  [0.5, '#e9e1c6'],
                  [1, '#4a7c59'],
                ]),
              ],
              'circle-stroke-color': halo,
              'circle-stroke-width': 1.2,
            },
          }),
          base('count', {
            type: 'symbol',
            minzoom: 12,
            layout: {
              'text-field': ['to-string', num('bicis_libres')],
              'text-font': FONT_BOLD,
              'text-size': 11,
            },
            paint: { 'text-color': '#1a1a17' },
          }),
        ],
        [
          {
            title: T('Bicicletas libres', 'Bicicletas libres'),
            ramp: {
              colors: ['#b5452c', '#e9e1c6', '#4a7c59'],
              labels: [T('Baleira', 'Vacía'), '50 %', T('Chea', 'Llena')],
            },
          },
        ],
      );
    }
    case 'trafico-incidencias': {
      const tipo = ['get', 'tipo'];
      const c = [
        'match',
        tipo,
        'Accidente',
        '#c0392b',
        'Obras',
        muted,
        ['Vehículo na calzada', 'Obstáculo na calzada'],
        '#e8833a',
        ['Obstáculo natural', 'Condicións meteorolóxicas adversas'],
        '#2e6b8a',
        '#8b5e3c',
      ];
      const urgent = ['any', ['==', tipo, 'Accidente'], ['==', ['get', 'gravidade'], 'máxima']];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': ['case', urgent, 6.5, ['==', tipo, 'Obras'], 3.5, 5],
              'circle-color': c,
              'circle-stroke-color': halo,
              'circle-stroke-width': 1.5,
            },
          }),
          pulse(urgent, '#c0392b'),
          label('label', ['concat', ['get', 'estrada'], ' · ', ['get', 'tipo']], 10),
        ],
        [
          {
            entries: [
              {
                shape: 'pulse',
                color: '#c0392b',
                size: 12,
                label: T('Accidente ou gravidade máxima', 'Accidente o gravedad máxima'),
              },
              {
                shape: 'dot',
                color: '#e8833a',
                size: 10,
                label: T('Vehículo ou obstáculo na calzada', 'Vehículo u obstáculo en la calzada'),
              },
              {
                shape: 'dot',
                color: '#2e6b8a',
                size: 10,
                label: T('Tempo ou obstáculo natural', 'Tiempo u obstáculo natural'),
              },
              {
                shape: 'dot',
                color: '#8b5e3c',
                size: 10,
                label: T('Danos na estrada', 'Daños en la carretera'),
              },
              { shape: 'dot', color: muted, size: 7, label: T('Obras', 'Obras') },
            ],
          },
        ],
        [`${layer.id}__pulse`],
      );
    }
    case 'trafico-balizas-v16':
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 4],
                [12, 7],
              ]),
              'circle-color': '#f2994a',
              'circle-stroke-color': halo,
              'circle-stroke-width': 1.5,
            },
          }),
          pulse(undefined, '#f2994a'),
          label('label', ['get', 'estrada'], 10),
        ],
        [
          {
            entries: [
              {
                shape: 'pulse',
                color: '#f2994a',
                size: 12,
                label: T(
                  'Vehículo detido cunha baliza V16 acesa',
                  'Vehículo detenido con una baliza V16 encendida',
                ),
              },
            ],
            note: T(
              'Só as activas agora; sen identificador nin histórico.',
              'Solo las activas ahora; sin identificador ni histórico.',
            ),
          },
        ],
        [`${layer.id}__pulse`],
      );
    case 'trafico-radares':
      return enc(
        [
          base('line', {
            type: 'line',
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: { 'line-color': color, 'line-width': 3, 'line-dasharray': [1, 1] },
          }),
          base('circle', {
            type: 'circle',
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
              'circle-radius': byZoom([
                [6, 3],
                [12, 6],
              ]),
              'circle-color': halo,
              'circle-stroke-color': color,
              'circle-stroke-width': 2,
            },
          }),
          label('label', ['concat', ['get', 'estrada'], ' km ', ['to-string', ['get', 'pk']]], 11, {
            filter: ['==', ['geometry-type'], 'Point'],
          }),
        ],
        [
          {
            entries: [
              {
                shape: 'ring',
                color,
                size: 10,
                label: T('Cabina de radar fixo', 'Cabina de radar fijo'),
              },
              {
                shape: 'dash',
                color,
                label: T('Tramo de velocidade media', 'Tramo de velocidad media'),
              },
            ],
            note: T(
              'Unha cabina non sempre ten un radar dentro.',
              'Una cabina no siempre tiene un radar dentro.',
            ),
          },
        ],
      );

    case 'imd-estradas': {
      const imd = num('imd');
      const stops: Array<[number, string]> = [
        [0, '#efd9a7'],
        [2000, '#e0a95a'],
        [8000, '#c2410c'],
        [20000, '#7a1426'],
      ];
      // Sections whose last count is older than 2023 (or that have none) are drawn fainter.
      const old = ['<', num('ano_aforo'), 2023];
      return enc(
        [
          base('line', {
            type: 'line',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': interpolate(imd, stops),
              'line-width': zoomTimes(
                [
                  [7, 0.6],
                  [12, 1.4],
                ],
                interpolate(imd, [
                  [0, 1],
                  [2000, 2],
                  [8000, 3.5],
                  [20000, 6],
                ]),
              ),
              'line-opacity': ['case', old, 0.5, 0.95],
            },
          }),
          label(
            'label',
            ['concat', ['get', 'estrada'], ' · ', ['number-format', imd, { locale: 'gl-ES' }]],
            11,
            {
              layout: {
                'symbol-placement': 'line',
                'text-offset': [0, 0.8],
                'text-anchor': 'center',
              },
            },
          ),
        ],
        [
          {
            title: T('Vehículos ao día (IMD 2025)', 'Vehículos al día (IMD 2025)'),
            ramp: { colors: stops.map(([, c]) => c), labels: ['0', '8.000', '20.000+'] },
            note: T(
              'Máis tenue: último aforo anterior a 2023 ou sen aforo. Só estradas da Xunta.',
              'Más tenue: último aforo anterior a 2023 o sin aforo. Solo carreteras de la Xunta.',
            ),
          },
        ],
      );
    }
    // ───────────────────────── Servizos ─────────────────────────
    case 'centros-saude': {
      const pac = ['==', ['get', 'tipo'], 'pac'];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': zoomCase(
                pac,
                [
                  [6, 5],
                  [12, 9],
                ],
                [
                  [6, 2.5],
                  [12, 5.5],
                ],
              ),
              'circle-color': ['case', pac, 'rgba(0,0,0,0)', color],
              'circle-stroke-color': ['case', pac, color, halo],
              'circle-stroke-width': ['case', pac, 2, 1],
            },
          }),
          label('label', ['get', 'nome'], 11, { filter: ['!', pac] }),
        ],
        [
          {
            entries: [
              { shape: 'dot', color, size: 8, label: T('Centro de saúde', 'Centro de salud') },
              {
                shape: 'ring',
                color,
                size: 14,
                label: T(
                  'Punto de atención continuada (urxencias)',
                  'Punto de atención continuada (urgencias)',
                ),
              },
            ],
          },
        ],
      );
    }
    case 'hospitais':
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 5],
                [12, 9],
              ]),
              'circle-color': color,
              'circle-stroke-color': halo,
              'circle-stroke-width': 1.5,
            },
          }),
          base('cross', {
            type: 'symbol',
            minzoom: 8,
            layout: {
              'text-field': '+',
              'text-font': FONT_BOLD,
              'text-size': 13,
              'text-allow-overlap': true,
            },
            paint: { 'text-color': halo },
          }),
          label('label', ['get', 'nome'], 10, { layout: { 'text-offset': [0, 1.1] } }),
        ],
        [{ entries: [{ shape: 'dot', color, size: 14, label: T('Hospital', 'Hospital') }] }],
      );
    case 'farmacias':
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 1.6],
                [12, 4],
                [15, 6],
              ]),
              'circle-color': color,
              'circle-stroke-color': halo,
              'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 0, 12, 1],
            },
          }),
        ],
        [{ entries: [{ shape: 'dot', color, size: 7, label: T('Farmacia', 'Farmacia') }] }],
      );
    case 'centros-educativos': {
      const etapa = ['get', 'etapa'];
      const c = [
        'match',
        etapa,
        ['infantil', 'infantil_primaria', 'primaria'],
        '#6b8f47',
        ['secundaria', 'primaria_secundaria'],
        '#2e6b8a',
        'formacion_profesional',
        '#c8872b',
        ['educacion_especial', 'adultos'],
        '#6b4c8a',
        muted,
      ];
      const publica = ['==', ['get', 'titularidade'], 'publica'];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 2.2],
                [12, 5.5],
              ]),
              'circle-color': ['case', publica, c, halo],
              'circle-stroke-color': ['case', publica, halo, c],
              'circle-stroke-width': ['case', publica, 0.8, 1.6],
            },
          }),
          label('label', ['get', 'nome'], 13),
        ],
        [
          {
            entries: [
              {
                shape: 'dot',
                color: '#6b8f47',
                size: 9,
                label: T('Infantil e primaria', 'Infantil y primaria'),
              },
              {
                shape: 'dot',
                color: '#2e6b8a',
                size: 9,
                label: T('Secundaria (e CPI)', 'Secundaria (y CPI)'),
              },
              {
                shape: 'dot',
                color: '#c8872b',
                size: 9,
                label: T('Formación profesional', 'Formación profesional'),
              },
              {
                shape: 'dot',
                color: '#6b4c8a',
                size: 9,
                label: T('Especial e adultos', 'Especial y adultos'),
              },
              {
                shape: 'dot',
                color: muted,
                size: 9,
                label: T('Música, idiomas e outros', 'Música, idiomas y otros'),
              },
            ],
            note: T('Cheo, público; baleiro, privado.', 'Lleno, público; vacío, privado.'),
          },
        ],
      );
    }
    case 'centros-maiores': {
      const ini = ['get', 'iniciativa'];
      const c = ['match', ini, 'publica', color, 'social', '#2e6b8a', '#a89bb8'];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 2.5],
                [12, 6],
              ]),
              'circle-color': c,
              'circle-stroke-color': halo,
              'circle-stroke-width': 1,
            },
          }),
          label('label', ['get', 'nome'], 12),
        ],
        [
          {
            entries: [
              { shape: 'dot', color, size: 9, label: T('Pública', 'Pública') },
              {
                shape: 'dot',
                color: '#2e6b8a',
                size: 9,
                label: T('Iniciativa social', 'Iniciativa social'),
              },
              { shape: 'dot', color: '#a89bb8', size: 9, label: T('Privada', 'Privada') },
            ],
          },
        ],
      );
    }
    case 'desfibriladores':
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': byZoom([
                [6, 1.8],
                [12, 4.5],
                [15, 6.5],
              ]),
              'circle-color': color,
              'circle-stroke-color': halo,
              'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 0, 12, 1],
            },
          }),
          label('label', ['get', 'ubicacion'], 14),
        ],
        [
          {
            entries: [{ shape: 'dot', color, size: 8, label: T('Desfibrilador', 'Desfibrilador') }],
            note: T(
              'Equipos rexistrados no 061. O acceso depende do horario de cada lugar.',
              'Equipos registrados en el 061. El acceso depende del horario de cada lugar.',
            ),
          },
        ],
      );
    case 'distancia-servizos': {
      const stops: Array<[number, string]> = [
        [0, CHEAP_DEAR[0]],
        [2, CHEAP_DEAR[1]],
        [4, CHEAP_DEAR[2]],
        [7, CHEAP_DEAR[3]],
        [10, CHEAP_DEAR[4]],
      ];
      return enc(
        [
          base('circle', {
            type: 'circle',
            minzoom: 7,
            paint: {
              'circle-radius': byZoom([
                [7, 1.2],
                [10, 2.5],
                [14, 5],
              ]),
              'circle-color': interpolate(num('dist_centro_saude'), stops),
              'circle-opacity': 0.9,
            },
          }),
          label(
            'label',
            ['concat', ['get', 'nome'], ' · ', ['to-string', num('dist_centro_saude')], ' km'],
            12,
          ),
        ],
        [
          {
            title: T(
              'Distancia ao centro de saúde máis próximo',
              'Distancia al centro de salud más cercano',
            ),
            ramp: { colors: stops.map(([, c]) => c), labels: ['0 km', '4 km', '10+ km'] },
            note: T(
              'En liña recta desde cada lugar, non por estrada.',
              'En línea recta desde cada lugar, no por carretera.',
            ),
          },
        ],
      );
    }

    // ───────────────────────── Territorio ─────────────────────────
    case 'concellos-parroquias':
      return enc([
        base('parroquias', {
          type: 'line',
          filter: ['==', ['get', 'nivel'], 'parroquia'],
          minzoom: 9,
          paint: {
            'line-color': color,
            'line-width': 0.5,
            'line-opacity': 0.6,
            'line-dasharray': [2, 2],
          },
        }),
        base('concellos', {
          type: 'line',
          filter: ['==', ['get', 'nivel'], 'concello'],
          paint: {
            'line-color': color,
            'line-width': byZoom([
              [6, 0.5],
              [12, 1.8],
            ]),
          },
        }),
        base('fill', {
          // Invisible fill so clicks inside a parroquia or concello hit it.
          type: 'fill',
          filter: ['==', ['get', 'nivel'], 'parroquia'],
          paint: { 'fill-color': color, 'fill-opacity': 0.01 },
        }),
      ]);
    case 'entidades-poboacion': {
      const pop = num('poboacion', 0);
      return enc(
        [
          base('circle', {
            type: 'circle',
            minzoom: 8,
            paint: {
              'circle-radius': zoomTimes(
                [
                  [8, 0.6],
                  [12, 1],
                  [15, 1.6],
                ],
                sqrtRadius('poboacion', [
                  [0, 1.4],
                  [50, 2.5],
                  [500, 4.5],
                  [5000, 9],
                ]),
              ),
              'circle-color': ['case', ['>', pop, 0], color, halo],
              'circle-stroke-color': color,
              'circle-stroke-width': ['case', ['>', pop, 0], 0, 0.8],
              'circle-opacity': 0.55,
            },
          }),
          label('label', ['get', 'nome'], 12, {
            layout: {
              'symbol-sort-key': ['-', 0, pop],
              'text-size': byZoom([
                [12, 10],
                [15, 12],
              ]),
            },
          }),
        ],
        [
          {
            title: T('Habitantes por lugar', 'Habitantes por lugar'),
            entries: [
              { shape: 'dot', color, size: 5, label: '< 50' },
              { shape: 'dot', color, size: 9, label: '500' },
              { shape: 'dot', color, size: 18, label: '5.000' },
              {
                shape: 'ring',
                color,
                size: 5,
                label: T('Sen dato de poboación', 'Sin dato de población'),
              },
            ],
          },
        ],
      );
    }
    case 'espazos-naturais-galicia': {
      const strong = ['in', ['get', 'figura'], ['literal', ['Parque nacional', 'Parque natural']]];
      return enc(
        [
          base('fill', {
            type: 'fill',
            paint: { 'fill-color': color, 'fill-opacity': ['case', strong, 0.35, 0.18] },
          }),
          base('line', {
            type: 'line',
            paint: { 'line-color': color, 'line-width': ['case', strong, 1.5, 0.8] },
          }),
          label('label', ['get', 'nome'], 9, {
            layout: { 'text-offset': [0, 0], 'text-anchor': 'center' },
          }),
        ],
        [
          {
            entries: [
              {
                shape: 'fill',
                color,
                label: T('Parque nacional ou natural', 'Parque nacional o natural'),
              },
              {
                shape: 'fill',
                color: `${color}66`,
                label: T('Outras figuras de protección', 'Otras figuras de protección'),
              },
            ],
          },
        ],
      );
    }
    case 'rede-natura': {
      const zepa = ['in', 'ZEPA', ['get', 'figura']];
      return enc(
        [
          base('fill', {
            type: 'fill',
            filter: ['!=', ['get', 'figura'], 'ZEPA'],
            paint: { 'fill-color': color, 'fill-opacity': 0.2 },
          }),
          base('line', {
            type: 'line',
            filter: ['!', zepa],
            paint: { 'line-color': color, 'line-width': 0.9 },
          }),
          // Bird areas (ZEPA) as a dashed outline over the habitat areas.
          base('zepa', {
            type: 'line',
            filter: zepa,
            paint: { 'line-color': '#2e6b8a', 'line-width': 1.4, 'line-dasharray': [3, 2] },
          }),
          label('label', ['get', 'nome'], 9, {
            layout: { 'text-offset': [0, 0], 'text-anchor': 'center' },
          }),
        ],
        [
          {
            entries: [
              {
                shape: 'fill',
                color,
                label: T(
                  'Zona de especial conservación (LIC/ZEC)',
                  'Zona de especial conservación (LIC/ZEC)',
                ),
              },
              {
                shape: 'dash',
                color: '#2e6b8a',
                label: T(
                  'Zona de protección para as aves (ZEPA)',
                  'Zona de protección para las aves (ZEPA)',
                ),
              },
            ],
          },
        ],
      );
    }
    case 'sendas-paisaxe': {
      const tipo = ['get', 'tipo'];
      const etapa = ['==', tipo, 'Camiño do Litoral (etapa)'];
      const c = [
        'match',
        tipo,
        ['Camiño do Litoral (etapa)', 'Senda Litoral (faros)'],
        '#2e6b8a',
        'Itinerario natural',
        '#6b8f47',
        'Itinerario panorámico',
        '#b8860b',
        color,
      ];
      return enc(
        [
          base('etapas', {
            type: 'line',
            filter: etapa,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': c,
              'line-width': byZoom([
                [7, 1.6],
                [13, 4],
              ]),
            },
          }),
          // Dashed so the routes read as paths over roads and the coastal stages.
          base('itinerarios', {
            type: 'line',
            filter: ['!', etapa],
            layout: { 'line-join': 'round' },
            paint: {
              'line-color': c,
              'line-width': byZoom([
                [7, 1],
                [13, 2.5],
              ]),
              'line-dasharray': [2, 1.5],
            },
          }),
          label('label', ['get', 'nome'], 12, {
            layout: {
              'symbol-placement': 'line',
              'text-offset': [0, 0.8],
              'text-anchor': 'center',
            },
          }),
        ],
        [
          {
            entries: [
              {
                shape: 'line',
                color: '#2e6b8a',
                label: T('Camiño do Litoral (etapas)', 'Camiño do Litoral (etapas)'),
              },
              {
                shape: 'dash',
                color: '#2e6b8a',
                label: T('Senda Litoral dos faros', 'Senda Litoral de los faros'),
              },
              {
                shape: 'dash',
                color: '#6b8f47',
                label: T('Itinerario natural', 'Itinerario natural'),
              },
              {
                shape: 'dash',
                color: '#b8860b',
                label: T('Itinerario panorámico', 'Itinerario panorámico'),
              },
              {
                shape: 'dash',
                color,
                label: T('Itinerario patrimonial', 'Itinerario patrimonial'),
              },
            ],
          },
        ],
      );
    }
    case 'patrimonio': {
      const c = [
        'match',
        ['get', 'interese'],
        'ART',
        color,
        'ARQ',
        '#7a7a2e',
        ['ETN', 'IND', 'PAI'],
        '#2e6b8a',
        muted,
      ];
      const big = [
        'in',
        ['get', 'categoria'],
        ['literal', ['Conxunto histórico', 'Paisaxe cultural', 'Sitio histórico']],
      ];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': zoomCase(
                big,
                [
                  [6, 5],
                  [12, 9],
                ],
                [
                  [6, 2.5],
                  [12, 5],
                ],
              ),
              'circle-color': ['case', big, 'rgba(0,0,0,0)', c],
              'circle-stroke-color': ['case', big, c, halo],
              'circle-stroke-width': ['case', big, 2, 0.8],
            },
          }),
          label('label', ['get', 'nome'], 11),
        ],
        [
          {
            entries: [
              {
                shape: 'dot',
                color,
                size: 9,
                label: T('Artístico e arquitectónico', 'Artístico y arquitectónico'),
              },
              { shape: 'dot', color: '#7a7a2e', size: 9, label: T('Arqueolóxico', 'Arqueológico') },
              {
                shape: 'dot',
                color: '#2e6b8a',
                size: 9,
                label: T('Etnolóxico, industrial ou paisaxe', 'Etnológico, industrial o paisaje'),
              },
              {
                shape: 'ring',
                color,
                size: 14,
                label: T('Conxunto ou sitio histórico', 'Conjunto o sitio histórico'),
              },
            ],
          },
        ],
      );
    }
    case 'aloxamento-reat': {
      const tip = ['get', 'tipoloxia'];
      const c = [
        'match',
        tip,
        'Hotel',
        '#2e6b8a',
        'Pensión',
        '#7fb0c8',
        'Turismo rural',
        '#6b8f47',
        ['Apartamentos turísticos', 'Vivenda turística'],
        '#c8872b',
        'Albergue turístico',
        '#6b4c8a',
        'Cámping',
        '#7a7a2e',
        muted,
      ];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              'circle-radius': zoomTimes(
                [
                  [6, 0.6],
                  [12, 1],
                ],
                sqrtRadius('prazas', [
                  [0, 2],
                  [20, 3.5],
                  [100, 6],
                  [500, 12],
                ]),
              ),
              'circle-color': c,
              'circle-opacity': 0.85,
              'circle-stroke-color': halo,
              'circle-stroke-width': 0.6,
            },
          }),
          label('label', ['get', 'nome'], 13),
        ],
        [
          {
            title: T('Tamaño: prazas', 'Tamaño: plazas'),
            entries: [
              { shape: 'dot', color: '#2e6b8a', size: 9, label: T('Hotel', 'Hotel') },
              { shape: 'dot', color: '#7fb0c8', size: 9, label: T('Pensión', 'Pensión') },
              {
                shape: 'dot',
                color: '#6b8f47',
                size: 9,
                label: T('Turismo rural', 'Turismo rural'),
              },
              {
                shape: 'dot',
                color: '#c8872b',
                size: 9,
                label: T(
                  'Apartamentos e vivendas turísticas',
                  'Apartamentos y viviendas turísticas',
                ),
              },
              { shape: 'dot', color: '#6b4c8a', size: 9, label: T('Albergue', 'Albergue') },
              { shape: 'dot', color: '#7a7a2e', size: 9, label: T('Cámping', 'Camping') },
            ],
          },
        ],
      );
    }
    case 'comercio-servizos-osm': {
      const cat = ['get', 'categoria'];
      const c = [
        'match',
        cat,
        'hostalaría',
        '#c8872b',
        'alimentación',
        '#6b8f47',
        'servizos',
        '#2e6b8a',
        '#a89bb8',
      ];
      return enc(
        [
          base('circle', {
            type: 'circle',
            minzoom: 9,
            paint: {
              'circle-radius': byZoom([
                [9, 1],
                [13, 3],
                [16, 5],
              ]),
              'circle-color': c,
              'circle-opacity': 0.85,
            },
          }),
          label('label', ['get', 'nome'], 15, { layout: { 'text-size': 10 } }),
        ],
        [
          {
            entries: [
              { shape: 'dot', color: '#c8872b', size: 8, label: T('Hostalaría', 'Hostelería') },
              { shape: 'dot', color: '#6b8f47', size: 8, label: T('Alimentación', 'Alimentación') },
              {
                shape: 'dot',
                color: '#2e6b8a',
                size: 8,
                label: T(
                  'Servizos (banco, correos, farmacia…)',
                  'Servicios (banco, correos, farmacia…)',
                ),
              },
              {
                shape: 'dot',
                color: '#a89bb8',
                size: 8,
                label: T('Outros comercios', 'Otros comercios'),
              },
            ],
            note: T(
              'Desde o zoom de comarca. OpenStreetMap: o rural está menos mapeado.',
              'Desde el zoom de comarca. OpenStreetMap: el rural está menos mapeado.',
            ),
          },
        ],
      );
    }
    case 'sismos-recentes': {
      const age = num('_h', 999);
      const c = ['step', age, '#6b4c8a', 24, '#9c84b8', 24 * 7, '#c9bdd8'];
      return enc(
        [
          base('circle', {
            type: 'circle',
            paint: {
              // Area grows with magnitude; M1.5 ≈ 3 px, M4 ≈ 16 px.
              'circle-radius': interpolate(num('magnitude', 1), [
                [1, 2],
                [2, 4],
                [3, 8],
                [4, 16],
              ]),
              'circle-color': c,
              'circle-opacity': 0.55,
              'circle-stroke-color': c,
              'circle-stroke-width': 1.5,
            },
          }),
          pulse(['<', age, 24], '#6b4c8a'),
          label(
            'label',
            ['concat', 'M', ['number-format', num('magnitude'), { 'max-fraction-digits': 1 }]],
            9,
            {
              filter: ['>=', num('magnitude'), 2.5],
            },
          ),
        ],
        [
          {
            title: T('Magnitude', 'Magnitud'),
            entries: [
              { shape: 'dot', color: '#6b4c8a', size: 6, label: 'M1,5' },
              { shape: 'dot', color: '#6b4c8a', size: 16, label: 'M3' },
              { shape: 'dot', color: '#6b4c8a', size: 32, label: 'M4' },
            ],
          },
          {
            entries: [
              {
                shape: 'pulse',
                color: '#6b4c8a',
                size: 10,
                label: T('Últimas 24 horas', 'Últimas 24 horas'),
              },
              {
                shape: 'dot',
                color: '#9c84b8',
                size: 10,
                label: T('Últimos 7 días', 'Últimos 7 días'),
              },
              {
                shape: 'dot',
                color: '#c9bdd8',
                size: 10,
                label: T('Últimos 30 días', 'Últimos 30 días'),
              },
            ],
          },
        ],
        [`${layer.id}__pulse`],
      );
    }
    default:
      break;
  }

  if (layer.geometry === 'polygon') {
    return enc([
      base('fill', { type: 'fill', paint: { 'fill-color': color, 'fill-opacity': 0.25 } }),
      base('line', { type: 'line', paint: { 'line-color': color, 'line-width': 1 } }),
    ]);
  }
  if (layer.geometry === 'line') {
    return enc([base('line', { type: 'line', paint: { 'line-color': color, 'line-width': 2 } })]);
  }
  return enc([
    base('circle', {
      type: 'circle',
      paint: {
        'circle-radius': byZoom([
          [6, 3],
          [12, 6],
        ]),
        'circle-color': color,
        'circle-stroke-color': halo,
        'circle-stroke-width': 1,
      },
    }),
  ]);
}

/** Backwards-compatible wrapper: just the specs. */
export function layerStyles(layer: LayerLike, color: string, sourceLayer?: string): Spec[] {
  return encodeLayer(layer, { color, dark: false, sourceLayer }).specs;
}

/** Quantiles at 0.2, 0.4, 0.6 and 0.8 of positive values. */
export function quantiles(values: number[]): number[] {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!xs.length) return [];
  return [0.2, 0.4, 0.6, 0.8].map(
    (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] as number,
  );
}

/** Add `_h` (hours since the layer's time field) to each feature, in place. */
export function addAge(
  features: Array<{ properties: Record<string, unknown> | null }>,
  field: string,
  now: number,
): void {
  for (const f of features) {
    if (!f.properties) continue;
    const t = Date.parse(String(f.properties[field] ?? ''));
    f.properties._h = Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : null;
  }
}
