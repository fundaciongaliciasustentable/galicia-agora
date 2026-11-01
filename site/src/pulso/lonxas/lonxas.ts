// /pulso/lonxas/: 2025 in the Galician lonxas, one day at a time. Each lonxa is a circle whose
// area is the euros of first sale that day, cut into species groups; a day without sales leaves
// a dim dot. Below, Galicia's euros per day, stacked by group; in the panel, the day's total,
// the species that sold most in Galicia and the lonxa at the head; and a table of every lonxa.
//
// Data: the lonxas-2025 layer (Consellería do Mar, positions from the IGN NGBE), served from
// this site.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { fill, loadStyle } from '../pulso.ts';
import {
  beat,
  COLOURS,
  DAYS,
  dateOf,
  GROUPS,
  type Group,
  indexOf,
  type Lonxa,
  perDay,
  radius,
  slices,
  sum,
} from './engine.ts';

type Dict = Record<string, string>;

const LAYER = 'lonxas-2025';
const SPEEDS = [60, 120, 240];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.lx-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const locale = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(locale);
  const nf1 = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const months = (dict.pulse_months ?? '').split(',');
  const weekdays = (dict.pulse_weekdays ?? '').split(',');
  const money = (eur: number) =>
    eur >= 1e6
      ? `${nf1.format(eur / 1e6)} M€`
      : eur >= 1e3
        ? `${nf.format(Math.round(eur / 1e3))} mil €`
        : `${nf.format(Math.round(eur))} €`;
  const dateText = (i: number) => {
    const d = dateOf(i);
    return fill(dict.pulse_date ?? '', {
      weekday: weekdays[d.weekday] ?? '',
      day: d.day,
      month: months[d.month] ?? '',
    });
  };

  const canvas = q<HTMLCanvasElement>('.lu-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const clockEl = q<HTMLElement>('.lu-clock');
  const nowEl = q<HTMLElement>('.lu-now');
  const yearEl = q<HTMLElement>('.lx-year');
  const status = q<HTMLElement>('.lu-status');
  const range = q<HTMLInputElement>('.lu-range');
  const playBtn = q<HTMLButtonElement>('.lu-play');
  const speedSel = q<HTMLSelectElement>('.lu-speed');
  const groupBoxes = [...app.querySelectorAll<HTMLInputElement>('[data-group]')];
  const curve = q<SVGSVGElement>('.lu-curve svg');
  const tbody = q<HTMLElement>('.lu-table tbody');
  const caption = q<HTMLElement>('.lu-table caption');
  const sources = q<HTMLElement>('.lu-sources');

  // ---- Data -------------------------------------------------------------------------------
  let lonxas: Lonxa[] = [];
  let speciesOfDay: Array<string | null> = [];
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      const fc = (await (await fetch(asset(`data/${LAYER}/data.geojson`))).json()) as {
        features: Array<{
          geometry: { coordinates: [number, number] } | null;
          properties: Record<string, unknown>;
        }>;
      };
      for (const f of fc.features) {
        const p = f.properties;
        if (p.ambito === 'galicia') {
          speciesOfDay = p.especie_dia as Array<string | null>;
          continue;
        }
        lonxas.push({
          id: String(p.lonxa),
          name: String(p.nome),
          zone: String(p.zona ?? ''),
          lonlat: f.geometry?.coordinates ?? null,
          eur: p.importe_dia as Lonxa['eur'],
          kg: p.kg_dia as number[],
          total: Number(p.importe_total),
          tonnes: Number(p.kg_total) / 1000,
          days: Number(p.dias_venda),
          species: p.especies as Lonxa['species'],
        });
      }
      sources.textContent = layer.attribution;
    }
  } catch {
    lonxas = [];
  }
  if (lonxas.length === 0) {
    status.textContent = dict.fish_missing ?? '';
    return;
  }
  // Largest first so the small lonxas are drawn on top and stay visible.
  lonxas.sort((a, b) => b.total - a.total);
  const placed = lonxas.filter((l) => l.lonlat);

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const dm = /^(\d{1,2})-(\d{1,2})$/.exec(params.get('d') ?? '');
  const fromHash = dm ? indexOf(Number(dm[1]), Number(dm[2])) : -1;
  // Starts on the first Wednesday of August: a full working day in the bonito season.
  let s = fromHash >= 0 ? fromHash : indexOf(8, 6);
  const on = new Set<Group>(GROUPS);
  for (const g of (params.get('sen') ?? '').split(',')) on.delete(g as Group);
  for (const b of groupBoxes) b.checked = on.has(b.dataset.group as Group);
  let galicia = perDay(lonxas, on);
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;
  const writeHash = () => {
    const p = new URLSearchParams();
    const d = dateOf(Math.floor(s));
    p.set('d', `${d.month + 1}-${d.day}`);
    const hidden = GROUPS.filter((g) => !on.has(g));
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
    center: [-8.4, 42.8],
    zoom: 7,
    minZoom: 4,
    maxZoom: 12,
    // Wide enough vertically for a tall phone to zoom out to the whole coast.
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
    const top = wide ? 30 : Math.min(panel.bottom - box.top + 10, box.height - bottom - 180);
    // The coast, from A Guarda to Ribadeo.
    map.fitBounds(
      [
        [-9.35, 41.85],
        [-7.0, 43.8],
      ],
      {
        padding: {
          left: wide ? panel.width + 50 : 10,
          right: wide ? 70 : 10,
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
  let xy = new Float32Array(0);
  let xyStale = true;
  function project() {
    xy = new Float32Array(placed.length * 2);
    placed.forEach((l, i) => {
      const p = map.project(l.lonlat as [number, number]);
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

  // The biggest day of the biggest lonxa sets the scale, so a circle means the same all year.
  const maxDay = Math.max(1, ...lonxas.flatMap((l) => l.eur.peixes.map((_, i) => sumDay(l, i))));
  function sumDay(l: Lonxa, i: number) {
    return sum(GROUPS.map((g) => l.eur[g][i] ?? 0));
  }

  function draw() {
    if (xyStale) project();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const day = Math.min(DAYS - 1, Math.floor(s));
    const zk = 2 ** ((map.getZoom() - 7) * 0.6);
    // The largest circle is ~46 px across at zoom 7.
    const k = (23 * zk) / Math.sqrt(maxDay);
    const swell = playing ? beat(s - day) : 1;
    placed.forEach((l, i) => {
      const x = xy[2 * i] as number;
      const y = xy[2 * i + 1] as number;
      const parts = slices(l, day, on);
      const total = sum(parts);
      if (total <= 0) {
        ctx.fillStyle = 'rgba(200, 210, 210, 0.28)';
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      const r = Math.max(2, radius(total, k) * swell);
      let a0 = -Math.PI / 2;
      parts.forEach((v, g) => {
        if (v <= 0) return;
        const a1 = a0 + (v / total) * Math.PI * 2;
        ctx.fillStyle = COLOURS[GROUPS[g] as Group];
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, r, a0, a1);
        ctx.closePath();
        ctx.fill();
        a0 = a1;
      });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(14, 18, 20, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    // Names of the five largest of the day, beside their circle.
    const ranked = placed
      .map((l, i) => ({ l, i, v: sum(slices(l, day, on)) }))
      .filter((o) => o.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    // A larger lonxa keeps its label; one that would overlap it is left without.
    const taken: Array<[number, number, number, number]> = [];
    for (const o of ranked) {
      const r = Math.max(2, radius(o.v, k) * swell);
      const tx = (xy[2 * o.i] as number) + r + 4;
      const ty = xy[2 * o.i + 1] as number;
      const box: [number, number, number, number] = [
        tx,
        ty - 7,
        tx + ctx.measureText(o.l.name).width,
        ty + 7,
      ];
      if (taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]))
        continue;
      taken.push(box);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(14, 18, 20, 0.85)';
      ctx.strokeText(o.l.name, tx, ty);
      ctx.fillStyle = '#e6e6df';
      ctx.fillText(o.l.name, tx, ty);
    }

    clockEl.textContent = dateText(day);
    const totalDay = sum(galicia[day] ?? []);
    const top = [...lonxas]
      .map((l) => ({ l, v: sum(slices(l, day, on)) }))
      .sort((a, b) => b.v - a.v)[0];
    const n = lonxas.filter((l) => sum(slices(l, day, on)) > 0).length;
    nowEl.textContent =
      totalDay > 0 && top
        ? fill(dict.fish_now ?? '', {
            eur: money(totalDay),
            n: nf.format(n),
            species: on.size === GROUPS.length ? (speciesOfDay[day] ?? '—') : '—',
            top: top.l.name,
            topEur: money(top.v),
          })
        : (dict.fish_now_none ?? '');
    range.value = String(day);
    drawPlayhead();
  }

  // ---- Curve: Galicia per day, stacked by group --------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const xOf = (d: number) => (d / DAYS) * W;
  const playhead = document.createElementNS(ns, 'line');
  let bars: SVGGElement[] = [];
  function drawCurve() {
    const totals = galicia.map((g) => sum(g));
    const max = Math.max(1, ...totals);
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    const bw = xOf(1);
    bars = galicia.map((parts, i) => {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'lx-bar');
      let y = H - 16;
      parts.forEach((v, k) => {
        if (v <= 0) return;
        const h = (v / max) * (H - 26);
        y -= h;
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', xOf(i).toFixed(2));
        r.setAttribute('width', (bw * 0.9).toFixed(2));
        r.setAttribute('y', y.toFixed(1));
        r.setAttribute('height', h.toFixed(1));
        r.setAttribute('fill', COLOURS[GROUPS[k] as Group]);
        g.append(r);
      });
      curve.append(g);
      return g;
    });
    for (let m = 0; m < 12; m++) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', xOf(indexOf(m + 1, 15)).toFixed(1));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'lu-tick');
      tx.textContent = (months[m] ?? '').slice(0, 3);
      curve.append(tx);
    }
    playhead.setAttribute('class', 'lu-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H - 16));
    curve.append(playhead);
    const best = totals.indexOf(Math.max(...totals));
    curve.setAttribute(
      'aria-label',
      fill(dict.fish_curve_label ?? '', { max: money(max), day: dateText(best) }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    const day = Math.floor(s);
    const x = xOf(day + 0.45).toFixed(1);
    playhead.setAttribute('x1', x);
    playhead.setAttribute('x2', x);
    bars.forEach((b, i) => {
      b.classList.toggle('is-past', i <= day);
    });
  }
  const seek = (e: PointerEvent) => {
    const r = curve.getBoundingClientRect();
    s = Math.floor(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (DAYS - 1));
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

  // ---- Panel and table --------------------------------------------------------------------
  function year() {
    const total = sum(galicia.map((g) => sum(g)));
    const kg = sum(lonxas.map((l) => sum(l.kg)));
    yearEl.textContent = fill(dict.fish_year ?? '', {
      eur: money(total),
      t: nf.format(Math.round(kg / 1000)),
      n: nf.format(lonxas.length),
    });
  }
  function table() {
    caption.textContent = fill(dict.fish_table_caption ?? '', { n: nf.format(lonxas.length) });
    tbody.replaceChildren(
      ...lonxas.map((l) => {
        const tr = document.createElement('tr');
        [
          l.lonlat ? l.name : `${l.name} *`,
          nf1.format(l.total / 1e6),
          nf.format(Math.round(l.tonnes)),
          nf.format(l.days),
          l.species[0]?.especie ?? '',
        ].forEach((text, k) => {
          const td = document.createElement(k === 0 ? 'th' : 'td');
          if (k === 0) td.setAttribute('scope', 'row');
          td.textContent = text;
          tr.append(td);
        });
        return tr;
      }),
    );
  }

  // ---- Controls ---------------------------------------------------------------------------
  range.min = '0';
  range.max = String(DAYS - 1);
  range.step = '1';
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
    } else {
      s = Math.floor(s);
      draw();
      writeHash();
    }
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));
  for (const sp of SPEEDS) {
    const o = document.createElement('option');
    o.value = String(sp);
    o.textContent = fill(dict.fish_speed_opt ?? '', { s: sp });
    speedSel.append(o);
  }
  speedSel.value = String(speed);
  speedSel.addEventListener('change', () => {
    speed = Number(speedSel.value);
  });
  for (const box of groupBoxes) {
    box.addEventListener('change', () => {
      const g = box.dataset.group as Group;
      if (box.checked) on.add(g);
      else on.delete(g);
      galicia = perDay(lonxas, on);
      drawCurve();
      year();
      draw();
      writeHash();
    });
  }
  function frame(now: number) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    s += (dt * DAYS) / speed;
    if (s >= DAYS) s = 0;
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
  year();
  table();
  draw();
  setPlaying(playing);
}
