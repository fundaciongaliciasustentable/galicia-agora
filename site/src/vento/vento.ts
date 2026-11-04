// /pulso/vento/: visible wind. Particles follow the 10 m wind forecast of MeteoGalicia's WRF
// (vento-wrf layer: a regular lon/lat grid, u and v every 3 hours) over a dark map, in the
// manner of earth.nullschool: each frame moves every particle with the wind under it (bilinear
// in space, linear in time), draws the step as a short line coloured by speed, and fades the
// canvas a little so the lines leave trails. Positions live in lon/lat, so panning keeps them.
// With reduced motion, the particles are run once and drawn as still streamlines.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../paths.ts';
import { fill, loadStyle, pickerRoom } from '../pulso/pulso.ts';

type Dict = Record<string, string>;
interface Grid {
  lon0: number;
  lat0: number;
  dlon: number;
  dlat: number;
  nx: number;
  ny: number;
}

/** Colour stops by speed in m/s (0, 3, 6, 9, 12, 16, 20). */
const SPEEDS = [0, 3, 6, 9, 12, 16, 20];
const COLOURS = ['#3d6e8f', '#4fa3a5', '#8fcf8a', '#e5e17a', '#f2a65a', '#e8604c', '#c03a6a'];
/** Pixels a particle moves per frame for each m/s. */
const PX_PER_MS = 0.35;
const MAX_AGE = 90;
/** Forecast hours played per second. */
const HOURS_PER_S = 1;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.ve-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const canvas = q<HTMLCanvasElement>('.ve-canvas');
  const clock = q<HTMLElement>('.ve-clock');
  const nowEl = q<HTMLElement>('.ve-now');
  const detail = q<HTMLElement>('.ve-detail');
  const status = q<HTMLElement>('.ve-status');
  const range = q<HTMLInputElement>('.ve-range');
  const playBtn = q<HTMLButtonElement>('.ve-play');
  const sources = q<HTMLElement>('.ve-sources');

  // ---- Data -------------------------------------------------------------------------------
  let grid: Grid | null = null;
  let hours: number[] = [];
  let steps: Float32Array[] = [];
  let run = '';
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === 'vento-wrf');
    if (layer?.meta) {
      sources.textContent = layer.attribution;
      const fc = (await (await fetch(asset('data/vento-wrf/data.geojson'))).json()) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      const p = fc.features[0]?.properties;
      if (p) {
        grid = p.grella as Grid;
        run = String(p.execucion);
        hours = (p.horas as string[]).map((h) => Date.parse(h));
        const quant = Number(p.cuantizacion_ms);
        steps = (p.uv as string[]).map((b64) => {
          const bin = atob(b64);
          const out = new Float32Array(bin.length);
          for (let i = 0; i < bin.length; i++) {
            const c = bin.charCodeAt(i);
            out[i] = (c > 127 ? c - 256 : c) * quant;
          }
          return out;
        });
      }
    }
  } catch {
    // Handled below.
  }
  if (!grid || steps.length === 0) {
    status.textContent = dict.wind_missing ?? '';
    return;
  }
  status.textContent = '';
  const g: Grid = grid;

  // ---- Field ------------------------------------------------------------------------------
  // Time as a fractional step index; it starts at the step nearest to now.
  const nowStep = Math.max(
    0,
    Math.min(
      steps.length - 1,
      (Date.now() - (hours[0] as number)) /
        ((hours[1] ?? (hours[0] as number)) - (hours[0] as number) || 1),
    ),
  );
  let tStep = Math.floor(nowStep);
  const uv = (step: Float32Array, i: number, j: number, out: number[]) => {
    const k = 2 * (j * g.nx + i);
    out[0] = step[k] as number;
    out[1] = step[k + 1] as number;
  };
  const tmp = [0, 0];
  /** Wind (u, v) in m/s at lon/lat for the current time, or null outside the grid. */
  function sample(lon: number, lat: number): [number, number] | null {
    const x = (lon - g.lon0) / g.dlon;
    const y = (lat - g.lat0) / g.dlat;
    if (x < 0 || y < 0 || x >= g.nx - 1 || y >= g.ny - 1) return null;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const s0 = Math.floor(tStep);
    const s1 = Math.min(steps.length - 1, s0 + 1);
    const ft = tStep - s0;
    let u = 0;
    let v = 0;
    for (const [s, ws] of [
      [s0, 1 - ft],
      [s1, ft],
    ] as Array<[number, number]>) {
      if (ws === 0) continue;
      const step = steps[s] as Float32Array;
      for (const [di, dj, w] of [
        [0, 0, (1 - fx) * (1 - fy)],
        [1, 0, fx * (1 - fy)],
        [0, 1, (1 - fx) * fy],
        [1, 1, fx * fy],
      ] as Array<[number, number, number]>) {
        uv(step, i + di, j + dj, tmp);
        u += ws * w * (tmp[0] as number);
        v += ws * w * (tmp[1] as number);
      }
    }
    return [u, v];
  }
  const colourIndex = (speed: number) => {
    let c = 0;
    while (c < SPEEDS.length - 1 && speed >= (SPEEDS[c + 1] as number)) c++;
    return c;
  };

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.ve-map'),
    style: await loadStyle(),
    center: [-8.0, 42.8],
    zoom: 7,
    minZoom: 5,
    maxZoom: 11,
    maxBounds: [
      [g.lon0 - 2, g.lat0 - 1.5],
      [g.lon0 + g.nx * g.dlon + 2, g.lat0 + g.ny * g.dlat + 1.5],
    ],
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  // ---- Particles --------------------------------------------------------------------------
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  let dpr = 1;
  const resize = () => {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const count = () => Math.round(Math.min(4000, (canvas.clientWidth * canvas.clientHeight) / 260));
  let lon = new Float64Array(0);
  let lat = new Float64Array(0);
  let age = new Int32Array(0);
  const spawn = (k: number) => {
    const b = map.getBounds();
    const w = Math.max(b.getWest(), g.lon0);
    const e = Math.min(b.getEast(), g.lon0 + (g.nx - 1) * g.dlon);
    const s = Math.max(b.getSouth(), g.lat0);
    const n = Math.min(b.getNorth(), g.lat0 + (g.ny - 1) * g.dlat);
    lon[k] = w + Math.random() * Math.max(0, e - w);
    lat[k] = s + Math.random() * Math.max(0, n - s);
    age[k] = Math.floor(Math.random() * MAX_AGE);
  };
  const reset = () => {
    const n = count();
    lon = new Float64Array(n);
    lat = new Float64Array(n);
    age = new Int32Array(n);
    for (let k = 0; k < n; k++) spawn(k);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  };

  /** Move every particle one frame and draw its step; lines batched by colour. */
  const batches: number[][] = COLOURS.map(() => []);
  function step(fade: boolean) {
    if (fade) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.93)';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const b of batches) b.length = 0;
    const zoom = map.getZoom();
    for (let k = 0; k < lon.length; k++) {
      const w = sample(lon[k] as number, lat[k] as number);
      age[k] = (age[k] as number) + 1;
      if (!w || (age[k] as number) > MAX_AGE) {
        spawn(k);
        continue;
      }
      const speed = Math.hypot(w[0], w[1]);
      // Metres per pixel at this latitude and zoom: move PX_PER_MS pixels per m/s.
      const mpp = (156543.03 * Math.cos(((lat[k] as number) * Math.PI) / 180)) / 2 ** zoom;
      const metres = PX_PER_MS * mpp;
      const p0 = map.project([lon[k] as number, lat[k] as number]);
      lat[k] = (lat[k] as number) + (w[1] * metres) / 111_320;
      lon[k] =
        (lon[k] as number) +
        (w[0] * metres) / (111_320 * Math.cos(((lat[k] as number) * Math.PI) / 180));
      const p1 = map.project([lon[k] as number, lat[k] as number]);
      (batches[colourIndex(speed)] as number[]).push(p0.x, p0.y, p1.x, p1.y);
    }
    ctx.lineWidth = 1.1;
    batches.forEach((b, c) => {
      if (b.length === 0) return;
      ctx.strokeStyle = COLOURS[c] as string;
      ctx.beginPath();
      for (let i = 0; i < b.length; i += 4) {
        ctx.moveTo(b[i] as number, b[i + 1] as number);
        ctx.lineTo(b[i + 2] as number, b[i + 3] as number);
      }
      ctx.stroke();
    });
  }

  /** Still streamlines for reduced motion: each particle run for a while, no fading. */
  function still() {
    reset();
    ctx.globalAlpha = 0.5;
    for (let f = 0; f < 30; f++) step(false);
    ctx.globalAlpha = 1;
  }

  // ---- Clock and controls -----------------------------------------------------------------
  const tz = { timeZone: 'Europe/Madrid' } as const;
  // Own day and month names: browsers without Galician data would fall back to Spanish.
  const weekdays = (dict.pulse_weekdays ?? '').split(',');
  const monthNames = (dict.pulse_months ?? '').split(',');
  const partsFmt = new Intl.DateTimeFormat('en-GB', {
    ...tz,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
  const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayFmt = {
    format: (d: Date) => {
      const parts = Object.fromEntries(partsFmt.formatToParts(d).map((p) => [p.type, p.value]));
      return fill(dict.pulse_date ?? '', {
        weekday: weekdays[SHORT.indexOf(parts.weekday ?? '')] ?? '',
        day: String(Number(parts.day ?? '')),
        month: monthNames[Number(parts.month) - 1] ?? '',
      });
    },
  };
  const hourFmt = new Intl.DateTimeFormat(loc, { ...tz, hour: '2-digit', minute: '2-digit' });
  const stepMs = (hours[1] ?? (hours[0] as number) + 3 * 3_600_000) - (hours[0] as number);
  range.max = String(steps.length - 1);
  let playing = !reducedMotion.matches;
  let last: number | null = null;
  let picked: [number, number] | null = null;

  function render() {
    const t = new Date((hours[0] as number) + tStep * stepMs);
    clock.textContent = hourFmt.format(t);
    nowEl.textContent = `${dayFmt.format(t)} · ${fill(dict.wind_run ?? '', {
      d: dayFmt.format(new Date(run)),
      h: hourFmt.format(new Date(run)),
    })}`;
    range.value = String(tStep);
    renderPicked();
  }

  function renderPicked() {
    if (!picked) {
      detail.textContent = dict.wind_pick ?? '';
      return;
    }
    const w = sample(picked[0], picked[1]);
    if (!w) {
      detail.textContent = '';
      return;
    }
    const speed = Math.hypot(w[0], w[1]);
    if (speed < 0.5) {
      detail.textContent = dict.wind_calm ?? '';
      return;
    }
    // Direction the wind comes from, in eight points.
    const from = ((Math.atan2(-w[0], -w[1]) * 180) / Math.PI + 360) % 360;
    const dirs = (dict.wind_dirs ?? '').split(',');
    detail.textContent = fill(dict.wind_here ?? '', {
      kmh: Math.round(speed * 3.6),
      ms: new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(speed),
      from: dirs[Math.round(from / 45) % 8] ?? '',
    });
  }

  function frame(now: number) {
    if (last !== null && playing) {
      tStep += ((now - last) / 1000) * HOURS_PER_S * (3_600_000 / stepMs);
      if (tStep > steps.length - 1) tStep = 0;
      render();
    }
    last = now;
    step(true);
    if (!reducedMotion.matches) requestAnimationFrame(frame);
  }

  function setPlaying(on: boolean) {
    playing = on;
    playBtn.textContent = dict[on ? 'pulse_pause' : 'pulse_play'] ?? '';
    playBtn.setAttribute('aria-pressed', String(!on));
    last = null;
  }
  playBtn.hidden = reducedMotion.matches;
  playBtn.addEventListener('click', () => setPlaying(!playing));
  range.addEventListener('input', () => {
    setPlaying(false);
    tStep = Number(range.value);
    render();
    if (reducedMotion.matches) still();
  });
  map.on('click', (e) => {
    picked = [e.lngLat.lng, e.lngLat.lat];
    renderPicked();
  });
  // Trails drawn for one view make no sense in another: clear and respawn on every move.
  map.on('movestart', () => ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight));
  map.on('moveend', () => (reducedMotion.matches ? still() : reset()));
  window.addEventListener('resize', () => {
    resize();
    reset();
  });

  // The camera and the particles need no basemap tiles: start at once, not on 'load'.
  {
    const panel = q<HTMLElement>('.ve-panel').getBoundingClientRect();
    const wide = window.innerWidth >= 700;
    map.fitBounds(
      [
        [-9.4, 41.8],
        [-6.7, 43.8],
      ],
      {
        padding: wide
          ? { left: panel.width + 40, right: 50 + pickerRoom(), top: 20, bottom: 20 }
          : { left: 10, right: 10, top: panel.height + 10, bottom: 10 },
        animate: false,
      },
    );
    reset();
    tStep = Math.round(nowStep * 1000) / 1000;
    setPlaying(playing);
    render();
    if (reducedMotion.matches) still();
    else requestAnimationFrame(frame);
  }
}
