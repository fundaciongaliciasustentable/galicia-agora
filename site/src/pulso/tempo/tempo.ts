// /pulso/tempo/: the weather hour by hour at the MeteoGalicia stations, in two modes: the
// reference day of the series (21 May 2025, meteo-dia) or the last 24 hours (meteo-24h,
// refreshed every hour).
// The canvas draws, back to front: a night veil that lifts with the mean measured sunshine,
// a soft disc of colour around each station for its temperature, wind particles blowing from
// each station, and rain marks where it rains. Below, the mean temperature with the band
// between the coldest and warmest station; in the panel, an hourly table.
//
// Data: the meteo-dia and meteo-24h layers (MeteoGalicia), served from this site.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { clock } from '../engine.ts';
import { fill, loadStyle } from '../pulso.ts';
import { DAY, directionAt, tempColour, valueAt, windParticles } from './engine.ts';

interface Station {
  id: number;
  name: string;
  lonlat: [number, number];
  ta: Array<number | null>;
  pp: Array<number | null>;
  vv: Array<number | null>;
  dv: Array<number | null>;
  rs: Array<number | null>;
}
type LayerKey = 'temp' | 'wind' | 'rain';
type Mode = 'dia' | 'live';
interface Hour {
  mean: number;
  min: number;
  max: number;
  rs: number;
  vv: number;
  rain: number;
}
interface DataSet {
  stations: Station[];
  hourly: Hour[];
  rsMax: number;
  /** UTC ms of the first hour (live mode); null for the reference day, read as local hours. */
  start: number | null;
  attribution: string;
  /** fresh / stale / failed, from the layer meta. */
  status: string;
  fetchedAt: string | null;
}
type Dict = Record<string, string>;

const LAYERS: Record<Mode, string> = { dia: 'meteo-dia', live: 'meteo-24h' };
const SPEEDS = [45, 90, 180];
const RAIN = '#8fd3ff';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.tp-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const f1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;

  const canvas = q<HTMLCanvasElement>('.tp-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const clockEl = q<HTMLElement>('.tp-clock');
  const nowEl = q<HTMLElement>('.tp-now');
  const status = q<HTMLElement>('.tp-status');
  const range = q<HTMLInputElement>('.tp-range');
  const playBtn = q<HTMLButtonElement>('.tp-play');
  const speedSel = q<HTMLSelectElement>('.tp-speed');
  const layerBoxes = [...app.querySelectorAll<HTMLInputElement>('[data-layer]')];
  const curve = q<SVGSVGElement>('.tp-curve svg');
  const tbody = q<HTMLElement>('.tp-table tbody');
  const caption = q<HTMLElement>('.tp-table caption');
  const sources = q<HTMLElement>('.tp-sources');
  const periodEl = q<HTMLElement>('.tp-period');
  const modeBtns = [...app.querySelectorAll<HTMLButtonElement>('[data-mode]')];

  // ---- Data -------------------------------------------------------------------------------
  const summarise = (stations: Station[]): Hour[] =>
    Array.from({ length: 24 }, (_, h) => {
      const vals = (k: 'ta' | 'rs' | 'vv') =>
        stations.map((s) => s[k][h]).filter((v): v is number => v !== null && v !== undefined);
      const ta = vals('ta');
      return {
        mean: mean(ta),
        min: Math.min(...ta),
        max: Math.max(...ta),
        rs: mean(vals('rs')),
        vv: mean(vals('vv')),
        rain: stations.filter((s) => (s.pp[h] ?? 0) > 0).length,
      };
    });
  const sets: Partial<Record<Mode, DataSet>> = {};
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{
        id: string;
        attribution: string;
        meta: { status?: string; fetched_at?: string } | null;
      }>;
    };
    await Promise.all(
      (Object.keys(LAYERS) as Mode[]).map(async (m) => {
        const layer = catalog.layers.find((l) => l.id === LAYERS[m]);
        if (!layer?.meta) return;
        const res = await fetch(asset(`data/${LAYERS[m]}/data.geojson`));
        if (!res.ok) return;
        const fc = (await res.json()) as {
          features: Array<{
            geometry: { coordinates: [number, number] };
            properties: Record<string, unknown>;
          }>;
        };
        const stations = fc.features.map((f) => ({
          id: Number(f.properties.id),
          name: String(f.properties.nome),
          lonlat: f.geometry.coordinates,
          ta: f.properties.ta as Array<number | null>,
          pp: f.properties.pp as Array<number | null>,
          vv: f.properties.vv as Array<number | null>,
          dv: f.properties.dv as Array<number | null>,
          rs: f.properties.rs as Array<number | null>,
        }));
        if (stations.length === 0) return;
        const hourly = summarise(stations);
        const inicio = fc.features[0]?.properties.inicio;
        sets[m] = {
          stations,
          hourly,
          rsMax: Math.max(1, ...hourly.map((h) => h.rs)),
          start: typeof inicio === 'string' ? Date.parse(inicio) : null,
          attribution: layer.attribution,
          status: layer.meta.status ?? 'fresh',
          fetchedAt: layer.meta.fetched_at ?? null,
        };
      }),
    );
  } catch {
    // Handled below.
  }
  if (!sets.dia && !sets.live) {
    status.textContent = dict.weather_missing ?? '';
    return;
  }
  const params = new URLSearchParams(window.location.hash.slice(1));
  let mode: Mode = (params.get('m') === '24h' && sets.live) || !sets.dia ? 'live' : 'dia';
  let set = sets[mode] as DataSet;
  let stations = set.stations;
  let hourly = set.hourly;
  let rsMax = set.rsMax;
  const hourFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  // Own month names: some browsers ship without Galician locale data and fall back to Spanish.
  const dayMonth = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'numeric',
  });
  const dateFmt = {
    format(d: Date) {
      const [day, month] = dayMonth.format(d).split('/').map(Number) as [number, number];
      return `${day} de ${(dict.pulse_months ?? '').split(',')[month - 1] ?? ''}`;
    },
  };
  /** Local clock label of second `sec` of the shown 24 hours. */
  const label = (sec: number) =>
    set.start === null ? clock(sec) : hourFmt.format(new Date(set.start + sec * 1000));
  for (const b of modeBtns) b.disabled = !sets[b.dataset.mode as Mode];

  // ---- State ------------------------------------------------------------------------------
  const hm = /^(\d{2}):(\d{2})$/.exec(params.get('t') ?? '');
  let s = hm ? Number(hm[1]) * 3600 + Number(hm[2]) * 60 : 7 * 3600;
  const off = new Set((params.get('sen') ?? '').split(',').filter(Boolean) as LayerKey[]);
  const enabled = new Set<LayerKey>(
    (['temp', 'wind', 'rain'] as LayerKey[]).filter((k) => !off.has(k)),
  );
  for (const b of layerBoxes) b.checked = enabled.has(b.dataset.layer as LayerKey);
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;
  const writeHash = () => {
    const p = new URLSearchParams();
    if (mode === 'live') p.set('m', '24h');
    p.set('t', clock(s));
    const hidden = (['temp', 'wind', 'rain'] as LayerKey[]).filter((k) => !enabled.has(k));
    if (hidden.length) p.set('sen', hidden.join(','));
    history.replaceState(null, '', `#${p.toString()}`);
  };

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.tp-map'),
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
    const panel = q<HTMLElement>('.tp-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.tp-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.tp-map').getBoundingClientRect();
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
          right: wide ? 60 : 10,
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

  /** Mean measured sunshine at second s, 0 (night) to 1 (the day's brightest hour). */
  function light(): number {
    const t = s / 3600;
    const h = Math.min(23, Math.floor(t));
    const a = hourly[h]?.rs ?? 0;
    const b = hourly[Math.min(23, h + 1)]?.rs ?? a;
    return (a + (b - a) * (t - h)) / rsMax;
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const zk = 2 ** (map.getZoom() - 7);

    // Night veil: lifts with the measured sunshine.
    ctx.fillStyle = `rgba(4, 6, 14, ${(0.62 * (1 - Math.sqrt(light()))).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);

    const pts = stations.map((st) => map.project(st.lonlat));
    if (enabled.has('temp')) {
      const r = 26 * zk;
      for (const [i, st] of stations.entries()) {
        const v = valueAt(st.ta, s);
        if (v === null) continue;
        const p = pts[i] as { x: number; y: number };
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, tempColour(v, 0.75));
        g.addColorStop(0.45, tempColour(v, 0.35));
        g.addColorStop(1, tempColour(v, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (enabled.has('wind')) {
      const reach = 34 * zk;
      ctx.fillStyle = '#ffffff';
      for (const [i, st] of stations.entries()) {
        const v = valueAt(st.vv, s);
        const d = directionAt(st.dv, s);
        if (v === null || d === null) continue;
        const p = pts[i] as { x: number; y: number };
        for (const w of windParticles(v, d, s, st.id)) {
          ctx.globalAlpha = 0.8 * Math.sin(Math.PI * w.life);
          ctx.beginPath();
          ctx.arc(p.x + w.dx * reach, p.y + w.dy * reach, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    if (enabled.has('rain')) {
      ctx.strokeStyle = RAIN;
      ctx.lineWidth = 1.2;
      const hour = Math.min(23, Math.floor(s / 3600));
      for (const [i, st] of stations.entries()) {
        const mm = st.pp[hour] ?? 0;
        if (mm <= 0) continue;
        const p = pts[i] as { x: number; y: number };
        const n = Math.min(12, Math.ceil(mm * 4));
        for (let k = 0; k < n; k++) {
          const ph = ((s / 240 + k / n) % 1) * 18 * zk;
          const x = p.x + (((k * 37) % 13) - 6) * zk;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.moveTo(x, p.y - 9 * zk + ph);
          ctx.lineTo(x - 1.5, p.y - 5 * zk + ph);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    // Station dots on top, so the reader sees where the readings come from.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    clockEl.textContent = label(s);
    let lo: { v: number; st: Station } | null = null;
    let hi: { v: number; st: Station } | null = null;
    const vals: number[] = [];
    for (const st of stations) {
      const v = valueAt(st.ta, s);
      if (v === null) continue;
      vals.push(v);
      if (!lo || v < lo.v) lo = { v, st };
      if (!hi || v > hi.v) hi = { v, st };
    }
    nowEl.textContent =
      lo && hi
        ? fill(dict.weather_now ?? '', {
            mean: f1.format(mean(vals)),
            max: f1.format(hi.v),
            maxAt: hi.st.name,
            min: f1.format(lo.v),
            minAt: lo.st.name,
          })
        : '';
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
    const lo = Math.floor(Math.min(...hourly.map((h) => h.min)));
    const hi = Math.ceil(Math.max(...hourly.map((h) => h.max)));
    const yOf = (v: number) => H - 16 - ((v - lo) / Math.max(1, hi - lo)) * (H - 26);
    const xs = hourly.map((_, h) => xOf(h * 3600 + 1800));
    const line = (vals: number[]) =>
      vals
        .map((v, h) => `${h ? 'L' : 'M'}${(xs[h] as number).toFixed(1)} ${yOf(v).toFixed(1)}`)
        .join('');
    const band =
      line(hourly.map((h) => h.max)) +
      [...hourly]
        .reverse()
        .map((h, i) => `L${(xs[23 - i] as number).toFixed(1)} ${yOf(h.min).toFixed(1)}`)
        .join('') +
      'Z';
    const sun =
      `M0 ${H - 16}` +
      hourly
        .map(
          (h, i) =>
            `L${(xs[i] as number).toFixed(1)} ${(H - 16 - (h.rs / rsMax) * (H - 26)).toFixed(1)}`,
        )
        .join('') +
      `L${W} ${H - 16}Z`;
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const mk = (d: string, cls: string) => {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', cls);
      return p;
    };
    curve.replaceChildren(
      mk(sun, 'tp-sun'),
      mk(band, 'tp-band'),
      mk(line(hourly.map((h) => h.mean)), 'tp-area'),
    );
    for (let h = 0; h <= 24; h += 3) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', String(Math.min(W - 14, Math.max(14, xOf(h * 3600)))));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'tp-tick');
      tx.textContent = label(h * 3600);
      curve.append(tx);
    }
    playhead.setAttribute('class', 'tp-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H - 16));
    curve.append(playhead);
    const means = hourly.map((h) => h.mean);
    const low = Math.min(...means);
    const high = Math.max(...means);
    curve.setAttribute(
      'aria-label',
      fill(dict.weather_curve_label ?? '', {
        low: f1.format(low),
        lowAt: label(means.indexOf(low) * 3600),
        high: f1.format(high),
        highAt: label(means.indexOf(high) * 3600),
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
    s = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (DAY - 60));
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
    caption.textContent = fill(dict.weather_table_caption ?? '', { n: stations.length });
    tbody.replaceChildren(
      ...hourly.map((h, i) => {
        const tr = document.createElement('tr');
        const cells = [
          label(i * 3600),
          f1.format(h.mean),
          f1.format(h.min),
          f1.format(h.max),
          String(h.rain),
          f1.format(h.vv),
        ];
        cells.forEach((text, k) => {
          const td = document.createElement(k === 0 ? 'th' : 'td');
          if (k === 0) td.setAttribute('scope', 'row');
          td.textContent = text;
          tr.append(td);
        });
        return tr;
      }),
    );
  }

  /** The period shown, the source and, in live mode, how fresh the data is. */
  function period() {
    sources.textContent = set.attribution;
    if (set.start === null) {
      periodEl.textContent = dict.weather_period_day ?? '';
      return;
    }
    const end = new Date(set.start + 23 * 3600_000);
    let text = fill(dict.weather_period_live ?? '', {
      hour: hourFmt.format(end),
      date: dateFmt.format(end),
    });
    // Judged here, not only from the meta: a copy of the site that stops receiving data would
    // keep saying «fresh» for ever.
    const old = Date.now() - end.getTime() > 3 * 3600_000;
    if (old || set.status !== 'fresh') text += ` ${dict.weather_period_stale ?? ''}`;
    periodEl.textContent = text;
  }

  const setMode = (m: Mode) => {
    if (!sets[m]) return;
    mode = m;
    set = sets[m] as DataSet;
    stations = set.stations;
    hourly = set.hourly;
    rsMax = set.rsMax;
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    period();
    table();
    drawCurve();
    draw();
    writeHash();
  };
  for (const b of modeBtns) b.addEventListener('click', () => setMode(b.dataset.mode as Mode));

  // ---- Controls ---------------------------------------------------------------------------
  range.min = '0';
  range.max = String(DAY - 60);
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
  for (const box of layerBoxes) {
    box.addEventListener('change', () => {
      const k = box.dataset.layer as LayerKey;
      if (box.checked) enabled.add(k);
      else enabled.delete(k);
      draw();
      writeHash();
    });
  }
  function frame(now: number) {
    if (!playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    s += (dt * DAY) / speed;
    if (s >= DAY - 60) s = 0;
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
  setMode(mode);
  setPlaying(playing);
}
