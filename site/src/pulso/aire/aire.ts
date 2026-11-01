// /pulso/aire/: the last 24 hours of air quality at the stations of the Galician network.
// Each station is a dot coloured by its ICA band that grows and breathes with the index;
// stations at «regular» or worse carry their name and the pollutant that sets the index.
// Below, stations per band in each hour; in the panel, an hourly table.
//
// Data: the aire-24h layer (MeteoGalicia), served from this site.

import type { Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { fill, loadStyle, pickerRoom } from '../pulso.ts';
import { DAY, valueAt } from '../tempo/engine.ts';
import { BANDS, band, bandCounts } from './engine.ts';

interface Station {
  id: number;
  name: string;
  lonlat: [number, number];
  ica: Array<number | null>;
  dominant: Array<string | null>;
}
type Dict = Record<string, string>;

const LAYER = 'aire-24h';
const SPEEDS = [45, 90, 180];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.ai-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const f1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;

  const canvas = q<HTMLCanvasElement>('.ai-canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const clockEl = q<HTMLElement>('.ai-clock');
  const nowEl = q<HTMLElement>('.ai-now');
  const periodEl = q<HTMLElement>('.ai-period');
  const status = q<HTMLElement>('.ai-status');
  const range = q<HTMLInputElement>('.ai-range');
  const playBtn = q<HTMLButtonElement>('.ai-play');
  const speedSel = q<HTMLSelectElement>('.ai-speed');
  const curve = q<SVGSVGElement>('.ai-curve svg');
  const tbody = q<HTMLElement>('.ai-table tbody');
  const caption = q<HTMLElement>('.ai-table caption');
  const sources = q<HTMLElement>('.ai-sources');

  // ---- Data -------------------------------------------------------------------------------
  let stations: Station[] = [];
  let start0 = 0;
  let layerStatus = 'fresh';
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: { status?: string } | null }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      const fc = (await (await fetch(asset(`data/${LAYER}/data.geojson`))).json()) as {
        features: Array<{
          geometry: { coordinates: [number, number] };
          properties: Record<string, unknown>;
        }>;
      };
      stations = fc.features.map((f) => ({
        id: Number(f.properties.id),
        name: String(f.properties.nome),
        lonlat: f.geometry.coordinates,
        ica: f.properties.ica as Array<number | null>,
        dominant: f.properties.dominante as Array<string | null>,
      }));
      start0 = Date.parse(String(fc.features[0]?.properties.inicio ?? ''));
      layerStatus = layer.meta.status ?? 'fresh';
      sources.textContent = layer.attribution;
    }
  } catch {
    // Handled below.
  }
  if (stations.length === 0 || !Number.isFinite(start0)) {
    status.textContent = dict.air_missing ?? '';
    return;
  }
  const counts = bandCounts(stations.map((s) => s.ica));

  const hourFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const dayMonth = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'numeric',
  });
  const dateOf = (d: Date) => {
    const [day, month] = dayMonth.format(d).split('/').map(Number) as [number, number];
    return `${day} de ${(dict.pulse_months ?? '').split(',')[month - 1] ?? ''}`;
  };
  const label = (sec: number) => hourFmt.format(new Date(start0 + sec * 1000));
  const end = new Date(start0 + 23 * 3600_000);
  periodEl.textContent =
    fill(dict.air_period ?? '', { hour: hourFmt.format(end), date: dateOf(end) }) +
    (Date.now() - end.getTime() > 3 * 3600_000 || layerStatus !== 'fresh'
      ? ` ${dict.weather_period_stale ?? ''}`
      : '');

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const hm = /^(\d{1,2})$/.exec(params.get('h') ?? '');
  let s = hm ? Number(hm[1]) * 3600 : 23 * 3600;
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;
  const writeHash = () => history.replaceState(null, '', `#h=${Math.floor(s / 3600)}`);

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.ai-map'),
    style: await loadStyle(),
    center: [-8.0, 42.8],
    zoom: 7,
    minZoom: 4,
    maxZoom: 13,
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
    const panel = q<HTMLElement>('.ai-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.ai-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.ai-map').getBoundingClientRect();
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
    const zk = 2 ** (map.getZoom() - 7);
    const hour = Math.min(23, Math.floor(s / 3600));
    // A slow breath, so the map is alive between hourly readings.
    const breath = 1 + 0.08 * Math.sin((s / 3600) * Math.PI * 2);
    let worst: { v: number; st: Station } | null = null;
    let good = 0;
    let bad = 0;
    const labels: Array<{ x: number; y: number; text: string }> = [];
    // Worse stations drawn last, on top.
    const order = [...stations].sort((a, b) => (valueAt(a.ica, s) ?? 0) - (valueAt(b.ica, s) ?? 0));
    for (const st of order) {
      const v = valueAt(st.ica, s);
      if (v === null) continue;
      if (v < 2) good++;
      else bad++;
      if (!worst || v > worst.v) worst = { v, st };
      const p = map.project(st.lonlat);
      const colour = BANDS[band(v)]?.colour ?? '#888';
      const r = (3 + v * 2.2) * zk * breath;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
      g.addColorStop(0, `${colour}cc`);
      g.addColorStop(1, `${colour}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, r * 0.45), 0, Math.PI * 2);
      ctx.fill();
      if (v >= 2)
        labels.push({ x: p.x, y: p.y - r - 6, text: `${st.name} · ${st.dominant[hour] ?? ''}` });
    }
    ctx.font = '600 12px "Source Sans 3", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(17, 18, 16, 0.9)';
    ctx.fillStyle = '#fff';
    for (const l of labels) {
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillText(l.text, l.x, l.y);
    }
    clockEl.textContent = label(hour * 3600);
    nowEl.textContent = worst
      ? fill(dict.air_now ?? '', {
          n: good + bad,
          good,
          bad,
          worst: `${worst.st.name} ${f1.format(worst.v)}`,
          pollutant: worst.st.dominant[hour] ?? '–',
        })
      : '';
    range.value = String(s);
    drawPlayhead();
  }

  // ---- Stacked bars -----------------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const xOf = (sec: number) => (sec / DAY) * W;
  const playhead = document.createElementNS(ns, 'line');
  function drawCurve() {
    const total = Math.max(1, ...counts.map((c) => c.reduce((a, b) => a + b, 0)));
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    counts.forEach((c, h) => {
      let y = H - 16;
      c.forEach((n, b) => {
        if (n === 0) return;
        const hgt = (n / total) * (H - 26);
        y -= hgt;
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', (xOf(h * 3600) + 1).toFixed(1));
        r.setAttribute('width', (xOf(3600) - 2).toFixed(1));
        r.setAttribute('y', y.toFixed(1));
        r.setAttribute('height', hgt.toFixed(1));
        r.setAttribute('fill', BANDS[b]?.colour ?? '#888');
        curve.append(r);
      });
    });
    for (let h = 0; h < 24; h += 3) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', xOf(h * 3600 + 1800).toFixed(1));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'ai-tick');
      tx.textContent = label(h * 3600);
      curve.append(tx);
    }
    playhead.setAttribute('class', 'ai-playhead');
    playhead.setAttribute('y1', '0');
    playhead.setAttribute('y2', String(H - 16));
    curve.append(playhead);
    const badPer = counts.map((c) => c.slice(2).reduce((a, b) => a + b, 0));
    const maxBad = Math.max(...badPer);
    curve.setAttribute(
      'aria-label',
      fill(dict.air_curve_label ?? '', { bad: maxBad, hour: label(badPer.indexOf(maxBad) * 3600) }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    const x = xOf(Math.floor(s / 3600) * 3600 + 1800).toFixed(1);
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
  caption.textContent = fill(dict.air_table_caption ?? '', { n: stations.length });
  tbody.replaceChildren(
    ...counts.map((c, h) => {
      let worst: Station | null = null;
      let wv = -1;
      for (const st of stations) {
        const v = st.ica[h];
        if (v !== null && v !== undefined && v > wv) {
          wv = v;
          worst = st;
        }
      }
      const tr = document.createElement('tr');
      [
        label(h * 3600),
        String(c[0]),
        String(c[1]),
        String(c[2]),
        String((c[3] ?? 0) + (c[4] ?? 0) + (c[5] ?? 0)),
        worst ? `${worst.name} ${f1.format(wv)} ${worst.dominant[h] ?? ''}` : '–',
      ].forEach((text, k) => {
        const td = document.createElement(k === 0 ? 'th' : 'td');
        if (k === 0) td.setAttribute('scope', 'row');
        td.textContent = text;
        tr.append(td);
      });
      return tr;
    }),
  );

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
  drawCurve();
  draw();
  setPlaying(playing);
}
