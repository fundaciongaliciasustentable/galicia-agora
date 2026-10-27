// /pulso/: every scheduled train and bus of a working day or a Sunday, moving over a dark map.
// The network is a MapLibre line layer (GPU, pans smoothly); the vehicles are a canvas on top,
// redrawn every frame from the timetables (engine.ts). Below, the "pulse": how many vehicles
// run through the day, with the other day as an outline to compare.
//
// Everything comes from this site: basemap, glyphs and the pulso-tren / pulso-bus files.
// Times are scheduled, not real positions; the page says so.

import type { Map as MlMap, SourceSpecification, StyleSpecification } from 'maplibre-gl';
import { asset } from '../paths.ts';
import {
  clock,
  type DayKind,
  end,
  type Mode,
  positionAt,
  runningCurve,
  start as startOf,
  type Trip,
  toTrips,
} from './engine.ts';

interface Layer {
  id: string;
  attribution: string;
  meta: { status: 'fresh' | 'stale' | 'failed' } | null;
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: string; coordinates: unknown } | null;
    properties: Record<string, unknown>;
  }>;
}

type Dict = Record<string, string>;

const LAYERS: Record<Mode, string> = { tren: 'pulso-tren', bus: 'pulso-bus' };
const MODES: Mode[] = ['tren', 'bus'];
const DAYS: DayKind[] = ['laborable', 'domingo'];
/** Vehicle colours on the dark basemap: warm for rail, cool for road. */
const COLOR: Record<Mode, string> = { tren: '#ffc94d', bus: '#5fd3f3' };
/** The animated day runs from 04:00 to 04:00 the next morning (GTFS times reach 28:00). */
const T0 = 4 * 3600;
const T1 = 28 * 3600;
const STEP = 300;
/** Length of each vehicle's trail, in timetable seconds. */
const TRAIL = 9 * 60;
const SPEEDS = [45, 90, 180];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function fill(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);
}

async function loadStyle(): Promise<StyleSpecification> {
  const style = (await (await fetch(asset('style-dark.json'))).json()) as StyleSpecification;
  const origin = window.location.origin;
  // MapLibre needs absolute URLs for glyphs, sprites and pmtiles sources.
  if (style.glyphs) style.glyphs = origin + asset(style.glyphs);
  if (typeof style.sprite === 'string') style.sprite = origin + asset(style.sprite);
  for (const src of Object.values(style.sources)) {
    if ('url' in src && typeof src.url === 'string' && src.url.startsWith('pmtiles:///')) {
      src.url = `pmtiles://${origin}${asset(src.url.slice('pmtiles://'.length))}`;
    }
  }
  return style;
}

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.pu-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const nf = new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES');
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;

  const canvas = q<HTMLCanvasElement>('.pu-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const clockEl = q<HTMLElement>('.pu-clock');
  const countEl = q<HTMLElement>('.pu-count');
  const status = q<HTMLElement>('.pu-status');
  const summary = q<HTMLElement>('.pu-summary');
  const range = q<HTMLInputElement>('.pu-range');
  const playBtn = q<HTMLButtonElement>('.pu-play');
  const speedSel = q<HTMLSelectElement>('.pu-speed');
  const dayBtns = [...app.querySelectorAll<HTMLButtonElement>('[data-day]')];
  const modeBoxes = [...app.querySelectorAll<HTMLInputElement>('[data-mode]')];
  const curve = q<SVGSVGElement>('.pu-curve svg');
  const sources = q<HTMLElement>('.pu-sources');

  // ---- Data -------------------------------------------------------------------------------
  const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as { layers: Layer[] };
  const data: Partial<Record<Mode, FeatureCollection>> = {};
  const trips: Record<DayKind, Record<Mode, Trip[]>> = {
    laborable: { tren: [], bus: [] },
    domingo: { tren: [], bus: [] },
  };
  const dates: Partial<Record<DayKind, string>> = {};
  const attributions: string[] = [];
  await Promise.all(
    MODES.map(async (mode) => {
      const layer = catalog.layers.find((l) => l.id === LAYERS[mode]);
      if (!layer?.meta) return;
      try {
        const res = await fetch(asset(`data/${LAYERS[mode]}/data.geojson`));
        if (!res.ok) return;
        const fc = (await res.json()) as FeatureCollection;
        data[mode] = fc;
        for (const f of fc.features) {
          const d = f.properties.dia as DayKind;
          if (DAYS.includes(d) && typeof f.properties.data === 'string')
            dates[d] = f.properties.data;
        }
        for (const tr of toTrips(fc.features)) trips[tr.day][mode].push(tr);
        attributions.push(layer.attribution);
      } catch {
        // A missing layer leaves its mode empty; the page says which.
      }
    }),
  );
  const available = MODES.filter((m) => data[m]);
  if (available.length === 0) {
    status.textContent = dict.pulse_missing_all ?? '';
    return;
  }
  for (const m of MODES) {
    if (!data[m]) {
      const box = modeBoxes.find((b) => b.dataset.mode === m);
      if (box) {
        box.checked = false;
        box.disabled = true;
      }
    }
  }
  sources.textContent = attributions.join(' · ');
  const curves = Object.fromEntries(
    DAYS.map((d) => [
      d,
      Object.fromEntries(MODES.map((m) => [m, runningCurve(trips[d][m], STEP)])),
    ]),
  ) as Record<DayKind, Record<Mode, Int32Array>>;

  // Own names: some browsers ship without Galician locale data and fall back to Spanish.
  const fmtDate = (iso: string | undefined) => {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00Z`);
    const weekday = (dict.pulse_weekdays ?? '').split(',')[d.getUTCDay()] ?? '';
    const month = (dict.pulse_months ?? '').split(',')[d.getUTCMonth()] ?? '';
    return fill(dict.pulse_date ?? '', { weekday, day: d.getUTCDate(), month });
  };
  summary.textContent = DAYS.map((d) =>
    fill(dict.pulse_day_total ?? '', {
      dia: fmtDate(dates[d]),
      tren: nf.format(trips[d].tren.length),
      bus: nf.format(trips[d].bus.length),
    }),
  ).join(' ');
  for (const b of dayBtns) {
    const d = b.dataset.day as DayKind;
    if (dates[d]) b.title = fmtDate(dates[d]);
  }

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  let day: DayKind = params.get('d') === 'domingo' ? 'domingo' : 'laborable';
  const hm = /^(\d{2}):(\d{2})$/.exec(params.get('t') ?? '');
  let s = hm ? Number(hm[1]) * 3600 + Number(hm[2]) * 60 : 7 * 3600;
  if (s < T0) s += 86400;
  const modesParam = params.get('m');
  const enabled = new Set<Mode>(
    (modesParam ? (modesParam.split(',') as Mode[]) : available).filter((m) => data[m]),
  );
  for (const b of modeBoxes) b.checked = enabled.has(b.dataset.mode as Mode);
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;

  const writeHash = () => {
    const p = new URLSearchParams();
    if (day === 'domingo') p.set('d', 'domingo');
    p.set('t', clock(s));
    if (enabled.size !== available.length) p.set('m', [...enabled].join(','));
    history.replaceState(null, '', `#${p.toString()}`);
  };

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const narrow = window.innerWidth < 700;
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.pu-map'),
    style: await loadStyle(),
    center: narrow ? [-7.95, 42.55] : [-7.75, 42.78],
    zoom: narrow ? 6.35 : 7.25,
    // Lower than the map page: Galicia must fit beside the panel on small laptops.
    minZoom: 5,
    maxZoom: 13,
    maxBounds: [
      [-13, 40.5],
      [-4.5, 45.5],
    ],
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  // Developer aid, as on the map page: ?debug exposes the map instance in the console.
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as { gaMap?: MlMap }).gaMap = map;
  }

  map.on('load', () => {
    for (const mode of available) {
      // The same object already parsed for the animation; MapLibre takes it as GeoJSON.
      map.addSource(LAYERS[mode], {
        type: 'geojson',
        data: data[mode],
      } as unknown as SourceSpecification);
      map.addLayer({
        id: `${LAYERS[mode]}__net`,
        type: 'line',
        source: LAYERS[mode],
        paint: {
          'line-color': COLOR[mode],
          'line-opacity': mode === 'tren' ? 0.13 : 0.07,
          'line-width': mode === 'tren' ? 1 : 0.6,
        },
      });
    }
    filterNetwork();
    frame_();
    resize();
  });

  /** Fit Galicia beside the panel on wide screens, above the curve on all. */
  function frame_() {
    const panel = q<HTMLElement>('.pu-panel').getBoundingClientRect();
    const wide = window.innerWidth >= 700;
    map.fitBounds(
      [
        [-9.3, 41.8],
        [-6.7, 43.8],
      ],
      {
        padding: {
          left: wide ? panel.width + 40 : 12,
          right: wide ? 60 : 12,
          top: wide ? 20 : panel.height + 12,
          bottom: wide ? 150 : 110,
        },
        animate: false,
      },
    );
  }
  function filterNetwork() {
    for (const mode of available) {
      const id = `${LAYERS[mode]}__net`;
      if (!map.getLayer(id)) continue;
      map.setFilter(id, ['==', ['get', 'dia'], day]);
      map.setLayoutProperty(id, 'visibility', enabled.has(mode) ? 'visible' : 'none');
    }
  }

  // ---- Drawing ----------------------------------------------------------------------------
  let width = 0;
  let height = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw();
  }

  function running(mode: Mode): number {
    let n = 0;
    for (const tr of trips[day][mode]) {
      if (startOf(tr) > s) break; // sorted by start
      if (end(tr) >= s) n++;
    }
    return n;
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const zoom = map.getZoom();
    const head = Math.max(1.6, (zoom - 5) * 0.9);
    for (const mode of MODES) {
      if (!enabled.has(mode)) continue;
      const col = COLOR[mode];
      const r = mode === 'tren' ? head * 1.5 : head;
      for (const tr of trips[day][mode]) {
        if (startOf(tr) > s) break;
        if (end(tr) < s) continue;
        const p = positionAt(tr, s);
        if (!p) continue;
        const a = map.project(p);
        const tailLl = positionAt(tr, Math.max(startOf(tr), s - TRAIL));
        if (tailLl) {
          const b = map.project(tailLl);
          const g = ctx.createLinearGradient(b.x, b.y, a.x, a.y);
          g.addColorStop(0, `${col}00`);
          g.addColorStop(1, `${col}aa`);
          ctx.strokeStyle = g;
          ctx.lineWidth = r * 0.9;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(a.x, a.y);
          ctx.stroke();
        }
        // Halo, then the head: a cheap glow (shadowBlur is too slow for a thousand vehicles).
        ctx.fillStyle = `${col}33`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    clockEl.textContent = clock(s);
    countEl.textContent = fill(dict.pulse_running ?? '', {
      tren: nf.format(enabled.has('tren') ? running('tren') : 0),
      bus: nf.format(enabled.has('bus') ? running('bus') : 0),
    });
    range.value = String(s);
    drawPlayhead();
  }

  // ---- Pulse curve ------------------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const xOf = (sec: number) => ((sec - T0) / (T1 - T0)) * W;
  const playhead = document.createElementNS(ns, 'line');
  function drawCurve() {
    const sum = (d: DayKind) => {
      const a = curves[d].tren;
      const out = new Float64Array(a.length);
      for (const m of MODES) {
        if (!enabled.has(m)) continue;
        const c = curves[d][m];
        for (let i = 0; i < c.length; i++) out[i] = (out[i] as number) + (c[i] as number);
      }
      return out;
    };
    const cur = sum(day);
    const other = sum(day === 'laborable' ? 'domingo' : 'laborable');
    const max = Math.max(1, ...cur, ...other);
    const path = (vals: Float64Array, close: boolean) => {
      let d = '';
      for (let i = T0 / STEP; i <= T1 / STEP; i++) {
        const x = xOf(i * STEP);
        const y = H - ((vals[i] ?? 0) / max) * (H - 18);
        d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return close ? `${d}L${W} ${H}L0 ${H}Z` : d;
    };
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', path(cur, true));
    area.setAttribute('class', 'pu-area');
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', path(other, false));
    line.setAttribute('class', 'pu-other');
    curve.append(area, line);
    for (let h = 6; h <= 27; h += 3) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', String(xOf(h * 3600)));
      tx.setAttribute('y', String(H - 4));
      tx.setAttribute('class', 'pu-tick');
      tx.textContent = clock(h * 3600);
      curve.append(tx);
    }
    playhead.setAttribute('class', 'pu-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H));
    curve.append(playhead);
    const peak = Math.max(...cur);
    curve.setAttribute(
      'aria-label',
      fill(dict.pulse_curve_label ?? '', { max: nf.format(peak), dia: fmtDate(dates[day]) }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    const x = xOf(s).toFixed(1);
    playhead.setAttribute('x1', x);
    playhead.setAttribute('x2', x);
  }
  function seekFromCurve(e: PointerEvent) {
    const r = curve.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    s = Math.round(T0 + f * (T1 - T0));
    draw();
  }
  curve.addEventListener('pointerdown', (e) => {
    curve.setPointerCapture(e.pointerId);
    seekFromCurve(e);
  });
  curve.addEventListener('pointermove', (e) => {
    if (curve.hasPointerCapture(e.pointerId)) seekFromCurve(e);
  });
  curve.addEventListener('pointerup', () => writeHash());

  // ---- Controls ---------------------------------------------------------------------------
  range.min = String(T0);
  range.max = String(T1);
  range.step = '60';
  range.addEventListener('input', () => {
    s = Number(range.value);
    draw();
  });
  range.addEventListener('change', writeHash);

  const setPlaying = (p: boolean) => {
    playing = p;
    playBtn.textContent = p ? (dict.pulse_pause ?? '') : (dict.pulse_play ?? '');
    playBtn.setAttribute('aria-pressed', String(p));
    if (p) {
      last = performance.now();
      requestAnimationFrame(frame);
    } else writeHash();
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));

  for (const sp of SPEEDS) {
    speedSel.append(
      el('option', { value: String(sp) }, fill(dict.pulse_speed_opt ?? '', { s: sp })),
    );
  }
  speedSel.value = String(speed);
  speedSel.addEventListener('change', () => {
    speed = Number(speedSel.value);
  });

  const setDay = (d: DayKind) => {
    day = d;
    for (const b of dayBtns) b.setAttribute('aria-pressed', String(b.dataset.day === d));
    filterNetwork();
    drawCurve();
    draw();
    writeHash();
  };
  for (const b of dayBtns) b.addEventListener('click', () => setDay(b.dataset.day as DayKind));
  for (const box of modeBoxes) {
    box.addEventListener('change', () => {
      const m = box.dataset.mode as Mode;
      if (box.checked) enabled.add(m);
      else enabled.delete(m);
      filterNetwork();
      drawCurve();
      draw();
      writeHash();
    });
  }
  app.addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      setPlaying(!playing);
    }
  });

  // ---- Loop -------------------------------------------------------------------------------
  let last = performance.now();
  function frame(now: number) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // `speed` seconds of real time for the whole 24-hour day.
    s += (dt * (T1 - T0)) / speed;
    if (s > T1) s = T0;
    draw();
    requestAnimationFrame(frame);
  }
  map.on('move', () => {
    if (!playing) draw();
  });
  new ResizeObserver(() => resize()).observe(canvas);

  status.textContent = '';
  setDay(day);
  setPlaying(playing);
}
