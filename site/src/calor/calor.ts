// /pulso/calor/: the year of the maximum temperatures (tmax-ano layer). Each day, the station
// maxima are taken to sea level with a standard lapse rate, interpolated by inverse distance
// over a grid that knows each cell's ground height (from the layer), and taken back up: valleys
// come out warm, mountains cool. The field is drawn on a canvas source under the station dots;
// between two days every value is interpolated, so the year flows. The same figures are given
// as text and as a curve of the station mean with the coldest–hottest band.

import type {
  CanvasSource,
  ExpressionSpecification,
  GeoJSONSource,
  Map as MlMap,
} from 'maplibre-gl';
import { asset } from '../paths.ts';
import { fill, loadStyle, pickerRoom } from '../pulso/pulso.ts';

type Dict = Record<string, string>;
interface Station {
  id: number;
  name: string;
  alt: number;
  lon: number;
  lat: number;
  t: Array<number | null>;
}
interface Grid {
  lon0: number;
  lat0: number;
  dlon: number;
  dlat: number;
  nx: number;
  ny: number;
  alturas: string;
}

const LAPSE = 0.0065;
/** [°C, colour] of the field and the dots. */
export const STOPS: Array<[number, string]> = [
  [0, '#313695'],
  [5, '#4575b4'],
  [10, '#74add1'],
  [15, '#abd9e9'],
  [20, '#fee090'],
  [25, '#fdae61'],
  [30, '#f46d43'],
  [35, '#d73027'],
  [40, '#a50026'],
];
/** Days per second when playing. */
const PACE = 8;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
const RGB = STOPS.map(([v, c]) => [v, ...hex(c)] as [number, number, number, number]);
export function colour(t: number): [number, number, number] {
  const first = RGB[0] as [number, number, number, number];
  if (t <= first[0]) return first.slice(1) as [number, number, number];
  for (let i = 1; i < RGB.length; i++) {
    const [b, ...cb] = RGB[i] as [number, number, number, number];
    if (t <= b) {
      const [a, ...ca] = RGB[i - 1] as [number, number, number, number];
      const f = (t - a) / (b - a);
      return [0, 1, 2].map((k) =>
        Math.round((ca[k] as number) + f * ((cb[k] as number) - (ca[k] as number))),
      ) as [number, number, number];
    }
  }
  return (RGB[RGB.length - 1] as number[]).slice(1) as [number, number, number];
}

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.ca-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const clock = q<HTMLElement>('.ca-clock');
  const nowEl = q<HTMLElement>('.ca-now');
  const detail = q<HTMLElement>('.ca-detail');
  const status = q<HTMLElement>('.ca-status');
  const range = q<HTMLInputElement>('.ca-range');
  const playBtn = q<HTMLButtonElement>('.ca-play');
  const curve = q<SVGSVGElement>('.ca-curve svg');
  const sources = q<HTMLElement>('.ca-sources');
  const months = (dict.pulse_months ?? '').split(',');

  // ---- Data -------------------------------------------------------------------------------
  let stations: Station[] = [];
  let grid: Grid | null = null;
  let year = 0;
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === 'tmax-ano');
    if (layer?.meta) {
      sources.textContent = layer.attribution;
      const fc = (await (await fetch(asset('data/tmax-ano/data.geojson'))).json()) as {
        features: Array<{
          geometry: { coordinates: [number, number] };
          properties: Record<string, unknown>;
        }>;
      };
      for (const f of fc.features) {
        const p = f.properties;
        if (p.grella) grid = p.grella as Grid;
        year = Number(p.ano);
        stations.push({
          id: Number(p.id),
          name: String(p.nome),
          alt: Number(p.altitude ?? 0),
          lon: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          t: p.tmax as Array<number | null>,
        });
      }
    }
  } catch {
    // Handled below.
  }
  if (stations.length === 0 || !grid) {
    status.textContent = dict.heat_missing ?? '';
    return;
  }
  status.textContent = '';
  stations = stations.filter((s) => s.t.some((v) => v !== null));
  const g: Grid = grid;
  q<HTMLElement>('.ca-lede').textContent = fill(dict.heat_lede ?? '', { y: year });
  const days = (stations[0] as Station).t.length;
  const heights = (() => {
    const bin = atob(g.alturas);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  })();

  // Inverse-distance weights from every inside cell to every station (fixed, computed once).
  const kx = Math.cos((42.8 * Math.PI) / 180);
  const cells: number[] = [];
  for (let k = 0; k < heights.length; k++) if ((heights[k] as number) >= 0) cells.push(k);
  const S = stations.length;
  const weights = new Float32Array(cells.length * S);
  cells.forEach((k, c) => {
    const lon = g.lon0 + ((k % g.nx) + 0.5) * g.dlon;
    const lat = g.lat0 + (Math.floor(k / g.nx) + 0.5) * g.dlat;
    stations.forEach((s, i) => {
      const d2 = ((s.lon - lon) * kx) ** 2 + (s.lat - lat) ** 2;
      weights[c * S + i] = 1 / (d2 + 1e-4) ** 1.2;
    });
  });

  // Station values of a fractional day (linear between days; missing days skipped).
  const valueAt = (s: Station, day: number): number | null => {
    const a = Math.floor(day);
    const b = Math.min(days - 1, a + 1);
    const va = s.t[a] ?? null;
    const vb = s.t[b] ?? null;
    if (va === null) return vb;
    if (vb === null) return va;
    return va + (vb - va) * (day - a);
  };

  // ---- Map --------------------------------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = g.nx;
  canvas.height = g.ny;
  const cctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = cctx.createImageData(g.nx, g.ny);

  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.ca-map'),
    style: await loadStyle(),
    center: [-8.0, 42.8],
    zoom: 7,
    minZoom: 5,
    maxZoom: 11,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  let day = 0;
  const lon1 = g.lon0 + g.nx * g.dlon;
  const lat1 = g.lat0 + g.ny * g.dlat;
  const stationsGeo = () => ({
    type: 'FeatureCollection' as const,
    features: stations.map((s) => {
      const v = valueAt(s, day);
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: { id: s.id, t: v ?? -99, has: v !== null },
      };
    }),
  });

  function drawField() {
    // Sea-level values of the stations with data this day.
    const sea = new Float32Array(S);
    const ok = new Uint8Array(S);
    stations.forEach((s, i) => {
      const v = valueAt(s, day);
      if (v !== null) {
        sea[i] = v + LAPSE * s.alt;
        ok[i] = 1;
      }
    });
    const px = image.data;
    px.fill(0);
    cells.forEach((k, c) => {
      let w = 0;
      let acc = 0;
      for (let i = 0; i < S; i++) {
        if (!ok[i]) continue;
        const wi = weights[c * S + i] as number;
        w += wi;
        acc += wi * (sea[i] as number);
      }
      if (w === 0) return;
      const t = acc / w - LAPSE * (heights[k] as number);
      const [r, gg, b] = colour(t);
      // Canvas rows run north to south; the grid, south to north.
      const x = k % g.nx;
      const y = g.ny - 1 - Math.floor(k / g.nx);
      const o = 4 * (y * g.nx + x);
      px[o] = r;
      px[o + 1] = gg;
      px[o + 2] = b;
      px[o + 3] = 235;
    });
    cctx.putImageData(image, 0, 0);
    (map.getSource('ca-field') as CanvasSource | undefined)?.play();
    (map.getSource('ca-stations') as GeoJSONSource | undefined)?.setData(stationsGeo());
    // One frame is enough: stop the canvas source re-uploading until the next draw.
    requestAnimationFrame(() => (map.getSource('ca-field') as CanvasSource | undefined)?.pause());
  }

  let added = false;
  const addLayers = () => {
    if (added || !map.isStyleLoaded()) return;
    added = true;
    // Under the labels of the basemap.
    const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
    map.addSource('ca-field', {
      type: 'canvas',
      canvas,
      animate: false,
      coordinates: [
        [g.lon0, lat1],
        [lon1, lat1],
        [lon1, g.lat0],
        [g.lon0, g.lat0],
      ],
    });
    map.addLayer(
      {
        id: 'ca-field',
        type: 'raster',
        source: 'ca-field',
        paint: { 'raster-resampling': 'linear', 'raster-opacity': 0.9 },
      },
      firstSymbol,
    );
    map.addSource('ca-stations', { type: 'geojson', data: stationsGeo() });
    const ramp: ExpressionSpecification = [
      'interpolate',
      ['linear'],
      ['get', 't'],
      ...STOPS.flat(),
    ] as unknown as ExpressionSpecification;
    map.addLayer({
      id: 'ca-stations',
      type: 'circle',
      source: 'ca-stations',
      filter: ['==', ['get', 'has'], true],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 10, 6],
        'circle-color': ramp,
        'circle-stroke-color': '#111210',
        'circle-stroke-width': 1,
      },
    });
    map.on('click', 'ca-stations', (e) => {
      const id = Number(e.features?.[0]?.properties?.id);
      picked = stations.find((s) => s.id === id) ?? null;
      renderDetail();
      drawCurve();
    });
    map.on('mouseenter', 'ca-stations', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'ca-stations', () => {
      map.getCanvas().style.cursor = '';
    });
    drawField();
  };
  for (const ev of ['styledata', 'load', 'idle'] as const) map.on(ev, addLayers);
  addLayers();

  const frame = () => {
    const panel = q<HTMLElement>('.ca-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.ca-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.ca-map').getBoundingClientRect();
    const wide = window.innerWidth >= 700;
    const bottom = fig.height + 30;
    const top = wide ? 20 : Math.min(panel.bottom - box.top + 10, box.height - bottom - 180);
    map.fitBounds(
      [
        [-9.3, 41.8],
        [-6.7, 43.8],
      ],
      {
        padding: {
          left: wide ? panel.width + 40 : 10,
          right: wide ? 60 + pickerRoom() : 10,
          top: Math.max(10, top),
          bottom,
        },
        animate: false,
      },
    );
  };
  frame();
  window.addEventListener('resize', frame);

  // ---- Text and curve ---------------------------------------------------------------------
  const dateOf = (d: number) => new Date(Date.UTC(year, 0, 1) + Math.round(d) * 86_400_000);
  const dayName = (d: number) => {
    const t = dateOf(d);
    return `${t.getUTCDate()} de ${months[t.getUTCMonth()] ?? ''}`;
  };
  const stats = Array.from({ length: days }, (_, d) => {
    const v = stations.map((s) => s.t[d]).filter((x): x is number => x !== null && x !== undefined);
    return {
      mean: v.reduce((a, b) => a + b, 0) / (v.length || 1),
      min: Math.min(...v),
      max: Math.max(...v),
    };
  });
  let picked: Station | null = null;

  function render() {
    clock.textContent = dayName(day);
    const d = Math.round(day);
    let hot: Station | null = null;
    let cold: Station | null = null;
    for (const s of stations) {
      const v = s.t[d];
      if (v === null || v === undefined) continue;
      if (!hot || v > (hot.t[d] as number)) hot = s;
      if (!cold || v < (cold.t[d] as number)) cold = s;
    }
    nowEl.textContent =
      hot && cold
        ? fill(dict.heat_now ?? '', {
            mean: nf.format(stats[d]?.mean ?? 0),
            hot: nf.format(hot.t[d] as number),
            hotName: hot.name,
            cold: nf.format(cold.t[d] as number),
            coldName: cold.name,
          })
        : '';
    range.value = String(day);
    renderDetail();
    playhead();
  }

  function renderDetail() {
    if (!picked) {
      detail.textContent = dict.heat_pick ?? '';
      return;
    }
    const v = picked.t[Math.round(day)];
    let max = -Infinity;
    let maxDay = 0;
    picked.t.forEach((x, i) => {
      if (x !== null && x > max) {
        max = x;
        maxDay = i;
      }
    });
    detail.textContent = fill(dict.heat_detail ?? '', {
      name: picked.name,
      alt: Math.round(picked.alt),
      t: v === null || v === undefined ? '–' : nf.format(v),
      max: nf.format(max),
      maxDay: dayName(maxDay),
    });
  }

  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const tMin = Math.min(0, ...stats.map((s) => s.min));
  const tMax = Math.max(40, ...stats.map((s) => s.max));
  const X = (d: number) => (d / (days - 1)) * W;
  const Y = (t: number) => H - 16 - ((t - tMin) / (tMax - tMin)) * (H - 26);
  let head: SVGLineElement | null = null;
  function drawCurve() {
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    const band = document.createElementNS(ns, 'path');
    band.setAttribute('class', 'ca-band');
    band.setAttribute(
      'd',
      `M${stats.map((s, d) => `${X(d).toFixed(1)} ${Y(s.max).toFixed(1)}`).join('L')}L${[...stats]
        .reverse()
        .map((s, i) => `${X(days - 1 - i).toFixed(1)} ${Y(s.min).toFixed(1)}`)
        .join('L')}Z`,
    );
    const mean = document.createElementNS(ns, 'path');
    mean.setAttribute('class', 'ca-mean');
    mean.setAttribute(
      'd',
      `M${stats.map((s, d) => `${X(d).toFixed(1)} ${Y(s.mean).toFixed(1)}`).join('L')}`,
    );
    curve.append(band, mean);
    if (picked) {
      const mine = document.createElementNS(ns, 'path');
      mine.setAttribute('class', 'ca-mine');
      let d = '';
      let pen = false;
      picked.t.forEach((v, i) => {
        if (v === null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
        pen = true;
      });
      mine.setAttribute('d', d);
      curve.append(mine);
    }
    for (let m = 0; m < 12; m++) {
      const d = (Date.UTC(year, m, 15) - Date.UTC(year, 0, 1)) / 86_400_000;
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('class', 'ca-tick');
      t.setAttribute('x', String(X(d)));
      t.setAttribute('y', String(H - 2));
      t.textContent = (months[m] ?? '').slice(0, 3);
      curve.append(t);
    }
    head = document.createElementNS(ns, 'line');
    head.setAttribute('class', 'ca-playhead');
    head.setAttribute('y1', '0');
    head.setAttribute('y2', String(H - 14));
    curve.append(head);
    playhead();
  }
  function playhead() {
    head?.setAttribute('x1', String(X(day)));
    head?.setAttribute('x2', String(X(day)));
  }
  const scrub = (e: PointerEvent) => {
    const r = curve.getBoundingClientRect();
    day = Math.max(0, Math.min(days - 1, ((e.clientX - r.left) / r.width) * (days - 1)));
    setPlaying(false);
    drawField();
    render();
  };
  curve.addEventListener('pointerdown', (e) => {
    curve.setPointerCapture(e.pointerId);
    scrub(e);
  });
  curve.addEventListener('pointermove', (e) => {
    if (curve.hasPointerCapture(e.pointerId)) scrub(e);
  });

  // ---- Clock ------------------------------------------------------------------------------
  range.max = String(days - 1);
  let playing = !reducedMotion.matches;
  let last: number | null = null;
  function tick(now: number) {
    if (last !== null && playing) {
      day += ((now - last) / 1000) * PACE;
      if (day > days - 1) day = 0;
      drawField();
      render();
    }
    last = now;
    if (playing) requestAnimationFrame(tick);
  }
  function setPlaying(on: boolean) {
    const was = playing;
    playing = on;
    playBtn.textContent = dict[on ? 'pulse_pause' : 'pulse_play'] ?? '';
    playBtn.setAttribute('aria-pressed', String(!on));
    last = null;
    if (on && !was) requestAnimationFrame(tick);
  }
  playBtn.addEventListener('click', () => setPlaying(!playing));
  range.addEventListener('input', () => {
    setPlaying(false);
    day = Number(range.value);
    drawField();
    render();
  });

  drawCurve();
  render();
  playing = false;
  setPlaying(!reducedMotion.matches);
}
