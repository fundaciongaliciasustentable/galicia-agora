// /pulso/crecida/: a flood seen from the rivers (crecida-episodios layer). Hour by hour, every
// river water body takes the colour and width of its gauging station's flow relative to the
// flow before the storm, the stations swell, and the day's rain sits under them as blue
// circles. Between two hours the ratios are interpolated. The same figures are given as text
// and as a curve: stations above twice their flow per hour, bars of the day's mean rain.

import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { asset } from '../paths.ts';
import { fill, loadStyle, pickerRoom } from '../pulso/pulso.ts';

type Dict = Record<string, string>;
type Geo = { type: string; coordinates: unknown };
interface Station {
  id: number;
  name: string;
  tidal: boolean;
  pos: [number, number];
  base: number | null;
  peak: number;
  peakAt: string;
  q: Array<number | null>;
  r: Array<number | null>;
}

/** [ratio, colour], log steps. */
const STOPS: Array<[number, string]> = [
  [1, '#2f6f8f'],
  [2, '#5fd3f3'],
  [5, '#ffe066'],
  [10, '#ff8a4c'],
  [30, '#ff3d6e'],
];
const UNLIT = '#2b3a44';
/** Hours played per second. */
const PACE = 4;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
export function ratioColour(r: number): string {
  const x = Math.log(Math.max(1, r));
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i] as [number, string];
    if (r <= b) {
      const [a, ca] = STOPS[i - 1] as [number, string];
      const f = (x - Math.log(a)) / (Math.log(b) - Math.log(a));
      const [p, q] = [hex(ca), hex(cb)];
      return `rgb(${p.map((v, k) => Math.round(v + f * ((q[k] as number) - v))).join(',')})`;
    }
  }
  return (STOPS[STOPS.length - 1] as [number, string])[1];
}

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.cr-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const clock = q<HTMLElement>('.cr-clock');
  const nowEl = q<HTMLElement>('.cr-now');
  const detail = q<HTMLElement>('.cr-detail');
  const status = q<HTMLElement>('.cr-status');
  const range = q<HTMLInputElement>('.cr-range');
  const playBtn = q<HTMLButtonElement>('.cr-play');
  const curve = q<SVGSVGElement>('.cr-curve svg');
  const sources = q<HTMLElement>('.cr-sources');
  q<HTMLElement>('.cr-lede').textContent = dict.flood_lede ?? '';
  const weekdays = (dict.pulse_weekdays ?? '').split(',');
  const months = (dict.pulse_months ?? '').split(',');

  // ---- Data (the latest episode) ----------------------------------------------------------
  const stations: Station[] = [];
  const rivers: Array<{ geometry: Geo; station: number | null }> = [];
  const rain: Array<{ pos: [number, number]; mm: Array<number | null> }> = [];
  let start = 0;
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === 'crecida-episodios');
    if (layer?.meta) {
      sources.textContent = layer.attribution;
      const fc = (await (await fetch(asset('data/crecida-episodios/data.geojson'))).json()) as {
        features: Array<{ geometry: Geo; properties: Record<string, unknown> }>;
      };
      const episodes = [...new Set(fc.features.map((f) => String(f.properties.episodio)))].sort();
      const latest = episodes[episodes.length - 1];
      for (const f of fc.features) {
        const p = f.properties;
        if (p.episodio !== latest) continue;
        if (p.tipo === 'estacion') {
          start = Date.parse(String(p.inicio));
          stations.push({
            id: Number(p.id),
            name: String(p.nome),
            tidal: Boolean(p.marea),
            pos: f.geometry.coordinates as [number, number],
            base: p.caudal_base as number | null,
            peak: Number(p.caudal_pico),
            peakAt: String(p.hora_pico),
            q: p.caudal as Array<number | null>,
            r: p.razon as Array<number | null>,
          });
        } else if (p.tipo === 'rio') {
          rivers.push({ geometry: f.geometry, station: (p.estacion as number | null) ?? null });
        } else if (p.tipo === 'choiva') {
          rain.push({
            pos: f.geometry.coordinates as [number, number],
            mm: p.choiva_dia as Array<number | null>,
          });
        }
      }
    }
  } catch {
    // Handled below.
  }
  if (stations.length === 0) {
    status.textContent = dict.flood_missing ?? '';
    return;
  }
  status.textContent = '';
  const hours = (stations[0] as Station).r.length;
  const byId = new Map(stations.map((s) => [s.id, s]));
  const ratioAt = (s: Station, h: number): number | null => {
    const a = Math.floor(h);
    const b = Math.min(hours - 1, a + 1);
    const ra = s.r[a] ?? null;
    const rb = s.r[b] ?? null;
    if (ra === null) return rb;
    if (rb === null) return ra;
    return ra + (rb - ra) * (h - a);
  };
  const dayOf = (h: number) => Math.min(Math.floor(h / 24), (rain[0]?.mm.length ?? 1) - 1);

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.cr-map'),
    style: await loadStyle(),
    center: [-8.2, 43.0],
    zoom: 7,
    minZoom: 5,
    maxZoom: 12,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  let hour = 0;
  let picked: Station | null = null;
  const stationsGeo = () => ({
    type: 'FeatureCollection' as const,
    features: stations.map((s) => {
      const r = ratioAt(s, hour);
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: s.pos },
        properties: {
          id: s.id,
          r: r ?? 1,
          colour: s.tidal ? '#8a8a82' : ratioColour(r ?? 1),
          tidal: s.tidal,
        },
      };
    }),
  });
  let rainDay = -1;
  const rainGeo = () => ({
    type: 'FeatureCollection' as const,
    features: rain.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: p.pos },
      properties: { mm: p.mm[dayOf(hour)] ?? 0 },
    })),
  });

  function paint() {
    if (!map.getLayer('cr-rivers')) return;
    const pairs: Array<number | string> = [];
    const widths: Array<number> = [];
    for (const s of stations) {
      if (s.tidal) continue;
      const r = ratioAt(s, hour) ?? 1;
      pairs.push(s.id, ratioColour(r));
      widths.push(s.id, 1 + Math.min(5, Math.log2(Math.max(1, r)) * 1.3));
    }
    map.setPaintProperty('cr-rivers', 'line-color', [
      'match',
      ['coalesce', ['get', 'estacion'], -1],
      ...pairs,
      UNLIT,
    ] as unknown as ExpressionSpecification);
    map.setPaintProperty('cr-rivers', 'line-width', [
      'match',
      ['coalesce', ['get', 'estacion'], -1],
      ...widths,
      0.8,
    ] as unknown as ExpressionSpecification);
    (map.getSource('cr-stations') as GeoJSONSource | undefined)?.setData(stationsGeo());
    if (dayOf(hour) !== rainDay) {
      rainDay = dayOf(hour);
      (map.getSource('cr-rain') as GeoJSONSource | undefined)?.setData(rainGeo());
    }
  }

  let added = false;
  const addLayers = () => {
    if (added || !map.isStyleLoaded()) return;
    added = true;
    map.addSource('cr-rain', { type: 'geojson', data: rainGeo() });
    map.addLayer({
      id: 'cr-rain',
      type: 'circle',
      source: 'cr-rain',
      paint: {
        'circle-radius': [
          '*',
          ['sqrt', ['get', 'mm']],
          ['interpolate', ['linear'], ['zoom'], 6, 1.6, 10, 4],
        ],
        'circle-color': '#3d8fd6',
        'circle-opacity': 0.25,
        'circle-blur': 0.6,
      },
    });
    map.addSource('cr-rivers', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: rivers.map((r) => ({
          type: 'Feature',
          geometry: r.geometry as never,
          properties: { estacion: r.station },
        })),
      },
    });
    map.addLayer({
      id: 'cr-rivers',
      type: 'line',
      source: 'cr-rivers',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': UNLIT, 'line-width': 1 },
    });
    map.addSource('cr-stations', { type: 'geojson', data: stationsGeo() });
    map.addLayer({
      id: 'cr-stations',
      type: 'circle',
      source: 'cr-stations',
      paint: {
        'circle-radius': ['+', 3, ['*', 2.2, ['ln', ['max', 1, ['get', 'r']]]]],
        'circle-color': ['get', 'colour'],
        'circle-stroke-color': '#111210',
        'circle-stroke-width': 1,
      },
    });
    map.on('click', 'cr-stations', (e) => {
      picked = byId.get(Number(e.features?.[0]?.properties?.id)) ?? null;
      renderDetail();
      drawCurve();
    });
    map.on('mouseenter', 'cr-stations', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'cr-stations', () => {
      map.getCanvas().style.cursor = '';
    });
    paint();
  };
  for (const ev of ['styledata', 'load', 'idle'] as const) map.on(ev, addLayers);
  addLayers();

  const frame = () => {
    const panel = q<HTMLElement>('.cr-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.cr-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.cr-map').getBoundingClientRect();
    const wide = window.innerWidth >= 700;
    const bottom = fig.height + 30;
    const top = wide ? 20 : Math.min(panel.bottom - box.top + 10, box.height - bottom - 180);
    map.fitBounds(
      [
        [-9.3, 42.0],
        [-7.0, 43.8],
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

  // ---- Text -------------------------------------------------------------------------------
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const when = (t: number) => {
    const p = Object.fromEntries(parts.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return `${weekdays[SHORT.indexOf(p.weekday ?? '')] ?? ''} ${Number(p.day)} de ${months[Number(p.month) - 1] ?? ''}, ${p.hour}:${p.minute}`;
  };
  const above = Array.from(
    { length: hours },
    (_, h) => stations.filter((s) => !s.tidal && (s.r[h] ?? 0) >= 2).length,
  );
  const meanRain = Array.from({ length: rain[0]?.mm.length ?? 0 }, (_, d) => {
    const v = rain.map((p) => p.mm[d]).filter((x): x is number => x !== null && x !== undefined);
    return v.reduce((a, b) => a + b, 0) / (v.length || 1);
  });

  function render() {
    clock.textContent = when(start + Math.round(hour) * 3_600_000);
    nowEl.textContent = fill(dict.flood_now ?? '', {
      n: above[Math.round(hour)] ?? 0,
      mm: nf.format(meanRain[dayOf(hour)] ?? 0),
    });
    range.value = String(hour);
    renderDetail();
    playhead();
  }

  function renderDetail() {
    if (!picked) {
      detail.textContent = dict.flood_pick ?? '';
      return;
    }
    const h = Math.round(hour);
    const text = fill(dict.flood_detail ?? '', {
      name: picked.name,
      q: picked.q[h] === null || picked.q[h] === undefined ? '–' : nf.format(picked.q[h] as number),
      r: picked.r[h] === null || picked.r[h] === undefined ? '–' : nf.format(picked.r[h] as number),
      base: picked.base === null ? '–' : nf.format(picked.base),
      peak: nf.format(picked.peak),
      when: when(Date.parse(picked.peakAt)),
    });
    detail.textContent = picked.tidal ? `${text} ${dict.flood_tidal ?? ''}` : text;
  }

  // ---- Curve ------------------------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const X = (h: number) => (h / (hours - 1)) * W;
  const maxAbove = Math.max(1, ...above);
  const maxRain = Math.max(1, ...meanRain);
  let head: SVGLineElement | null = null;
  function drawCurve() {
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    meanRain.forEach((mm, d) => {
      const rect = document.createElementNS(ns, 'rect');
      const h = (mm / maxRain) * (H - 30);
      rect.setAttribute('class', 'cr-band');
      rect.setAttribute('x', String(X(d * 24) + 2));
      rect.setAttribute('width', String(X(24) - 4));
      rect.setAttribute('y', String(H - 16 - h));
      rect.setAttribute('height', String(h));
      curve.append(rect);
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('class', 'cr-tick');
      t.setAttribute('x', String(X(d * 24 + 12)));
      t.setAttribute('y', String(H - 2));
      t.textContent = when(start + d * 86_400_000).split(',')[0] ?? '';
      curve.append(t);
    });
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('class', 'cr-mean');
    const series = picked && !picked.tidal ? picked.r.map((r) => r ?? 1) : above;
    const top = picked && !picked.tidal ? Math.max(2, ...series) : maxAbove;
    line.setAttribute(
      'd',
      `M${series.map((v, h) => `${X(h).toFixed(1)} ${(H - 16 - (v / top) * (H - 30)).toFixed(1)}`).join('L')}`,
    );
    curve.append(line);
    head = document.createElementNS(ns, 'line');
    head.setAttribute('class', 'cr-playhead');
    head.setAttribute('y1', '0');
    head.setAttribute('y2', String(H - 14));
    curve.append(head);
    playhead();
  }
  function playhead() {
    head?.setAttribute('x1', String(X(hour)));
    head?.setAttribute('x2', String(X(hour)));
  }
  const scrub = (e: PointerEvent) => {
    const r = curve.getBoundingClientRect();
    hour = Math.max(0, Math.min(hours - 1, ((e.clientX - r.left) / r.width) * (hours - 1)));
    setPlaying(false);
    paint();
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
  range.max = String(hours - 1);
  let playing = false;
  let last: number | null = null;
  function tick(now: number) {
    if (last !== null && playing) {
      hour += ((now - last) / 1000) * PACE;
      if (hour > hours - 1) hour = 0;
      paint();
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
    hour = Number(range.value);
    paint();
    render();
  });

  drawCurve();
  render();
  setPlaying(!reducedMotion.matches);
}
