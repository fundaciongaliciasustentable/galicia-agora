// /cidades/: trips into and out of the seven cities through a mean Wednesday or Sunday.
// MapLibre draws the dark basemap; a canvas on top draws each city as a disc sized by its
// residents, a ring for its running balance (people more or fewer than at 00:00, in % of
// residents) and particles for the trips arriving and leaving (engine.ts). Below, one small
// curve per city, all on the same % scale, with the other day dashed.
//
// Data: the mobilidade-cidades layer (MITMA, May 2025), served from this site.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../paths.ts';
import { clock } from '../pulso/engine.ts';
import { fill, loadStyle } from '../pulso/pulso.ts';
import {
  DAY,
  type DayKind,
  type Hourly,
  particlesAt,
  presenceAt,
  presenceCurve,
  type Ring,
  type RingData,
} from './engine.ts';

interface City {
  id: string;
  name: string;
  lonlat: [number, number];
  rings: Record<Ring, RingData>;
}

type Dict = Record<string, string>;

const LAYER = 'mobilidade-cidades';
const DAYS: DayKind[] = ['mercores', 'domingo'];
const IN = '#ffc94d';
const OUT = '#5fd3f3';
const SPEEDS = [30, 60, 120];
const STEP = 600;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.ci-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const nf = new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES');
  const pf = new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    signDisplay: 'exceptZero',
  });
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;

  const canvas = q<HTMLCanvasElement>('.ci-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const clockEl = q<HTMLElement>('.ci-clock');
  const nowEl = q<HTMLElement>('.ci-now');
  const status = q<HTMLElement>('.ci-status');
  const range = q<HTMLInputElement>('.ci-range');
  const playBtn = q<HTMLButtonElement>('.ci-play');
  const speedSel = q<HTMLSelectElement>('.ci-speed');
  const dayBtns = [...app.querySelectorAll<HTMLButtonElement>('[data-day]')];
  const ringBtns = [...app.querySelectorAll<HTMLButtonElement>('[data-ring]')];
  const grid = q<HTMLElement>('.ci-grid');
  const tbody = q<HTMLElement>('.ci-table tbody');
  const caption = q<HTMLElement>('.ci-table caption');
  const sources = q<HTMLElement>('.ci-sources');

  // ---- Data -------------------------------------------------------------------------------
  let cities: City[] = [];
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
      cities = fc.features.map((f) => ({
        id: String(f.properties.codigo_ine),
        name: String(f.properties.nome),
        lonlat: f.geometry.coordinates,
        rings: { anel0: f.properties.anel0 as RingData, anel1: f.properties.anel1 as RingData },
      }));
      sources.textContent = layer.attribution;
    }
  } catch {
    // Handled below: no cities, message in the panel.
  }
  if (cities.length === 0) {
    status.textContent = dict.cities_missing ?? '';
    return;
  }
  // West to east, as on the map.
  cities.sort((a, b) => a.lonlat[0] - b.lonlat[0]);

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  let day: DayKind = params.get('d') === 'domingo' ? 'domingo' : 'mercores';
  let ring: Ring = params.get('a') === 'concello' ? 'anel0' : 'anel1';
  const hm = /^(\d{2}):(\d{2})$/.exec(params.get('t') ?? '');
  let s = hm ? Number(hm[1]) * 3600 + Number(hm[2]) * 60 : 7 * 3600;
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;
  const writeHash = () => {
    const p = new URLSearchParams();
    if (day === 'domingo') p.set('d', 'domingo');
    if (ring === 'anel0') p.set('a', 'concello');
    p.set('t', clock(s));
    history.replaceState(null, '', `#${p.toString()}`);
  };
  const hourly = (c: City, d: DayKind = day): Hourly => c.rings[ring][d];

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.ci-map'),
    style: await loadStyle(),
    center: [-8.0, 42.8],
    zoom: 7,
    minZoom: 4,
    maxZoom: 11,
    // Wide enough vertically for a tall phone to zoom out to the whole of Galicia.
    maxBounds: [
      [-16, 37],
      [-1.5, 48.5],
    ],
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  // Developer aid, as on the other pages: ?debug exposes the map instance in the console.
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as { gaMap?: MlMap }).gaMap = map;
  }
  // Re-frame on resize until the reader pans or zooms the map themself.
  let userMoved = false;
  // Frame and draw at once: the canvas does not need the basemap, whose 'load' can be slow.
  // The panel shrinks once Source Sans 3 replaces the fallback font: frame again then.
  void document.fonts.ready.then(() => {
    if (!userMoved) frame_();
  });
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

  function frame_() {
    const panel = q<HTMLElement>('.ci-panel').getBoundingClientRect();
    const curves = q<HTMLElement>('.ci-curves').getBoundingClientRect();
    const box = q<HTMLElement>('.ci-map').getBoundingClientRect();
    const wide = window.innerWidth >= 700;
    const bottom = curves.height + 30;
    // On phones the panel can leave too little room: then the cities may sit under its edge
    // rather than the map refusing to fit (MapLibre ignores a padding larger than the map).
    const top = wide ? 40 : Math.min(panel.bottom - box.top + 20, box.height - bottom - 180);
    map.fitBounds(
      [
        [-8.95, 41.95],
        [-7.4, 43.6],
      ],
      {
        padding: {
          left: wide ? panel.width + 60 : 30,
          right: wide ? 80 : 30,
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

  /** Disc radius in px: area proportional to residents, growing with the zoom. */
  const discRadius = (residentes: number) =>
    Math.sqrt(residentes) * 0.032 * 2 ** (map.getZoom() - 7);

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const zoomK = 2 ** (map.getZoom() - 7);
    let totalIn = 0;
    let totalOut = 0;
    const hour = Math.min(23, Math.floor(s / 3600));
    for (const [i, c] of cities.entries()) {
      const data = c.rings[ring];
      const h = hourly(c);
      totalIn += h.entradas[hour] ?? 0;
      totalOut += h.saidas[hour] ?? 0;
      const p = map.project(c.lonlat);
      const r0 = discRadius(data.residentes);
      const reach = r0 + 46 * zoomK;
      const pct = (100 * presenceAt(h, s)) / data.residentes;

      // Particles: arrivals glide in from the outer edge, departures glide out.
      ctx.globalCompositeOperation = 'lighter';
      for (const pt of particlesAt(h, data.residentes, s, i + 1)) {
        const f = pt.inbound ? pt.progress : 1 - pt.progress;
        const ease = f * f * (3 - 2 * f);
        const rad = reach - (reach - r0) * ease;
        const x = p.x + Math.cos(pt.angle) * rad;
        const y = p.y + Math.sin(pt.angle) * rad;
        const alpha = Math.sin(Math.PI * pt.progress);
        ctx.fillStyle = pt.inbound ? IN : OUT;
        ctx.globalAlpha = 0.25 * alpha;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.95 * alpha;
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Resident disc, then the balance ring: width proportional to the % gained or lost.
      ctx.fillStyle = 'rgba(230, 230, 223, 0.10)';
      ctx.strokeStyle = 'rgba(230, 230, 223, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const w = Math.min(r0 * 0.9, Math.abs(pct) * 0.9 * zoomK + (pct === 0 ? 0 : 0.5));
      if (w > 0.3) {
        ctx.strokeStyle = pct > 0 ? IN : OUT;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r0 + w / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Label: name and the balance now.
      ctx.font = '600 13px "Source Sans 3", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(17, 18, 16, 0.9)';
      ctx.lineWidth = 3;
      const ly = p.y - r0 - Math.max(4, w) - 8;
      ctx.strokeText(c.name, p.x, ly);
      ctx.fillText(c.name, p.x, ly);
      ctx.font = '600 12px "Source Sans 3", system-ui, sans-serif';
      const pv = `${pf.format(pct)} %`;
      ctx.fillStyle = pct >= 0 ? IN : OUT;
      ctx.strokeText(pv, p.x, p.y + 4);
      ctx.fillText(pv, p.x, p.y + 4);
    }
    clockEl.textContent = clock(s);
    nowEl.textContent = fill(dict.cities_now ?? '', {
      in: nf.format(totalIn),
      out: nf.format(totalOut),
    });
    range.value = String(s);
    for (const m of minis) m.update();
  }

  // ---- Small multiples --------------------------------------------------------------------
  const ns = 'http://www.w3.org/2000/svg';
  const W = 240;
  const H = 64;
  interface Mini {
    build(): void;
    update(): void;
  }
  const minis: Mini[] = [];
  let yMin = 0;
  let yMax = 1;
  function scale() {
    yMin = 0;
    yMax = 1;
    for (const c of cities) {
      for (const d of DAYS) {
        for (const v of presenceCurve(c.rings[ring][d], c.rings[ring].residentes, STEP)) {
          yMin = Math.min(yMin, v);
          yMax = Math.max(yMax, v);
        }
      }
    }
  }
  const yOf = (v: number) => H - 2 - ((v - yMin) / (yMax - yMin)) * (H - 4);
  const xOf = (sec: number) => (sec / DAY) * W;

  for (const c of cities) {
    const fig = document.createElement('figure');
    fig.className = 'ci-mini';
    const head = document.createElement('div');
    head.className = 'ci-mini-head';
    const name = document.createElement('span');
    name.className = 'ci-mini-name';
    name.textContent = c.name;
    const val = document.createElement('span');
    val.className = 'ci-mini-val';
    head.append(name, val);
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    const playhead = document.createElementNS(ns, 'line');
    playhead.setAttribute('class', 'ci-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H));
    fig.append(head, svg);
    grid.append(fig);
    const path = (vals: number[], close: boolean) => {
      let d = '';
      vals.forEach((v, i) => {
        d += `${d ? 'L' : 'M'}${xOf(i * STEP).toFixed(1)} ${yOf(v).toFixed(1)}`;
      });
      return close ? `${d}L${W} ${yOf(0)}L0 ${yOf(0)}Z` : d;
    };
    minis.push({
      build() {
        const data = c.rings[ring];
        const cur = presenceCurve(data[day], data.residentes, STEP);
        const other = presenceCurve(
          data[day === 'mercores' ? 'domingo' : 'mercores'],
          data.residentes,
          STEP,
        );
        const zero = document.createElementNS(ns, 'line');
        zero.setAttribute('class', 'ci-zero');
        zero.setAttribute('x1', '0');
        zero.setAttribute('x2', String(W));
        zero.setAttribute('y1', String(yOf(0)));
        zero.setAttribute('y2', String(yOf(0)));
        const area = document.createElementNS(ns, 'path');
        area.setAttribute('class', 'ci-area');
        area.setAttribute('d', path(cur, true));
        const line = document.createElementNS(ns, 'path');
        line.setAttribute('class', 'ci-other');
        line.setAttribute('d', path(other, false));
        svg.replaceChildren(zero, area, line, playhead);
        const max = Math.max(...cur);
        const min = Math.min(...cur);
        svg.setAttribute(
          'aria-label',
          max > 0
            ? fill(dict.cities_curve_label ?? '', {
                city: c.name,
                max: pf.format(max),
                hour: clock(cur.indexOf(max) * STEP),
              })
            : fill(dict.cities_curve_label_neg ?? '', {
                city: c.name,
                min: pf.format(min),
                hour: clock(cur.indexOf(min) * STEP),
              }),
        );
      },
      update() {
        const x = xOf(s).toFixed(1);
        playhead.setAttribute('x1', x);
        playhead.setAttribute('x2', x);
        const data = c.rings[ring];
        val.textContent = `${pf.format((100 * presenceAt(data[day], s)) / data.residentes)} %`;
      },
    });
    const seek = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      s = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * DAY);
      draw();
    };
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId);
      seek(e);
    });
    svg.addEventListener('pointermove', (e) => {
      if (svg.hasPointerCapture(e.pointerId)) seek(e);
    });
    svg.addEventListener('pointerup', () => writeHash());
  }

  // ---- Table ------------------------------------------------------------------------------
  function table() {
    const dayName = day === 'mercores' ? dict.pulse_weekday : dict.pulse_sunday;
    caption.textContent = fill(dict.cities_table_caption ?? '', {
      ambito: ring === 'anel0' ? (dict.cities_ring0 ?? '') : (dict.cities_ring1 ?? ''),
      dia: (dayName ?? '').toLowerCase(),
    });
    tbody.replaceChildren(
      ...cities.map((c) => {
        const data = c.rings[ring];
        const h = data[day];
        const curve = presenceCurve(h, data.residentes, 3600);
        const max = Math.max(0, ...curve);
        const tr = document.createElement('tr');
        const cells = [
          c.name,
          nf.format(data.residentes),
          nf.format(h.entradas.reduce((a, b) => a + b, 0)),
          nf.format(h.saidas.reduce((a, b) => a + b, 0)),
          `${nf.format(Math.round((max * data.residentes) / 100))} (${pf.format(max)} %)`,
          max > 0 ? clock(curve.indexOf(max) * 3600) : '–',
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
    for (const b of ringBtns) b.setAttribute('aria-pressed', String(b.dataset.ring === ring));
    scale();
    for (const m of minis) m.build();
    table();
    draw();
    writeHash();
  };
  for (const b of dayBtns)
    b.addEventListener('click', () => {
      day = b.dataset.day as DayKind;
      refresh();
    });
  for (const b of ringBtns)
    b.addEventListener('click', () => {
      ring = b.dataset.ring as Ring;
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
