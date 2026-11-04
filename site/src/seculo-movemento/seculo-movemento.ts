// /pulso/seculo-movemento/: a century in motion. One dot per DOT people in every concello at
// every census from 1900 to 2021 (seculo-movemento layer), placed on the places where its people
// live today. Between two censuses each concello keeps the dots it still has; the dots a losing
// concello no longer has slide to the nearest concello that gains, while unmatched ones fade
// (emigration, more deaths than births) and missing ones appear. A second view draws spikes of
// each concello's population. The same figures are given as text and as census bars.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../paths.ts';
import { fill, loadStyle, pickerRoom } from '../pulso/pulso.ts';

type Dict = Record<string, string>;
interface Concello {
  code: string;
  centre: [number, number];
  pop: Array<number | null>;
  anchors: Array<[number, number, number]>;
  /** Cumulative anchor weights, for picking. */
  cum: number[];
}
interface Move {
  from: [number, number];
  to: [number, number];
}
interface Step {
  stay: Array<[number, number]>;
  moves: Move[];
  gone: Array<[number, number]>;
  fresh: Array<[number, number]>;
}

const DOT = 1000;
/** Seconds held on a census, then seconds moving to the next. */
const HOLD = 1.2;
const MOVE = 2.6;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Deterministic pseudo-random in [0, 1) for a concello and a dot. */
function rand(seed: string, i: number, salt: number): number {
  let h = 2166136261 ^ (i * 374761393) ^ (salt * 668265263);
  for (let k = 0; k < seed.length; k++) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

/** Position of dot `i` of a concello: a weighted place plus a little jitter (~600 m). */
function dotAt(c: Concello, i: number): [number, number] {
  const total = c.cum[c.cum.length - 1] as number;
  const r = rand(c.code, i, 1) * total;
  let k = 0;
  while (k < c.cum.length - 1 && (c.cum[k] as number) < r) k++;
  const [lon, lat] = c.anchors[k] as [number, number, number];
  const a = rand(c.code, i, 2) * Math.PI * 2;
  const d = Math.sqrt(rand(c.code, i, 3)) * 0.006;
  return [lon + (Math.cos(a) * d) / 0.73, lat + Math.sin(a) * d];
}

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.mo-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const nf = new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES');
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const canvas = q<HTMLCanvasElement>('.mo-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const clock = q<HTMLElement>('.mo-clock');
  const nowEl = q<HTMLElement>('.mo-now');
  const detail = q<HTMLElement>('.mo-detail');
  const status = q<HTMLElement>('.mo-status');
  const range = q<HTMLInputElement>('.mo-range');
  const playBtn = q<HTMLButtonElement>('.mo-play');
  const curve = q<SVGSVGElement>('.mo-curve svg');
  const sources = q<HTMLElement>('.mo-sources');
  q<HTMLElement>('.mo-lede').textContent = dict.move_lede ?? '';

  // ---- Data -------------------------------------------------------------------------------
  const concellos: Concello[] = [];
  let years: number[] = [];
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === 'seculo-movemento');
    if (layer?.meta) {
      sources.textContent = layer.attribution;
      const fc = (await (await fetch(asset('data/seculo-movemento/data.geojson'))).json()) as {
        features: Array<{
          geometry: { coordinates: [number, number] };
          properties: Record<string, unknown>;
        }>;
      };
      for (const f of fc.features) {
        const p = f.properties;
        years = p.censos as number[];
        const anchors = p.anclas as Array<[number, number, number]>;
        let acc = 0;
        concellos.push({
          code: String(p.codigo_ine),
          centre: f.geometry.coordinates,
          pop: p.poboacion as Array<number | null>,
          anchors,
          cum: anchors.map((a) => (acc += a[2])),
        });
      }
    }
  } catch {
    // Handled below.
  }
  if (concellos.length === 0 || years.length < 2) {
    status.textContent = dict.move_missing ?? '';
    return;
  }
  status.textContent = '';
  const dots = (c: Concello, k: number) => Math.round((c.pop[k] ?? 0) / DOT);
  const galicia = years.map((_, k) => concellos.reduce((s, c) => s + (c.pop[k] ?? 0), 0));

  // Every step between two censuses: stays, moves (nearest gaining concello), fades.
  const kx = Math.cos((42.8 * Math.PI) / 180);
  const steps: Step[] = years.slice(0, -1).map((_, k) => {
    const stay: Array<[number, number]> = [];
    const losers: Array<[number, number]> = [];
    const gains: Array<[number, number]> = [];
    for (const c of concellos) {
      const a = dots(c, k);
      const b = dots(c, k + 1);
      for (let i = 0; i < Math.min(a, b); i++) stay.push(dotAt(c, i));
      for (let i = b; i < a; i++) losers.push(dotAt(c, i));
      for (let i = a; i < b; i++) gains.push(dotAt(c, i));
    }
    // Greedy nearest pairing, the shortest moves first.
    const pairs: Array<[number, number, number]> = [];
    losers.forEach((l, i) => {
      gains.forEach((g, j) => {
        pairs.push([((l[0] - g[0]) * kx) ** 2 + (l[1] - g[1]) ** 2, i, j]);
      });
    });
    pairs.sort((x, y) => x[0] - y[0]);
    const usedL = new Uint8Array(losers.length);
    const usedG = new Uint8Array(gains.length);
    const moves: Move[] = [];
    for (const [, i, j] of pairs) {
      if (usedL[i] || usedG[j]) continue;
      usedL[i] = 1;
      usedG[j] = 1;
      moves.push({ from: losers[i] as [number, number], to: gains[j] as [number, number] });
      if (moves.length === Math.min(losers.length, gains.length)) break;
    }
    return {
      stay,
      moves,
      gone: losers.filter((_, i) => !usedL[i]),
      fresh: gains.filter((_, j) => !usedG[j]),
    };
  });

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.mo-map'),
    style: await loadStyle(),
    center: [-8.0, 42.8],
    zoom: 7,
    minZoom: 5,
    maxZoom: 11,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  const frame = () => {
    const panel = q<HTMLElement>('.mo-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.mo-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.mo-map').getBoundingClientRect();
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

  // ---- Drawing ----------------------------------------------------------------------------
  let view: 'puntos' | 'agullas' = 'puntos';
  /** Position on the clock: census index plus the fraction of the move to the next one. */
  let pos = 0;
  let width = 0;
  let height = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  const px = (p: [number, number]) => map.project(p);

  function drawDots() {
    const k = Math.min(steps.length - 1, Math.floor(pos));
    const f = pos >= years.length - 1 ? 1 : ease(pos - k);
    const step = steps[k] as Step;
    const r = Math.max(1, 0.9 * 2 ** ((map.getZoom() - 7) / 2));
    const dot = (p: [number, number], colour: string) => {
      const s = px(p);
      ctx.fillStyle = colour;
      ctx.fillRect(s.x - r, s.y - r, 2 * r, 2 * r);
    };
    for (const p of step.stay) dot(p, 'rgba(242, 230, 201, 0.85)');
    for (const p of step.gone) dot(p, `rgba(242, 230, 201, ${(0.85 * (1 - f)).toFixed(3)})`);
    for (const p of step.fresh) dot(p, `rgba(242, 230, 201, ${(0.85 * f).toFixed(3)})`);
    ctx.lineWidth = 0.6;
    for (const m of step.moves) {
      const a = px(m.from);
      const b = px(m.to);
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      if (f > 0 && f < 1) {
        ctx.strokeStyle = 'rgba(255, 179, 92, 0.25)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.fillStyle = f > 0 && f < 1 ? 'rgba(255, 179, 92, 0.95)' : 'rgba(242, 230, 201, 0.85)';
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }

  function drawSpikes() {
    const k = Math.min(years.length - 2, Math.floor(pos));
    const f = pos >= years.length - 1 ? 1 : ease(pos - k);
    const maxPop = Math.max(...concellos.flatMap((c) => c.pop.map((v) => v ?? 0)));
    const scale = (height * 0.32) / maxPop;
    const list = concellos
      .map((c) => {
        const a = c.pop[k] ?? 0;
        const b = c.pop[k + 1] ?? a;
        const v = pos >= years.length - 1 ? (c.pop[years.length - 1] ?? 0) : a + (b - a) * f;
        const first = c.pop[0] ?? v;
        return { s: px(c.centre), v, up: v >= first };
      })
      .sort((x, y) => x.s.y - y.s.y);
    for (const { s, v, up } of list) {
      const h = v * scale;
      const w = 3;
      ctx.fillStyle = up ? 'rgba(178, 171, 210, 0.85)' : 'rgba(224, 130, 20, 0.85)';
      ctx.beginPath();
      ctx.moveTo(s.x - w, s.y);
      ctx.lineTo(s.x, s.y - h);
      ctx.lineTo(s.x + w, s.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (view === 'puntos') drawDots();
    else drawSpikes();
    const k = Math.round(Math.min(pos, years.length - 1));
    clock.textContent = String(years[k]);
    nowEl.textContent = fill(dict.move_now ?? '', {
      pop: nf.format(galicia[k] ?? 0),
      y: years[k] ?? '',
    });
    const sk = Math.min(steps.length - 1, Math.floor(pos));
    const st = steps[sk] as Step;
    detail.textContent = fill(dict.move_step ?? '', {
      a: years[sk] ?? '',
      b: years[sk + 1] ?? '',
      moved: nf.format(st.moves.length),
      gone: nf.format(st.gone.length),
      new: nf.format(st.fresh.length),
    });
    range.value = String(pos);
    bars.forEach((b, i) => {
      b.classList.toggle('is-now', i === k);
    });
  }

  // ---- Census bars ------------------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const step = W / years.length;
  const gMax = Math.max(...galicia);
  const bars = years.map((y, k) => {
    const h = ((galicia[k] ?? 0) / gMax) * (H - 26);
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('class', 'mo-bar');
    r.setAttribute('x', String(k * step + 2));
    r.setAttribute('y', String(H - 16 - h));
    r.setAttribute('width', String(step - 4));
    r.setAttribute('height', String(h));
    r.addEventListener('click', () => {
      setPlaying(false);
      pos = k;
      draw();
    });
    curve.append(r);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('class', 'mo-tick');
    t.setAttribute('x', String(k * step + step / 2));
    t.setAttribute('y', String(H - 2));
    t.textContent = String(y);
    curve.append(t);
    return r;
  });

  // ---- Controls ---------------------------------------------------------------------------
  for (const b of app.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    b.addEventListener('click', () => {
      view = b.dataset.view === 'agullas' ? 'agullas' : 'puntos';
      for (const l of app.querySelectorAll<HTMLElement>('.mo-legend[data-for]')) {
        l.hidden = l.dataset.for !== view;
      }
      for (const x of app.querySelectorAll<HTMLButtonElement>('[data-view]')) {
        x.setAttribute('aria-pressed', String(x === b));
      }
      draw();
    });
  }
  range.max = String(years.length - 1);
  let playing = false;
  let last: number | null = null;
  let held = 0;
  function tick(now: number) {
    if (!playing) return;
    const dt = last === null ? 0 : (now - last) / 1000;
    last = now;
    const atCensus = Math.abs(pos - Math.round(pos)) < 1e-6;
    if (atCensus && held < HOLD) held += dt;
    else {
      pos = Math.min(years.length - 1, pos + dt / MOVE);
      if (Math.abs(pos - Math.round(pos)) < dt / MOVE) {
        pos = Math.round(pos);
        held = 0;
      }
    }
    draw();
    if (pos >= years.length - 1) {
      setPlaying(false);
      return;
    }
    requestAnimationFrame(tick);
  }
  function setPlaying(on: boolean) {
    playing = on;
    playBtn.textContent = dict[on ? 'pulse_pause' : 'pulse_play'] ?? '';
    playBtn.setAttribute('aria-pressed', String(!on));
    last = null;
    held = 0;
    if (on) requestAnimationFrame(tick);
  }
  playBtn.addEventListener('click', () => {
    if (!playing && pos >= years.length - 1) pos = 0;
    setPlaying(!playing);
  });
  range.addEventListener('input', () => {
    setPlaying(false);
    pos = Number(range.value);
    draw();
  });
  map.on('move', draw);
  window.addEventListener('resize', frame);
  new ResizeObserver(() => resize()).observe(canvas);
  resize();
  setPlaying(!reducedMotion.matches);
}
