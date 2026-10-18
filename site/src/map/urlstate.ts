// Shareable map state in the URL hash: #map=<zoom>/<lat>/<lon>&capas=a,b

export interface MapState {
  zoom: number;
  lat: number;
  lon: number;
  layers: string[];
}

export const DEFAULT_STATE: MapState = { zoom: 7.2, lat: 42.75, lon: -8.0, layers: [] };

export function parseHash(hash: string): MapState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: MapState = { ...DEFAULT_STATE, layers: [] };
  const m = params.get('map')?.split('/').map(Number);
  if (m && m.length === 3 && m.every(Number.isFinite)) {
    const [zoom = state.zoom, lat = state.lat, lon = state.lon] = m;
    if (lat >= 35 && lat <= 50 && lon >= -20 && lon <= 0) Object.assign(state, { zoom, lat, lon });
  }
  const capas = params.get('capas');
  if (capas) state.layers = capas.split(',').filter((s) => /^[a-z0-9-]+$/.test(s));
  return state;
}

export function formatHash(s: MapState): string {
  const parts = [`map=${s.zoom.toFixed(2)}/${s.lat.toFixed(4)}/${s.lon.toFixed(4)}`];
  if (s.layers.length) parts.push(`capas=${s.layers.join(',')}`);
  return `#${parts.join('&')}`;
}

export function readHash(): MapState {
  return parseHash(window.location.hash);
}

export function writeHash(s: MapState): void {
  const next = formatHash(s);
  if (next !== window.location.hash) history.replaceState(null, '', next);
}
