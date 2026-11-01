// /pulso/sol/: one day of sun over Galicia. A low-resolution grid of sun elevations, scaled up
// smoothly, shades the map through the twilights; the line where the sun touches the horizon
// is drawn on top; every concello's point lights up while the sun is above its horizon. Below,
// the sun's elevation through the day at the chosen concello.
//
// Data: only the concello points of the perfil-concellos layer, served from this site; the sun
// is computed in engine.ts.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { fill, loadStyle, pickerRoom } from '../pulso.ts';
import { crossings, elevation, HORIZON, localDay, madridOffset, shade, sunAt } from './engine.ts';

type Dict = Record<string, string>;

interface Place {
  code: string;
  name: string;
  lonlat: [number, number];
  rise: number | null;
  set: number | null;
}

const LAYER = 'perfil-concellos';
const SPEEDS = [60, 120, 240];
/** Slower while the sunrise or sunset line crosses Galicia, so it can be seen moving. */
const SLOW = 0.08;
const CELL = 8;
const SANTIAGO = '15078';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.so-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const locale = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(locale);
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const months = (dict.pulse_months ?? '').split(',');
  const weekdays = (dict.pulse_weekdays ?? '').split(',');

  const canvas = q<HTMLCanvasElement>('.lu-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const dateEl = q<HTMLElement>('.so-date');
  const clockEl = q<HTMLElement>('.lu-clock');
  const nowEl = q<HTMLElement>('.lu-now');
  const placeEl = q<HTMLElement>('.so-place');
  const status = q<HTMLElement>('.lu-status');
  const range = q<HTMLInputElement>('.lu-range');
  const playBtn = q<HTMLButtonElement>('.lu-play');
  const speedSel = q<HTMLSelectElement>('.lu-speed');
  const dateInput = q<HTMLInputElement>('.so-input');
  const presetBtns = [...app.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const curve = q<SVGSVGElement>('.lu-curve svg');
  const curveCaption = q<HTMLElement>('.lu-curve figcaption');
  const tbody = q<HTMLElement>('.lu-table tbody');
  const caption = q<HTMLElement>('.lu-table caption');
  const sources = q<HTMLElement>('.lu-sources');

  /** Local clock time of an instant, hh:mm. */
  const hm = (ms: number) => {
    const d = new Date(ms + madridOffset(ms) * 60_000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };
  const span = (minutes: number) =>
    `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, '0')} min`;
  const dateText = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${fill(dict.pulse_date ?? '', {
      weekday: weekdays[wd] ?? '',
      day: d,
      month: months[m - 1] ?? '',
    })} de ${y}`;
  };

  // ---- Data -------------------------------------------------------------------------------
  let places: Place[] = [];
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      const fc = (await (await fetch(asset(`data/${LAYER}/data.geojson`))).json()) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      places = fc.features
        .filter((f) => typeof f.properties.lon === 'number')
        .map((f) => ({
          code: String(f.properties.codigo_ine),
          name: String(f.properties.nome),
          lonlat: [Number(f.properties.lon), Number(f.properties.lat)] as [number, number],
          rise: null,
          set: null,
        }));
      sources.textContent = layer.attribution;
    }
  } catch {
    places = [];
  }
  if (places.length === 0) {
    status.textContent = dict.sun_missing ?? '';
    return;
  }

  // ---- State ------------------------------------------------------------------------------
  const todayIso = () => {
    const now = Date.now();
    return new Date(now + madridOffset(now) * 60_000).toISOString().slice(0, 10);
  };
  const year = Number(todayIso().slice(0, 4));
  const PRESET_DATES: Record<string, () => string> = {
    inverno: () => `${year}-12-21`,
    equinoccio: () => `${year}-03-20`,
    veran: () => `${year}-06-21`,
    hoxe: todayIso,
  };
  const params = new URLSearchParams(window.location.hash.slice(1));
  let date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('d') ?? '')
    ? (params.get('d') as string)
    : `${year}-06-21`;
  let chosen =
    places.find((p) => p.code === params.get('c')) ??
    places.find((p) => p.code === SANTIAGO) ??
    (places[0] as Place);
  let day = localDay(date);
  // Time is ms since the local midnight of the chosen day.
  const tm = /^(\d{2}):(\d{2})$/.exec(params.get('t') ?? '');
  let s = tm ? (Number(tm[1]) * 60 + Number(tm[2])) * 60_000 : 5 * 3_600_000;
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[0] as number;
  let firstRise: Place | null = null;
  let lastRise: Place | null = null;

  function computeDay() {
    day = localDay(date);
    for (const p of places) Object.assign(p, crossings(...p.lonlat, day.start, day.end));
    const rising = places.filter((p) => p.rise !== null);
    rising.sort((a, b) => (a.rise as number) - (b.rise as number));
    firstRise = rising[0] ?? null;
    lastRise = rising[rising.length - 1] ?? null;
    s = Math.min(s, day.end - day.start - 60_000);
  }
  const writeHash = () => {
    const p = new URLSearchParams();
    p.set('d', date);
    p.set('t', hm(day.start + s));
    p.set('c', chosen.code);
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
    center: [-7.9, 42.8],
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
  // Grid of map positions, recomputed only when the map moves.
  let cols = 0;
  let rows = 0;
  let grid = new Float32Array(0);
  let xy = new Float32Array(0);
  let stale = true;
  const shadeCanvas = document.createElement('canvas');
  const shadeCtx = shadeCanvas.getContext('2d') as CanvasRenderingContext2D;
  function project() {
    cols = Math.ceil(width / CELL) + 1;
    rows = Math.ceil(height / CELL) + 1;
    grid = new Float32Array(cols * rows * 2);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const ll = map.unproject([c * CELL, r * CELL]);
        grid[2 * (r * cols + c)] = ll.lng;
        grid[2 * (r * cols + c) + 1] = ll.lat;
      }
    xy = new Float32Array(places.length * 2);
    places.forEach((p, i) => {
      const pt = map.project(p.lonlat);
      xy[2 * i] = pt.x;
      xy[2 * i + 1] = pt.y;
    });
    shadeCanvas.width = cols;
    shadeCanvas.height = rows;
    stale = false;
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    stale = true;
    draw();
  }

  /** Whether the sunrise or sunset line is over some concello now. */
  let crossing = false;

  function draw() {
    if (stale) project();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const now = day.start + s;
    const sun = sunAt(now);

    // Night shade: one pixel per cell, scaled up with smoothing into a soft gradient.
    const elev = new Float32Array(cols * rows);
    const img = shadeCtx.createImageData(cols, rows);
    for (let k = 0; k < cols * rows; k++) {
      const e = elevation(sun, grid[2 * k] as number, grid[2 * k + 1] as number);
      elev[k] = e;
      img.data[4 * k] = 4;
      img.data[4 * k + 1] = 8;
      img.data[4 * k + 2] = 28;
      img.data[4 * k + 3] = Math.round(255 * shade(e));
    }
    shadeCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shadeCanvas, 0, 0, cols * CELL, rows * CELL);

    // The horizon line (marching squares on the grid).
    ctx.strokeStyle = 'rgba(255, 196, 90, 0.9)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255, 170, 60, 0.8)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols - 1; c++) {
        const v = [
          (elev[r * cols + c] as number) - HORIZON,
          (elev[r * cols + c + 1] as number) - HORIZON,
          (elev[(r + 1) * cols + c + 1] as number) - HORIZON,
          (elev[(r + 1) * cols + c] as number) - HORIZON,
        ];
        const corners: Array<[number, number]> = [
          [c, r],
          [c + 1, r],
          [c + 1, r + 1],
          [c, r + 1],
        ];
        const pts: Array<[number, number]> = [];
        for (let e = 0; e < 4; e++) {
          const a = v[e] as number;
          const b = v[(e + 1) % 4] as number;
          if (a < 0 !== b < 0) {
            const f = a / (a - b);
            const [x0, y0] = corners[e] as [number, number];
            const [x1, y1] = corners[(e + 1) % 4] as [number, number];
            pts.push([(x0 + f * (x1 - x0)) * CELL, (y0 + f * (y1 - y0)) * CELL]);
          }
        }
        if (pts.length >= 2) {
          const [p0, p1] = pts as [[number, number], [number, number]];
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(p1[0], p1[1]);
        }
      }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Concellos: lit while the sun is up there; a flash in the first minutes after sunrise.
    let up = 0;
    crossing = false;
    places.forEach((p, i) => {
      const e = elevation(sun, ...p.lonlat);
      const x = xy[2 * i] as number;
      const y = xy[2 * i + 1] as number;
      if (Math.abs(e - HORIZON) < 1.2) crossing = true;
      if (e >= HORIZON) {
        up++;
        const since = p.rise !== null ? (now - p.rise) / 60_000 : 999;
        if (since >= 0 && since < 10) {
          const g = 1 - since / 10;
          ctx.fillStyle = `rgba(255, 200, 90, ${(0.3 * g).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, 2.5 + 5 * g, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(255, 211, 107, ${Math.min(1, 0.55 + e / 40).toFixed(3)})`;
      } else ctx.fillStyle = e >= -6 ? 'rgba(255, 140, 70, 0.55)' : 'rgba(110, 130, 180, 0.45)';
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    const ci = places.indexOf(chosen);
    const cx = xy[2 * ci] as number;
    const cy = xy[2 * ci + 1] as number;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(13, 16, 23, 0.85)';
    ctx.strokeText(chosen.name, cx + 10, cy);
    ctx.fillStyle = '#fff';
    ctx.fillText(chosen.name, cx + 10, cy);

    clockEl.textContent = hm(now);
    nowEl.textContent = [
      fill(dict.sun_now ?? '', { n: nf.format(up), total: nf.format(places.length) }),
      firstRise && lastRise
        ? fill(dict.sun_rises ?? '', {
            first: firstRise.name,
            t1: hm(firstRise.rise as number),
            last: lastRise.name,
            t2: hm(lastRise.rise as number),
            m: nf.format(
              Math.round(((lastRise.rise as number) - (firstRise.rise as number)) / 60_000),
            ),
          })
        : '',
    ].join(' ');
    placeEl.textContent =
      chosen.rise !== null && chosen.set !== null
        ? fill(dict.sun_place ?? '', {
            name: chosen.name,
            rise: hm(chosen.rise),
            set: hm(chosen.set),
            light: span((chosen.set - chosen.rise) / 60_000),
            elev: nf.format(Math.round(elevation(sun, ...chosen.lonlat))),
          })
        : '';
    range.value = String(s);
    drawPlayhead();
  }

  // ---- Curve: sun elevation through the day at the chosen concello -------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const playhead = document.createElementNS(ns, 'line');
  const yOf = (e: number) => 8 + ((75 - e) / 100) * (H - 26);
  function drawCurve() {
    const len = day.end - day.start;
    const xOf = (ms: number) => (ms / len) * W;
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    // Night bands where the sun is below the horizon.
    const step = 5 * 60_000;
    let pts = '';
    let max = -90;
    let maxAt = 0;
    for (let t = 0; t <= len; t += step) {
      const e = elevation(sunAt(day.start + t), ...chosen.lonlat);
      if (e > max) {
        max = e;
        maxAt = t;
      }
      const band = document.createElementNS(ns, 'rect');
      band.setAttribute('x', xOf(t).toFixed(1));
      band.setAttribute('width', (xOf(step) + 0.5).toFixed(1));
      band.setAttribute('y', '0');
      band.setAttribute('height', String(H - 16));
      band.setAttribute('class', 'so-band');
      band.setAttribute('opacity', shade(e).toFixed(2));
      curve.append(band);
      pts += `${xOf(t).toFixed(1)},${yOf(Math.max(-25, e)).toFixed(1)} `;
    }
    const horizon = document.createElementNS(ns, 'line');
    horizon.setAttribute('class', 'so-horizon');
    horizon.setAttribute('x1', '0');
    horizon.setAttribute('x2', String(W));
    horizon.setAttribute('y1', yOf(0).toFixed(1));
    horizon.setAttribute('y2', yOf(0).toFixed(1));
    curve.append(horizon);
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('class', 'so-line');
    line.setAttribute('points', pts.trim());
    curve.append(line);
    for (let h = 0; h <= 24; h += 3) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', xOf(Math.min(len, h * 3_600_000)).toFixed(1));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'lu-tick');
      tx.textContent = `${String(h).padStart(2, '0')}:00`;
      curve.append(tx);
    }
    playhead.setAttribute('class', 'lu-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H - 16));
    curve.append(playhead);
    curveCaption.textContent = fill(dict.sun_curve ?? '', { name: chosen.name });
    curve.setAttribute(
      'aria-label',
      fill(dict.sun_curve_label ?? '', {
        name: chosen.name,
        max: nf.format(Math.round(max)),
        time: hm(day.start + maxAt),
      }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    const x = ((s / (day.end - day.start)) * W).toFixed(1);
    playhead.setAttribute('x1', x);
    playhead.setAttribute('x2', x);
  }
  const seek = (e: PointerEvent) => {
    const r = curve.getBoundingClientRect();
    s = Math.round(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (day.end - day.start - 60_000),
    );
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
    caption.textContent = fill(dict.sun_table_caption ?? '', {
      n: nf.format(places.length),
      date: dateText(date),
    });
    const sorted = [...places].sort((a, b) => (a.rise ?? Infinity) - (b.rise ?? Infinity));
    tbody.replaceChildren(
      ...sorted.map((p) => {
        const tr = document.createElement('tr');
        [
          p.name,
          p.rise !== null ? hm(p.rise) : '—',
          p.set !== null ? hm(p.set) : '—',
          p.rise !== null && p.set !== null ? span((p.set - p.rise) / 60_000) : '—',
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
  function setDate(iso: string) {
    date = iso;
    dateInput.value = iso;
    dateEl.textContent = dateText(iso);
    for (const b of presetBtns)
      b.setAttribute('aria-pressed', String(PRESET_DATES[b.dataset.preset as string]?.() === iso));
    computeDay();
    range.max = String(day.end - day.start - 60_000);
    drawCurve();
    table();
    draw();
    writeHash();
  }
  range.min = '0';
  range.step = '60000';
  range.addEventListener('input', () => {
    s = Number(range.value);
    draw();
  });
  range.addEventListener('change', writeHash);
  dateInput.addEventListener('change', () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) setDate(dateInput.value);
  });
  for (const b of presetBtns)
    b.addEventListener('click', () =>
      setDate(PRESET_DATES[b.dataset.preset as string]?.() ?? date),
    );
  map.on('click', (e) => {
    let best = chosen;
    let bestD = Infinity;
    places.forEach((p, i) => {
      const d = Math.hypot(
        (xy[2 * i] as number) - e.point.x,
        (xy[2 * i + 1] as number) - e.point.y,
      );
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    if (bestD > 40) return;
    chosen = best;
    drawCurve();
    draw();
    writeHash();
  });
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
    o.textContent = fill(dict.sun_speed_opt ?? '', { s: sp });
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
    const len = day.end - day.start;
    s += ((dt * len) / speed) * (crossing ? SLOW : 1);
    if (s >= len - 60_000) s = 0;
    draw();
    requestAnimationFrame(frame);
  }
  map.on('move', () => {
    stale = true;
    if (!playing) draw();
  });
  new ResizeObserver(() => resize()).observe(canvas);

  status.textContent = '';
  frame_();
  computeDay();
  resize();
  setDate(date);
  setPlaying(playing);
}
