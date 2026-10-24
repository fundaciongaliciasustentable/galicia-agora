// MapLibre layer specs per catalogue layer. `sourceLayer` is set when the
// layer is served as PMTiles (vector source) instead of GeoJSON.

interface LayerLike {
  id: string;
  geometry: string;
  style: { kind: string; label_field?: string };
}

type Spec = Record<string, unknown>;

export function layerStyles(layer: LayerLike, color: string, sourceLayer?: string): Spec[] {
  const base = (suffix: string, extra: Spec): Spec => ({
    id: `${layer.id}__${suffix}`,
    source: layer.id,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
    ...extra,
  });

  switch (layer.id) {
    case 'concellos-parroquias':
      return [
        base('parroquias', {
          type: 'line',
          filter: ['==', ['get', 'nivel'], 'parroquia'],
          minzoom: 9,
          paint: {
            'line-color': color,
            'line-width': 0.6,
            'line-opacity': 0.7,
            'line-dasharray': [2, 2],
          },
        }),
        base('concellos', {
          type: 'line',
          filter: ['==', ['get', 'nivel'], 'concello'],
          paint: {
            'line-color': color,
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 12, 2],
          },
        }),
        base('fill', {
          // Invisible fill so clicks inside a parroquia or concello hit it.
          type: 'fill',
          filter: ['==', ['get', 'nivel'], 'parroquia'],
          paint: { 'fill-color': color, 'fill-opacity': 0.01 },
        }),
      ];
    case 'calidade-aire':
      return [
        base('circle', {
          type: 'circle',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 12, 9],
            'circle-color': ['coalesce', ['get', 'cor'], color],
            'circle-stroke-color': color,
            'circle-stroke-width': 1.5,
          },
        }),
      ];
    case 'estacions-meteo':
      return [
        base('circle', {
          type: 'circle',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 12, 6],
            'circle-color': color,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        }),
        base('label', {
          type: 'symbol',
          minzoom: 8,
          filter: ['has', 'temperatura'],
          layout: {
            'text-field': ['concat', ['to-string', ['round', ['get', 'temperatura']]], '°'],
            'text-font': ['Noto Sans Medium'],
            'text-size': 12,
            'text-offset': [0, -1.1],
          },
          paint: { 'text-color': color, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        }),
      ];
    case 'tren':
      return [
        base('circle', {
          type: 'circle',
          paint: {
            'circle-radius': 6,
            'circle-color': color,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        }),
      ];
    case 'caudais-rios':
      return [
        base('circle', {
          type: 'circle',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 12, 7],
            'circle-color': color,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        }),
      ];
    case 'buses-xunta':
      return [
        base('circle', {
          type: 'circle',
          minzoom: 9,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 14, 5],
            'circle-color': color,
            'circle-opacity': 0.8,
          },
        }),
      ];
    case 'sismos-recentes':
      return [
        base('circle', {
          type: 'circle',
          paint: {
            // Area grows with magnitude; M1.5 ≈ 3 px, M4 ≈ 14 px.
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'magnitude'], 1],
              1,
              2,
              4,
              14,
            ],
            'circle-color': color,
            'circle-opacity': 0.55,
            'circle-stroke-color': color,
            'circle-stroke-width': 1.5,
          },
        }),
      ];
    case 'raios':
      return [
        base('circle', {
          type: 'circle',
          paint: {
            'circle-radius': 4,
            'circle-color': color,
            'circle-stroke-color': '#1a1a17',
            'circle-stroke-width': 0.8,
          },
        }),
      ];
    case 'avisos-aemet':
      return [
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
            'fill-opacity': 0.45,
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
      ];
    case 'focos-calor':
      return [
        base('circle', {
          type: 'circle',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 12, 8],
            'circle-color': color,
            'circle-opacity': 0.85,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        }),
      ];
    default:
      break;
  }

  if (layer.geometry === 'polygon') {
    return [
      base('fill', { type: 'fill', paint: { 'fill-color': color, 'fill-opacity': 0.25 } }),
      base('line', { type: 'line', paint: { 'line-color': color, 'line-width': 1 } }),
    ];
  }
  if (layer.geometry === 'line') {
    return [base('line', { type: 'line', paint: { 'line-color': color, 'line-width': 2 } })];
  }
  return [
    base('circle', {
      type: 'circle',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 12, 6],
        'circle-color': color,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    }),
  ];
}
