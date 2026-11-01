// /pulso/lume/: August 2025 over Galicia, pass by pass. Each satellite detection flashes when
// its pass comes and cools over three days to a dark ember that stays as the month's scar
// (engine.ts). Below, detections per day; in the panel, the last pass and a table of the
// concellos with most detections.
//
// Data: the focos-agosto-2025 layer (NASA FIRMS), served from this site.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { clock } from '../engine.ts';
import { fill, loadStyle, pickerRoom } from '../pulso.ts';
import { type Detection, ember, MONTH, passes, perDay, secondsOf, upTo } from './engine.ts';

type Dict = Record<string, string>;

const LAYER = 'focos-agosto-2025';
const SPEEDS = [60, 120, 240];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.lu-app');
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
  const productBoxes = [...app.querySelectorAll<HTMLInputElement>('[data-product]')];
  const curve = q<SVGSVGElement>('.lu-curve svg');
  const tbody = q<HTMLElement>('.lu-table tbody');
  const caption = q<HTMLElement>('.lu-table caption');
  const sources = q<HTMLElement>('.lu-sources');

  // ---- Data -------------------------------------------------------------------------------
  let all: Detection[] = [];
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      const fc = (await (await fetch(asset(`data/${LAYER}/data.geojson`))).json()) as {
        features: Array<{
          geometry: { coordinates: [number, number] };
          properties: Record<string, unknown>;
        }>;
      };
      all = fc.features
        .map((f) => ({
          t: secondsOf(String(f.properties.instante)),
          lonlat: f.geometry.coordinates,
          frp: Number(f.properties.frp),
          product: String(f.properties.produto),
          concello: String(f.properties.concello),
        }))
        .sort((a, b) => a.t - b.t);
      sources.textContent = layer.attribution;
    }
  } catch {
    // Handled below.
  }
  if (all.length === 0) {
    status.textContent = dict.fire_missing ?? '';
    return;
  }

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const dm = /^(\d{1,2})-(\d{2}):(\d{2})$/.exec(params.get('t') ?? '');
  let s = dm ? (Number(dm[1]) - 1) * 86400 + Number(dm[2]) * 3600 + Number(dm[3]) * 60 : 12 * 86400;
  const products = new Set(productBoxes.map((b) => b.dataset.product as string));
  for (const p of (params.get('sen') ?? '').split(',')) products.delete(p);
  for (const b of productBoxes) b.checked = products.has(b.dataset.product as string);
  let shown: Detection[] = [];
  let shownPasses = passes([]);
  const select = () => {
    shown = all.filter((d) => products.has(d.product));
    shownPasses = passes(shown);
  };
  select();
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;
  const stamp = (sec: number) => {
    const day = Math.floor(sec / 86400) + 1;
    return { day, time: clock(sec - (day - 1) * 86400) };
  };
  const writeHash = () => {
    const p = new URLSearchParams();
    const { day, time } = stamp(s);
    p.set('t', `${day}-${time}`);
    const hidden = productBoxes
      .map((b) => b.dataset.product as string)
      .filter((x) => !products.has(x));
    if (hidden.length) p.set('sen', hidden.join(','));
    history.replaceState(null, '', `#${p.toString()}`);
  };

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.lu-map'),
    style: await loadStyle(),
    center: [-7.6, 42.5],
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
  // Screen positions are cached and recomputed only when the map moves.
  let xy = new Float32Array(0);
  let xyStale = true;
  function project() {
    xy = new Float32Array(shown.length * 2);
    shown.forEach((d, i) => {
      const p = map.project(d.lonlat);
      xy[2 * i] = p.x;
      xy[2 * i + 1] = p.y;
    });
    xyStale = false;
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    xyStale = true;
    draw();
  }

  function draw() {
    if (xyStale) project();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const zk = 2 ** (map.getZoom() - 7);
    const n = upTo(shown, s);
    // Old embers first (cheap squares), then the recent ones with their glow, on top.
    const dot = Math.max(1.2, 1.6 * zk);
    let i = 0;
    for (; i < n; i++) {
      const age = s - (shown[i] as Detection).t;
      if (age < 72 * 3600) break;
      ctx.fillStyle = 'rgba(200, 45, 20, 0.6)';
      ctx.fillRect((xy[2 * i] as number) - dot / 2, (xy[2 * i + 1] as number) - dot / 2, dot, dot);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (; i < n; i++) {
      const d = shown[i] as Detection;
      const e = ember(s - d.t);
      const x = xy[2 * i] as number;
      const y = xy[2 * i + 1] as number;
      if (e.glow > 0) {
        const r = (3 + Math.min(9, Math.sqrt(Math.max(1, d.frp)))) * zk * e.glow;
        ctx.fillStyle = `rgba(255, 150, 40, ${(0.16 * e.glow).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${e.r | 0}, ${e.g | 0}, ${e.b | 0}, ${e.a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, dot * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    const { day, time } = stamp(s);
    clockEl.textContent = `${day} ago ${time}`;
    let last = null as (typeof shownPasses)[number] | null;
    for (const p of shownPasses) {
      if (p.t > s) break;
      last = p;
    }
    if (last && n > 0) {
      const when = stamp(last.t);
      const concellos = new Set(shown.slice(0, n).map((d) => d.concello)).size;
      nowEl.textContent = fill(dict.fire_now ?? '', {
        n: nf.format(n),
        c: nf.format(concellos),
        product: last.product,
        when: fill(dict.fire_date ?? '', { day: when.day, time: when.time }),
        k: nf.format(last.count),
      });
    } else nowEl.textContent = dict.fire_now_none ?? '';
    range.value = String(s);
    drawPlayhead();
  }

  // ---- Curve: detections per day ----------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const xOf = (sec: number) => (sec / MONTH) * W;
  const playhead = document.createElementNS(ns, 'line');
  let bars: SVGRectElement[] = [];
  function drawCurve() {
    const days = perDay(shown);
    const max = Math.max(1, ...days);
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    bars = days.map((v, i) => {
      const r = document.createElementNS(ns, 'rect');
      const h = (v / max) * (H - 26);
      r.setAttribute('x', (xOf(i * 86400) + 1).toFixed(1));
      r.setAttribute('width', (xOf(86400) - 2).toFixed(1));
      r.setAttribute('y', (H - 16 - h).toFixed(1));
      r.setAttribute('height', h.toFixed(1));
      r.setAttribute('class', 'lu-bar');
      curve.append(r);
      return r;
    });
    for (const dd of [1, 5, 10, 15, 20, 25, 31]) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', xOf((dd - 0.5) * 86400).toFixed(1));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'lu-tick');
      tx.textContent = String(dd);
      curve.append(tx);
    }
    playhead.setAttribute('class', 'lu-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H - 16));
    curve.append(playhead);
    curve.setAttribute(
      'aria-label',
      fill(dict.fire_curve_label ?? '', { max: nf.format(max), day: days.indexOf(max) + 1 }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    const x = xOf(s).toFixed(1);
    playhead.setAttribute('x1', x);
    playhead.setAttribute('x2', x);
    const today = Math.floor(s / 86400);
    bars.forEach((b, i) => {
      b.classList.toggle('is-past', i <= today);
    });
  }
  const seek = (e: PointerEvent) => {
    const r = curve.getBoundingClientRect();
    s = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (MONTH - 60));
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

  // ---- Table ------------------------------------------------------------------------------
  function table() {
    caption.textContent = fill(dict.fire_table_caption ?? '', { n: nf.format(shown.length) });
    const by = new Map<string, Detection[]>();
    for (const d of shown) {
      const list = by.get(d.concello) ?? [];
      list.push(d);
      by.set(d.concello, list);
    }
    const top = [...by.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15);
    tbody.replaceChildren(
      ...top.map(([name, ds]) => {
        const days = perDay(ds);
        const peak = days.indexOf(Math.max(...days)) + 1;
        const first = stamp((ds[0] as Detection).t);
        const tr = document.createElement('tr');
        [name, nf.format(ds.length), `${first.day}/8 ${first.time}`, `${peak}/8`].forEach(
          (text, k) => {
            const td = document.createElement(k === 0 ? 'th' : 'td');
            if (k === 0) td.setAttribute('scope', 'row');
            td.textContent = text;
            tr.append(td);
          },
        );
        return tr;
      }),
    );
  }

  // ---- Controls ---------------------------------------------------------------------------
  range.min = '0';
  range.max = String(MONTH - 60);
  range.step = '600';
  range.addEventListener('input', () => {
    s = Number(range.value);
    draw();
  });
  range.addEventListener('change', writeHash);
  let lastFrame = performance.now();
  const setPlaying = (p: boolean) => {
    playing = p;
    playBtn.textContent = p ? (dict.pulse_pause ?? '') : (dict.pulse_play ?? '');
    playBtn.setAttribute('aria-pressed', String(p));
    if (p) {
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    } else writeHash();
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));
  for (const sp of SPEEDS) {
    const o = document.createElement('option');
    o.value = String(sp);
    o.textContent = fill(dict.fire_speed_opt ?? '', { s: sp });
    speedSel.append(o);
  }
  speedSel.value = String(speed);
  speedSel.addEventListener('change', () => {
    speed = Number(speedSel.value);
  });
  for (const box of productBoxes) {
    box.addEventListener('change', () => {
      const p = box.dataset.product as string;
      if (box.checked) products.add(p);
      else products.delete(p);
      select();
      xyStale = true;
      drawCurve();
      table();
      draw();
      writeHash();
    });
  }
  function frame(now: number) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    s += (dt * MONTH) / speed;
    if (s >= MONTH - 60) s = 0;
    draw();
    requestAnimationFrame(frame);
  }
  map.on('move', () => {
    xyStale = true;
    if (!playing) draw();
  });
  new ResizeObserver(() => resize()).observe(canvas);

  status.textContent = '';
  frame_();
  resize();
  drawCurve();
  table();
  draw();
  setPlaying(playing);
}
