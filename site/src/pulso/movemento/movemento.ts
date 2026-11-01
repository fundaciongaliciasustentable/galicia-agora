// /pulso/movemento/: trips between Galician zones through a mean Wednesday or Sunday.
// MapLibre draws the dark basemap and the faint network of flows; a canvas on top draws the
// particles (engine.ts), each 100 trips, on a curved lane per direction. Below, trips per hour
// for the day with the other day dashed; in the panel, a table of the largest flows.
//
// Data: the mobilidade-fluxos layer (MITMA, May 2025), served from this site.

import type { Map as MlMap, SourceSpecification } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { clock } from '../engine.ts';
import { fill, loadStyle, pickerRoom } from '../pulso.ts';
import { along, DAY, type DayKind, type Flow, hourlyTotals, progressAt } from './engine.ts';

interface Feature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [[number, number], [number, number]] };
  properties: {
    orixe: string;
    destino: string;
    nome_orixe: string;
    nome_destino: string;
    distancia_km: number;
    viaxes_mercores: number;
    viaxes_domingo: number;
    mercores: number[];
    domingo: number[];
  };
}

type Dict = Record<string, string>;

const LAYER = 'mobilidade-fluxos';
const COLOUR = '#5fd3f3';
const SPEEDS = [45, 90, 180];
const TABLE_ROWS = 20;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.mv-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const nf = new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES');
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;

  const canvas = q<HTMLCanvasElement>('.mv-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const clockEl = q<HTMLElement>('.mv-clock');
  const nowEl = q<HTMLElement>('.mv-now');
  const status = q<HTMLElement>('.mv-status');
  const range = q<HTMLInputElement>('.mv-range');
  const playBtn = q<HTMLButtonElement>('.mv-play');
  const speedSel = q<HTMLSelectElement>('.mv-speed');
  const dayBtns = [...app.querySelectorAll<HTMLButtonElement>('[data-day]')];
  const curve = q<SVGSVGElement>('.mv-curve svg');
  const tbody = q<HTMLElement>('.mv-table tbody');
  const caption = q<HTMLElement>('.mv-table caption');
  const sources = q<HTMLElement>('.mv-sources');

  // ---- Data -------------------------------------------------------------------------------
  let fc: { type: 'FeatureCollection'; features: Feature[] } | null = null;
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      fc = await (await fetch(asset(`data/${LAYER}/data.geojson`))).json();
      sources.textContent = layer.attribution;
    }
  } catch {
    // Handled below.
  }
  if (!fc || fc.features.length === 0) {
    status.textContent = dict.moves_missing ?? '';
    return;
  }
  const features = fc.features;
  const flows: Flow[] = features.map((f) => ({
    from: f.geometry.coordinates[0],
    to: f.geometry.coordinates[1],
    km: f.properties.distancia_km,
    hours: { mercores: f.properties.mercores, domingo: f.properties.domingo },
  }));
  const totals = {
    mercores: hourlyTotals(flows, 'mercores'),
    domingo: hourlyTotals(flows, 'domingo'),
  };

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  let day: DayKind = params.get('d') === 'domingo' ? 'domingo' : 'mercores';
  const hm = /^(\d{2}):(\d{2})$/.exec(params.get('t') ?? '');
  let s = hm ? Number(hm[1]) * 3600 + Number(hm[2]) * 60 : 7 * 3600;
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;
  const writeHash = () => {
    const p = new URLSearchParams();
    if (day === 'domingo') p.set('d', 'domingo');
    p.set('t', clock(s));
    history.replaceState(null, '', `#${p.toString()}`);
  };

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.mv-map'),
    style: await loadStyle(),
    center: [-8.0, 42.8],
    zoom: 7,
    minZoom: 4,
    maxZoom: 12,
    // Wide enough vertically for a tall phone to zoom out to the whole of Galicia.
    maxBounds: [
      [-16, 37],
      [-1.5, 48.5],
    ],
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as { gaMap?: MlMap }).gaMap = map;
  }
  map.on('load', () => {
    map.addSource(LAYER, { type: 'geojson', data: fc } as unknown as SourceSpecification);
    map.addLayer({
      id: `${LAYER}__net`,
      type: 'line',
      source: LAYER,
      paint: {
        'line-color': COLOUR,
        // Faint, stronger where more people travel on the day shown.
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['get', 'viaxes_mercores'],
          50,
          0.03,
          5000,
          0.25,
        ],
        'line-width': ['interpolate', ['linear'], ['get', 'viaxes_mercores'], 50, 0.4, 5000, 1.6],
      },
    });
    setNetwork();
  });
  function setNetwork() {
    const id = `${LAYER}__net`;
    if (!map.getLayer(id)) return;
    const key = day === 'mercores' ? 'viaxes_mercores' : 'viaxes_domingo';
    map.setPaintProperty(id, 'line-opacity', [
      'interpolate',
      ['linear'],
      ['get', key],
      50,
      0.03,
      5000,
      0.25,
    ]);
    map.setPaintProperty(id, 'line-width', [
      'interpolate',
      ['linear'],
      ['get', key],
      50,
      0.4,
      5000,
      1.6,
    ]);
  }

  let userMoved = false;
  map.on('movestart', (e) => {
    if ((e as { originalEvent?: unknown }).originalEvent) userMoved = true;
  });
  let reframe = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(reframe);
    reframe = window.setTimeout(() => {
      if (!userMoved) frame_();
    }, 200);
  });
  void document.fonts.ready.then(() => {
    if (!userMoved) frame_();
  });
  function frame_() {
    const panel = q<HTMLElement>('.mv-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.mv-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.mv-map').getBoundingClientRect();
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

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    const zoom = map.getZoom();
    const r = Math.max(1, (zoom - 5) * 0.75);
    ctx.fillStyle = COLOUR;
    for (const [i, f] of flows.entries()) {
      const ps = progressAt(f.hours[day], f.km, s, i + 1);
      if (ps.length === 0) continue;
      // Project the ends once; the curve is drawn in screen space.
      const a = map.project(f.from);
      const b = map.project(f.to);
      const pa: [number, number] = [a.x, a.y];
      const pb: [number, number] = [b.x, b.y];
      for (const p of ps) {
        const [x, y] = along(pa, pb, p);
        const fade = Math.min(1, p * 6, (1 - p) * 6);
        ctx.globalAlpha = 0.18 * fade;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9 * fade;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    clockEl.textContent = clock(s);
    const hour = Math.min(23, Math.floor(s / 3600));
    nowEl.textContent = fill(dict.moves_now ?? '', { n: nf.format(totals[day][hour] ?? 0) });
    range.value = String(s);
    drawPlayhead();
  }

  // ---- Curve ------------------------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const xOf = (sec: number) => (sec / DAY) * W;
  const playhead = document.createElementNS(ns, 'line');
  function drawCurve() {
    const cur = totals[day];
    const other = totals[day === 'mercores' ? 'domingo' : 'mercores'];
    const max = Math.max(1, ...cur, ...other);
    // One value per hour, drawn as a step at the middle of its hour.
    const path = (vals: number[], close: boolean) => {
      let d = '';
      vals.forEach((v, h) => {
        const y = H - 16 - (v / max) * (H - 26);
        d += `${d ? 'L' : 'M'}${xOf(h * 3600).toFixed(1)} ${y.toFixed(1)}L${xOf((h + 1) * 3600).toFixed(1)} ${y.toFixed(1)}`;
      });
      return close ? `${d}L${W} ${H - 16}L0 ${H - 16}Z` : d;
    };
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', path(cur, true));
    area.setAttribute('class', 'mv-area');
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', path(other, false));
    line.setAttribute('class', 'mv-other');
    curve.replaceChildren(area, line);
    for (let h = 0; h <= 24; h += 3) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', String(Math.min(W - 14, Math.max(14, xOf(h * 3600)))));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'mv-tick');
      tx.textContent = clock(h * 3600);
      curve.append(tx);
    }
    playhead.setAttribute('class', 'mv-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H - 16));
    curve.append(playhead);
    const peak = Math.max(...cur);
    curve.setAttribute(
      'aria-label',
      fill(dict.moves_curve_label ?? '', {
        dia: ((day === 'mercores' ? dict.pulse_weekday : dict.pulse_sunday) ?? '').toLowerCase(),
        max: nf.format(peak),
        hour: clock(cur.indexOf(peak) * 3600),
      }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    const x = xOf(s).toFixed(1);
    playhead.setAttribute('x1', x);
    playhead.setAttribute('x2', x);
  }
  const seek = (e: PointerEvent) => {
    const r = curve.getBoundingClientRect();
    s = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * DAY);
    draw();
  };
  curve.addEventListener('pointerdown', (e) => {
    curve.setPointerCapture(e.pointerId);
    seek(e);
  });
  curve.addEventListener('pointermove', (e) => {
    if (curve.hasPointerCapture(e.pointerId)) seek(e);
  });
  curve.addEventListener('pointerup', () => writeHash());

  // ---- Table: largest relations, both directions together -----------------------------------
  function table() {
    const dayName = (
      (day === 'mercores' ? dict.pulse_weekday : dict.pulse_sunday) ?? ''
    ).toLowerCase();
    caption.textContent = fill(dict.moves_table_caption ?? '', { dia: dayName });
    const pairs = new Map<string, { names: [string, string]; km: number; hours: number[] }>();
    for (const f of features) {
      const p = f.properties;
      const [a, b] = [p.orixe, p.destino].sort() as [string, string];
      const key = `${a}|${b}`;
      const names: [string, string] =
        a === p.orixe ? [p.nome_orixe, p.nome_destino] : [p.nome_destino, p.nome_orixe];
      const entry = pairs.get(key) ?? { names, km: p.distancia_km, hours: Array(24).fill(0) };
      p[day].forEach((v, h) => {
        entry.hours[h] = (entry.hours[h] ?? 0) + v;
      });
      pairs.set(key, entry);
    }
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const top = [...pairs.values()]
      .sort((x, y) => sum(y.hours) - sum(x.hours))
      .slice(0, TABLE_ROWS);
    tbody.replaceChildren(
      ...top.map((e) => {
        const tr = document.createElement('tr');
        const peak = Math.max(...e.hours);
        const cells = [
          `${e.names[0]} ↔ ${e.names[1]}`,
          nf.format(Math.round(e.km)),
          nf.format(sum(e.hours)),
          clock(e.hours.indexOf(peak) * 3600),
        ];
        cells.forEach((text, i) => {
          const td = document.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.setAttribute('scope', 'row');
          td.textContent = text;
          tr.append(td);
        });
        return tr;
      }),
    );
  }

  // ---- Controls ---------------------------------------------------------------------------
  range.min = '0';
  range.max = String(DAY);
  range.step = '60';
  range.addEventListener('input', () => {
    s = Number(range.value);
    draw();
  });
  range.addEventListener('change', writeHash);

  let last = performance.now();
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
    const o = document.createElement('option');
    o.value = String(sp);
    o.textContent = fill(dict.pulse_speed_opt ?? '', { s: sp });
    speedSel.append(o);
  }
  speedSel.value = String(speed);
  speedSel.addEventListener('change', () => {
    speed = Number(speedSel.value);
  });

  const refresh = () => {
    for (const b of dayBtns) b.setAttribute('aria-pressed', String(b.dataset.day === day));
    setNetwork();
    drawCurve();
    table();
    draw();
    writeHash();
  };
  for (const b of dayBtns)
    b.addEventListener('click', () => {
      day = b.dataset.day as DayKind;
      refresh();
    });

  function frame(now: number) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    s += (dt * DAY) / speed;
    if (s > DAY) s = 0;
    draw();
    requestAnimationFrame(frame);
  }
  map.on('move', () => {
    if (!playing) draw();
  });
  new ResizeObserver(() => resize()).observe(canvas);

  status.textContent = '';
  frame_();
  resize();
  refresh();
  setPlaying(playing);
}
