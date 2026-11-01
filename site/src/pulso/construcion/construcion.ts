// /pulso/construcion/: Galicia built year by year. Every 250 m cell lights up in the year the
// Catastro gives for the buildings in it, in the colour of their use, and stays lit; what is
// older than 1900 or has no reliable year is drawn in grey from the start. Below, buildings
// per year and use; in the panel, the year's figures; a table by decade.
//
// Data: the construcion-edificios layer (counts per cell, year and use), served from this site.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { fill, loadStyle, pickerRoom } from '../pulso.ts';
import {
  byDecade,
  cellAlpha,
  decodeCells,
  decodeYear,
  mercX,
  mercY,
  type YearCells,
} from './engine.ts';

type Dict = Record<string, string>;

const LAYER = 'construcion-edificios';
/** Seconds of screen time per year. */
const SPEEDS = [0.15, 0.3, 0.6];
const COLOURS = ['#ffb35c', '#9bd17a', '#6fb2ff', '#ff7ab0', '#c9c9c0'];
const BASE_COLOUR = '#6b6b62';
/** Year buckets of the layer that are drawn from the start. */
const NO_DATE = 0;
const BEFORE = 1899;
/** Seconds the last year is held before the clock starts again. */
const HOLD = 3;
const WORLD_M = 40_075_016.686;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.co-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const nf = new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES');
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;

  const canvas = q<HTMLCanvasElement>('.lu-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const clockEl = q<HTMLElement>('.lu-clock');
  const nowEl = q<HTMLElement>('.lu-now');
  const status = q<HTMLElement>('.lu-status');
  const range = q<HTMLInputElement>('.lu-range');
  const playBtn = q<HTMLButtonElement>('.lu-play');
  const speedSel = q<HTMLSelectElement>('.lu-speed');
  const curve = q<SVGSVGElement>('.lu-curve svg');
  const tbody = q<HTMLElement>('.lu-table tbody');
  const caption = q<HTMLElement>('.lu-table caption');
  const sources = q<HTMLElement>('.lu-sources');
  const fillersEl = q<HTMLElement>('.co-fillers');

  // ---- Data -------------------------------------------------------------------------------
  let summary: Record<string, unknown> | null = null;
  let mx: Float64Array = new Float64Array(0);
  let my: Float64Array = new Float64Array(0);
  const years = new Map<number, YearCells>();
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      const fc = (await (await fetch(asset(`data/${LAYER}/data.geojson`))).json()) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      for (const { properties: p } of fc.features) {
        if (p.tipo === 'galicia') summary = p;
        else if (p.tipo === 'celas') ({ mx, my } = decodeCells(p));
        else if (p.tipo === 'ano') years.set(p.ano as number, decodeYear(p));
      }
      sources.textContent = layer.attribution;
    }
  } catch {
    summary = null;
  }
  if (!summary || mx.length === 0) {
    status.textContent = dict.build_missing ?? '';
    return;
  }
  const first = summary.ano_inicio as number;
  const last = summary.ano_fin as number;
  const perYear = summary.por_ano as Record<string, number[]>;
  const uses = summary.usos as string[];
  const series = uses.map((u) => perYear[u] ?? []);
  const totals = (series[0] ?? []).map((_, i) => series.reduce((s, ys) => s + (ys[i] ?? 0), 0));
  const cumulative: number[] = [];
  totals.reduce((s, v, i) => (cumulative[i] = s + v), 0);
  const dated = cumulative.at(-1) ?? 0;

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = Number(params.get('a'));
  let year = fromHash >= first && fromHash <= last ? fromHash : first;
  /** Fraction of the current year already shown (for the playhead and the fade-in). */
  let phase = 0;
  let hold = 0;
  let playing = !reducedMotion.matches && !(fromHash >= first);
  let speed = SPEEDS[1] as number;
  if (!playing && !(fromHash >= first)) year = last;
  const writeHash = () => history.replaceState(null, '', `#a=${year}`);

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.lu-map'),
    style: await loadStyle(),
    center: [-8.0, 42.8],
    zoom: 7,
    minZoom: 4,
    maxZoom: 14,
    // The cells are drawn in plain Web Mercator: no rotation or tilt.
    dragRotate: false,
    pitchWithRotate: false,
    maxPitch: 0,
    maxBounds: [
      [-16, 37],
      [-1.5, 48.5],
    ],
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
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
    const panel = q<HTMLElement>('.lu-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.lu-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.lu-map').getBoundingClientRect();
    const wide = window.innerWidth >= 700;
    const bottom = fig.height + 30;
    const top = wide ? 20 : Math.min(panel.bottom - box.top + 10, box.height - bottom - 180);
    map.fitBounds(
      [
        [-9.35, 41.8],
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
  // `built` holds every cell up to `builtYear`; years are added to it as the clock moves on and
  // it is repainted from scratch when the map moves or the clock goes back.
  let width = 0;
  let height = 0;
  const built = document.createElement('canvas');
  const builtCtx = built.getContext('2d') as CanvasRenderingContext2D;
  let builtYear = Number.NEGATIVE_INFINITY;
  let view = { cx: 0, cy: 0, world: 1, size: 1 };
  function measure() {
    const c = map.getCenter();
    const world = 512 * 2 ** map.getZoom();
    const metresPerPx = (WORLD_M * Math.cos((c.lat * Math.PI) / 180)) / world;
    view = { cx: mercX(c.lng), cy: mercY(c.lat), world, size: 250 / metresPerPx };
  }
  function paintCells(
    target: CanvasRenderingContext2D,
    cells: YearCells,
    colour: string | null,
    boost = 1,
  ) {
    const { cx, cy, world, size } = view;
    const s = Math.max(1, size);
    const half = s / 2;
    let current = -1;
    for (let k = 0; k < cells.c.length; k++) {
      const ci = cells.c[k] as number;
      const x = width / 2 + ((mx[ci] as number) - cx) * world;
      const y = height / 2 + ((my[ci] as number) - cy) * world;
      if (x < -s || y < -s || x > width + s || y > height + s) continue;
      const u = cells.u[k] as number;
      if (colour === null && u !== current) {
        target.fillStyle = COLOURS[u] ?? BASE_COLOUR;
        current = u;
      }
      target.globalAlpha = Math.min(1, cellAlpha(cells.n[k] as number, size) * boost);
      target.fillRect(x - half, y - half, s, s);
    }
    target.globalAlpha = 1;
  }
  function paintBuilt(to: number) {
    const dpr = window.devicePixelRatio || 1;
    builtCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (to < builtYear || !Number.isFinite(builtYear)) {
      builtCtx.clearRect(0, 0, width, height);
      builtCtx.globalCompositeOperation = 'source-over';
      builtCtx.fillStyle = BASE_COLOUR;
      for (const b of [NO_DATE, BEFORE]) {
        const cells = years.get(b);
        if (cells) paintCells(builtCtx, cells, BASE_COLOUR, 0.7);
      }
      builtYear = first - 1;
    }
    // Plain painting, not 'lighter': at the scale of Galicia many cells share a pixel and adding
    // them up turns every town white, hiding the colours of the uses.
    for (let y = builtYear + 1; y <= to; y++) {
      const cells = years.get(y);
      if (cells) paintCells(builtCtx, cells, null);
    }
    builtYear = to;
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    const dpr = window.devicePixelRatio || 1;
    for (const c of [canvas, built]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    repaint();
  }
  function repaint() {
    measure();
    builtYear = Number.NEGATIVE_INFINITY;
    draw();
  }

  function draw() {
    // Before the first layout the canvases have no size, and drawImage would throw.
    if (built.width === 0 || built.height === 0) return;
    // The current year joins `built` once it has faded in; until then it is drawn on top.
    const settled = phase >= 1 || !playing;
    paintBuilt(settled ? year : year - 1);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(built, 0, 0);
    const cells = years.get(year);
    if (cells && !settled) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      // A flash that settles to the cells' normal brightness.
      paintCells(ctx, cells, null, 1 + 2 * (1 - phase));
      ctx.globalCompositeOperation = 'source-over';
    }

    const i = year - first;
    clockEl.textContent = String(year);
    nowEl.textContent = fill(dict.build_now ?? '', {
      n: nf.format(totals[i] ?? 0),
      v: nf.format(series[0]?.[i] ?? 0),
      cum: nf.format(cumulative[i] ?? 0),
      dated: nf.format(dated),
    });
    range.value = String(year);
    drawPlayhead();
  }

  // ---- Curve: buildings per year, stacked by use ---------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const span = last - first + 1;
  const xOf = (y: number) => ((y - first) / span) * W;
  const playhead = document.createElementNS(ns, 'line');
  const columns: SVGGElement[] = [];
  function drawCurve() {
    const max = Math.max(1, ...totals);
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    totals.forEach((_, i) => {
      const g = document.createElementNS(ns, 'g');
      let top = H - 16;
      series.forEach((ys, u) => {
        const v = ys[i] ?? 0;
        if (v === 0) return;
        const h = (v / max) * (H - 26);
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', xOf(first + i).toFixed(1));
        r.setAttribute('width', Math.max(1.5, xOf(first + 1) - xOf(first) - 1).toFixed(1));
        top -= h;
        r.setAttribute('y', top.toFixed(1));
        r.setAttribute('height', h.toFixed(1));
        r.setAttribute('class', `lu-bar u${u}`);
        g.append(r);
      });
      curve.append(g);
      columns.push(g);
    });
    for (let y = Math.ceil(first / 20) * 20; y <= last; y += 20) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', xOf(y + 0.5).toFixed(1));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'lu-tick');
      tx.textContent = String(y);
      curve.append(tx);
    }
    playhead.setAttribute('class', 'lu-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H - 16));
    curve.append(playhead);
    curve.setAttribute(
      'aria-label',
      fill(dict.build_curve_label ?? '', {
        from: first,
        to: last,
        max: nf.format(max),
        year: first + totals.indexOf(max),
      }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    const x = xOf(year + 0.5).toFixed(1);
    playhead.setAttribute('x1', x);
    playhead.setAttribute('x2', x);
    columns.forEach((g, i) => {
      g.classList.toggle('is-future', first + i > year);
    });
  }
  const seek = (e: PointerEvent) => {
    const r = curve.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    year = Math.min(last, first + Math.floor(f * span));
    phase = 1;
    hold = 0;
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

  // ---- Table and notes --------------------------------------------------------------------
  function table() {
    caption.textContent = fill(dict.build_table_caption ?? '', {
      n: nf.format(dated),
      before: nf.format(summary?.antes_1900 as number),
      base: nf.format(
        (summary?.sen_ano as number) +
          (summary?.recheo as number) +
          (summary?.imposibles as number),
      ),
    });
    tbody.replaceChildren(
      ...byDecade(series, first).map(([d, row]) => {
        const tr = document.createElement('tr');
        [`${d}`, ...row.map((v) => nf.format(v))].forEach((text, k) => {
          const td = document.createElement(k === 0 ? 'th' : 'td');
          if (k === 0) td.setAttribute('scope', 'row');
          td.textContent = text;
          tr.append(td);
        });
        return tr;
      }),
    );
    // Catastro names are upper case without accents on vowels (A GUDIÑA, NIGRAN).
    const title = (s: string) =>
      s
        .toLowerCase()
        .replace(/(^|[\s(-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
    const fillers = summary?.anos_recheo as Array<{ nome: string; ano: number }>;
    const byYear = new Map<number, string[]>();
    for (const f of fillers) byYear.set(f.ano, [...(byYear.get(f.ano) ?? []), title(f.nome)]);
    fillersEl.textContent = fillers.length
      ? fill(dict.build_fillers ?? '', {
          n: nf.format(new Set(fillers.map((f) => f.nome)).size),
          list: [...byYear]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([y, names]) => `${y} (${names.join(', ')})`)
            .join('; '),
        })
      : '';
  }

  // ---- Controls ---------------------------------------------------------------------------
  range.min = String(first);
  range.max = String(last);
  range.step = '1';
  range.addEventListener('input', () => {
    year = Number(range.value);
    phase = 1;
    hold = 0;
    draw();
  });
  range.addEventListener('change', writeHash);
  let lastFrame = performance.now();
  const setPlaying = (p: boolean) => {
    playing = p;
    playBtn.textContent = p ? (dict.pulse_pause ?? '') : (dict.pulse_play ?? '');
    playBtn.setAttribute('aria-pressed', String(p));
    if (p) {
      if (year >= last && phase >= 1) {
        year = first;
        phase = 0;
      }
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    } else {
      phase = 1;
      draw();
      writeHash();
    }
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));
  for (const sp of SPEEDS) {
    const o = document.createElement('option');
    o.value = String(sp);
    o.textContent = fill(dict.build_speed_opt ?? '', { s: nf.format(sp) });
    speedSel.append(o);
  }
  speedSel.value = String(speed);
  speedSel.addEventListener('change', () => {
    speed = Number(speedSel.value);
  });
  function frame(now: number) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (year >= last && phase >= 1) {
      hold += dt;
      if (hold >= HOLD) {
        hold = 0;
        year = first;
        phase = 0;
        builtYear = Number.NEGATIVE_INFINITY;
      }
    } else {
      phase += dt / speed;
      if (phase >= 1 && year < last) {
        // Settle this year into `built` before moving on.
        paintBuilt(year);
        year += 1;
        phase = 0;
      }
    }
    draw();
    requestAnimationFrame(frame);
  }
  let pending = false;
  map.on('move', () => {
    measure();
    builtYear = Number.NEGATIVE_INFINITY;
    if (!playing && !pending) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        draw();
      });
    }
  });
  new ResizeObserver(() => resize()).observe(canvas);

  status.textContent = '';
  if (!playing) phase = 1;
  frame_();
  resize();
  drawCurve();
  table();
  draw();
  setPlaying(playing);
}
