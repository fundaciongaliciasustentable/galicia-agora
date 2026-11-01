// /pulso/lostregos/: twelve months of lightning over Galicia, day by day. Within a storm day the
// clock runs through its hours and each strike flashes at its second (engine.ts); quiet days
// are passed at once. Below, strikes per day for the whole period; in the panel, the day's
// figures; a table of the days with most strikes.
//
// Data: the raios-ano layer (MeteoGalicia), served from this site.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { clock } from '../engine.ts';
import { fill, loadStyle, pickerRoom } from '../pulso.ts';
import { busiestHour, datesBetween, flash, perDay, type StormDay, upTo } from './engine.ts';

type Dict = Record<string, string>;

const LAYER = 'raios-ano';
/** Seconds of screen time per storm day. */
const SPEEDS = [2, 4, 8];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.lo-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const nf = new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES');
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const months = (dict.pulse_months ?? '').split(',');
  const weekdays = (dict.pulse_weekdays ?? '').split(',');
  const dateText = (iso: string, withYear = true) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const s = fill(dict.pulse_date ?? '', {
      weekday: weekdays[wd] ?? '',
      day: d,
      month: months[m - 1] ?? '',
    });
    return withYear ? `${s} de ${y}` : s;
  };

  const canvas = q<HTMLCanvasElement>('.lu-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const dateEl = q<HTMLElement>('.lo-date');
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

  // ---- Data -------------------------------------------------------------------------------
  let storms: StormDay[] = [];
  let from = '';
  let to = '';
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      const fc = (await (await fetch(asset(`data/${LAYER}/data.geojson`))).json()) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      storms = fc.features.map(({ properties: p }) => ({
        day: String(p.dia),
        t: p.segundo as number[],
        lon: p.lon as number[],
        lat: p.lat as number[],
        ka: p.ka as Array<number | null>,
      }));
      from = String(fc.features[0]?.properties.periodo_inicio ?? '');
      to = String(fc.features[0]?.properties.periodo_fin ?? '');
      sources.textContent = layer.attribution;
    }
  } catch {
    storms = [];
  }
  if (storms.length === 0 || !from || !to) {
    status.textContent = dict.bolt_missing ?? '';
    return;
  }
  const dates = datesBetween(from, to);
  const counts = perDay(dates, storms);
  const stormOf = new Map(storms.map((s) => [s.day, s]));
  const stormIdx = dates.map((d, i) => (stormOf.has(d) ? i : -1)).filter((i) => i >= 0);
  const total = counts.reduce((a, b) => a + b, 0);

  // ---- State: day index and second of that day ---------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = dates.indexOf(params.get('d') ?? '');
  // Starts on the stormiest day unless the link says otherwise.
  let day = fromHash >= 0 ? fromHash : counts.indexOf(Math.max(...counts));
  let second = 0;
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;
  const writeHash = () => history.replaceState(null, '', `#d=${dates[day]}`);

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
        [-9.45, 41.7],
        [-6.6, 43.9],
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
  // The faint marks of the days already passed, drawn once per day change onto their own canvas.
  const scar = document.createElement('canvas');
  const scarCtx = scar.getContext('2d') as CanvasRenderingContext2D;
  let scarDay = -1;
  let stale = true;
  const xyOf = (lon: number, lat: number) => map.project([lon, lat]);
  function resize() {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    const dpr = window.devicePixelRatio || 1;
    for (const c of [canvas, scar]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    stale = true;
    draw();
  }
  function paintScar() {
    const dpr = window.devicePixelRatio || 1;
    scarCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scarCtx.clearRect(0, 0, width, height);
    scarCtx.fillStyle = 'rgba(150, 180, 255, 0.22)';
    for (const i of stormIdx) {
      if (i >= day) break;
      const s = stormOf.get(dates[i] as string) as StormDay;
      for (let k = 0; k < s.t.length; k++) {
        const p = xyOf(s.lon[k] as number, s.lat[k] as number);
        scarCtx.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6);
      }
    }
    scarDay = day;
    stale = false;
  }

  function draw() {
    if (stale || scarDay !== day) paintScar();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(scar, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const iso = dates[day] as string;
    const s = stormOf.get(iso);
    const n = s ? upTo(s.t, second) : 0;
    if (s) {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < n; k++) {
        const f = flash(second - (s.t[k] as number));
        const p = xyOf(s.lon[k] as number, s.lat[k] as number);
        if (f.glow > 0) {
          const ka = Math.abs(s.ka[k] ?? 10);
          const r = (4 + Math.min(10, Math.sqrt(ka))) * f.glow;
          ctx.fillStyle = `rgba(190, 210, 255, ${(0.22 * f.glow).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(235, 242, 255, ${f.alpha.toFixed(3)})`;
        ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    dateEl.textContent = dateText(iso);
    clockEl.textContent = clock(second);
    const before = counts.slice(0, day).reduce((a, b) => a + b, 0) + n;
    const stormDays = stormIdx.filter((i) => i < day).length + (n > 0 ? 1 : 0);
    if (s) {
      const [h, k] = busiestHour(s.t);
      nowEl.textContent = fill(dict.bolt_now ?? '', {
        n: nf.format(s.t.length),
        h: String(h).padStart(2, '0'),
        h2: String((h + 1) % 24).padStart(2, '0'),
        k: nf.format(k),
        total: nf.format(before),
        days: nf.format(stormDays),
      });
    } else
      nowEl.textContent = fill(dict.bolt_quiet ?? '', {
        total: nf.format(before),
        days: nf.format(stormDays),
      });
    range.value = String(day);
    drawPlayhead();
  }

  // ---- Curve: strikes per day ---------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const xOf = (i: number) => (i / dates.length) * W;
  const playhead = document.createElementNS(ns, 'line');
  let bars: SVGRectElement[] = [];
  function drawCurve() {
    // Square root: a few huge storm days would otherwise flatten the rest.
    const max = Math.max(1, ...counts);
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    bars = [];
    counts.forEach((v, i) => {
      if (v === 0) return;
      const r = document.createElementNS(ns, 'rect');
      const h = Math.sqrt(v / max) * (H - 26);
      r.setAttribute('x', xOf(i).toFixed(1));
      r.setAttribute('width', Math.max(1.5, xOf(1) - 0.5).toFixed(1));
      r.setAttribute('y', (H - 16 - h).toFixed(1));
      r.setAttribute('height', h.toFixed(1));
      r.setAttribute('class', 'lu-bar');
      r.dataset.i = String(i);
      curve.append(r);
      bars.push(r);
    });
    let m = -1;
    dates.forEach((d, i) => {
      if (d.slice(8) !== '01') return;
      const mm = Number(d.slice(5, 7)) - 1;
      if (mm === m) return;
      m = mm;
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', xOf(i + 14).toFixed(1));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'lu-tick');
      tx.textContent = (months[mm] ?? '').slice(0, 3);
      curve.append(tx);
    });
    playhead.setAttribute('class', 'lu-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H - 16));
    curve.append(playhead);
    curve.setAttribute(
      'aria-label',
      fill(dict.bolt_curve_label ?? '', {
        from: dateText(from),
        to: dateText(to),
        max: nf.format(max),
        day: dateText(dates[counts.indexOf(max)] as string),
      }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    const x = xOf(day + 0.5).toFixed(1);
    playhead.setAttribute('x1', x);
    playhead.setAttribute('x2', x);
    for (const b of bars) b.classList.toggle('is-past', Number(b.dataset.i) <= day);
  }
  const seek = (e: PointerEvent) => {
    const r = curve.getBoundingClientRect();
    day = Math.min(
      dates.length - 1,
      Math.floor(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dates.length),
    );
    second = playing ? 0 : 86_399;
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
    caption.textContent = fill(dict.bolt_table_caption ?? '', {
      n: nf.format(total),
      days: nf.format(storms.length),
    });
    const top = [...storms].sort((a, b) => b.t.length - a.t.length).slice(0, 15);
    tbody.replaceChildren(
      ...top.map((s) => {
        const [h] = busiestHour(s.t);
        const tr = document.createElement('tr');
        [dateText(s.day), nf.format(s.t.length), `${String(h).padStart(2, '0')}:00`].forEach(
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
  range.max = String(dates.length - 1);
  range.step = '1';
  range.addEventListener('input', () => {
    day = Number(range.value);
    second = 86_399;
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
    o.textContent = fill(dict.bolt_speed_opt ?? '', { s: sp });
    speedSel.append(o);
  }
  speedSel.value = String(speed);
  speedSel.addEventListener('change', () => {
    speed = Number(speedSel.value);
  });
  /** Next storm day after `i`, wrapping to the first. */
  const nextStorm = (i: number) => stormIdx.find((k) => k > i) ?? (stormIdx[0] as number);
  function frame(now: number) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!stormOf.has(dates[day] as string)) {
      day = nextStorm(day);
      second = 0;
    } else {
      second += (dt * 86_400) / speed;
      if (second >= 86_400) {
        day = nextStorm(day);
        second = 0;
      }
    }
    draw();
    requestAnimationFrame(frame);
  }
  map.on('move', () => {
    stale = true;
    if (!playing) draw();
  });
  new ResizeObserver(() => resize()).observe(canvas);

  status.textContent = '';
  if (!playing) second = 86_399;
  frame_();
  resize();
  drawCurve();
  table();
  draw();
  setPlaying(playing);
}
