// Client of the concello time maps (specs.ts): concellos (the site's own concellos-parroquias
// tiles) coloured by the spec's value, one step (year or month) at a time with no blending.
// Below, Galicia's figure per step with the picked concello's value on top; in the panel,
// Galicia's figures and the picked concello's; a table of the highest and lowest values.

import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { colourOf } from '../estacion/engine.ts';
import { fill, loadStyle, pickerRoom } from '../pulso.ts';
import { type Concello, SPECS, type Vars } from './specs.ts';

type Dict = Record<string, string>;

const SHAPES = 'concellos-parroquias';
const NO_DATA = '#3a3b35';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.ct-app');
  if (!found) return;
  const app: HTMLElement = found;
  const found_ = SPECS[app.dataset.slug ?? ''];
  if (!found_) return;
  const spec = found_;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const months = (dict.pulse_months ?? '').split(',');
  const k = (s: string) => dict[`${spec.prefix}_${s}`] ?? '';
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;

  const clockEl = q<HTMLElement>('.se-clock');
  const nowEl = q<HTMLElement>('.se-now');
  const detail = q<HTMLElement>('.se-detail');
  const status = q<HTMLElement>('.se-status');
  const range = q<HTMLInputElement>('.se-range');
  const playBtn = q<HTMLButtonElement>('.se-play');
  const speedSel = q<HTMLSelectElement>('.se-speed');
  const curve = q<SVGSVGElement>('.se-curve svg');
  const tbody = q<HTMLElement>('.se-table tbody');
  const caption = q<HTMLElement>('.se-table caption');
  const sources = q<HTMLElement>('.se-sources');

  // ---- Data -------------------------------------------------------------------------------
  let concellos: Concello[] = [];
  let steps: string[] = [];
  let provisional: string | null = null;
  let tiles: string | null = null;
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown; tiles?: string }>;
    };
    tiles = catalog.layers.find((l) => l.id === SHAPES)?.tiles ?? null;
    const layer = catalog.layers.find((l) => l.id === spec.layer);
    if (layer?.meta) {
      const fc = (await (await fetch(asset(`data/${spec.layer}/data.geojson`))).json()) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      concellos = fc.features.map(({ properties: p }) => ({
        code: String(p.codigo_ine),
        name: String(p.nome),
        props: p,
        value: p.valor as Array<number | null>,
      }));
      steps = (fc.features[0]?.properties.periodos as string[]) ?? [];
      provisional = (fc.features[0]?.properties.provisional as string | undefined) ?? null;
      sources.textContent = layer.attribution;
    }
  } catch {
    concellos = [];
  }
  if (concellos.length === 0 || !tiles || steps.length === 0) {
    status.textContent = k('missing');
    return;
  }
  const byCode = new Map(concellos.map((c) => [c.code, c]));
  const label = (i: number) => {
    const s = steps[i] as string;
    const text = spec.monthly ? `${months[Number(s.slice(5)) - 1] ?? ''} ${s.slice(0, 4)}` : s;
    return s === provisional ? `${text} (${dict.pulse_provisional ?? 'provisional'})` : text;
  };
  const num = (v: number | null | undefined) =>
    v === null || v === undefined ? '–' : nf.format(v);
  const texts = (v: Vars) =>
    Object.fromEntries(Object.entries(v).map(([key, x]) => [key, num(x)])) as Record<
      string,
      string
    >;
  const galicia = steps.map((_, i) => spec.galicia(concellos, i));

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = steps.indexOf(params.get('t') ?? '');
  let slot = fromHash >= 0 ? fromHash : 0;
  let selected: string | null = byCode.has(params.get('c') ?? '') ? params.get('c') : null;
  let playing = !reducedMotion.matches;
  let speed = spec.speeds[1] as number;
  const writeHash = () => {
    const p = new URLSearchParams();
    p.set('t', steps[slot] as string);
    if (selected) p.set('c', selected);
    history.replaceState(null, '', `#${p.toString()}`);
  };

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.se-map'),
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
  const concelloFilter: ExpressionSpecification = ['==', ['get', 'nivel'], 'concello'];
  const selectedFilter = (): ExpressionSpecification => [
    'all',
    concelloFilter,
    ['==', ['get', 'codigo_ine'], selected ?? ''],
  ];
  // On style load, not 'load': the concellos do not need the basemap tiles to finish.
  let added = false;
  const addLayers = () => {
    if (added || !map.isStyleLoaded()) return;
    added = true;
    map.addSource(SHAPES, {
      type: 'vector',
      url: `pmtiles://${window.location.origin}${asset(tiles as string)}`,
    });
    map.addLayer({
      id: 'ct-fill',
      type: 'fill',
      source: SHAPES,
      'source-layer': SHAPES,
      filter: concelloFilter,
      paint: { 'fill-color': NO_DATA, 'fill-opacity': 0.9 },
    });
    map.addLayer({
      id: 'ct-line',
      type: 'line',
      source: SHAPES,
      'source-layer': SHAPES,
      filter: concelloFilter,
      paint: { 'line-color': '#111210', 'line-width': 0.35 },
    });
    map.addLayer({
      id: 'ct-selected',
      type: 'line',
      source: SHAPES,
      'source-layer': SHAPES,
      filter: selectedFilter(),
      paint: { 'line-color': '#ffffff', 'line-width': 2 },
    });
    map.on('click', 'ct-fill', (e) => {
      const code = e.features?.[0]?.properties?.codigo_ine;
      if (typeof code === 'string' && byCode.has(code)) select(code);
    });
    map.on('mouseenter', 'ct-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'ct-fill', () => {
      map.getCanvas().style.cursor = '';
    });
    paint();
  };
  // Whichever comes first: some browsers report the style ready only after its first styledata.
  for (const ev of ['styledata', 'load', 'idle'] as const) map.on(ev, addLayers);
  addLayers();

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
    const panel = q<HTMLElement>('.se-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.se-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.se-map').getBoundingClientRect();
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

  function paint() {
    if (!map.getLayer('ct-fill')) return;
    const pairs: string[] = [];
    for (const c of concellos) {
      const special = spec.special?.(c, slot) ?? null;
      const v = c.value[slot];
      if (special) pairs.push(c.code, special);
      else if (v !== null && v !== undefined) pairs.push(c.code, colourOf(v, spec.stops));
    }
    map.setPaintProperty('ct-fill', 'fill-color', [
      'match',
      ['get', 'codigo_ine'],
      ...pairs,
      NO_DATA,
    ] as unknown as ExpressionSpecification);
    map.setFilter('ct-selected', selectedFilter());
  }

  // ---- Panel ------------------------------------------------------------------------------
  function render() {
    clockEl.textContent = label(slot);
    nowEl.textContent = fill(k('now'), texts(galicia[slot] as Vars));
    renderDetail();
    range.value = String(slot);
    drawPlayhead();
  }
  function renderDetail() {
    const c = selected ? byCode.get(selected) : undefined;
    if (!c) {
      detail.textContent = k('pick');
      return;
    }
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = fill(k('detail'), {
      name: c.name,
      when: label(slot),
      ...texts(spec.vars(c, slot)),
    });
    p.append(strong);
    detail.replaceChildren(p);
  }
  function select(code: string) {
    selected = code;
    paint();
    renderDetail();
    drawCurve();
    writeHash();
  }

  // ---- Galicia per step ---------------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  let bars: SVGRectElement[] = [];
  function drawCurve() {
    const step = W / steps.length;
    const values = galicia.map((g) => spec.bar(g));
    const gMax = Math.max(1, ...values);
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    bars = values.map((v, i) => {
      const top = H - 16 - (v / gMax) * (H - 26);
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', (i * step + step * 0.12).toFixed(2));
      r.setAttribute('width', Math.max(0.8, step * 0.76).toFixed(2));
      r.setAttribute('y', top.toFixed(1));
      r.setAttribute('height', (H - 16 - top).toFixed(1));
      r.setAttribute('class', 'se-bar');
      r.addEventListener('click', () => {
        slot = i;
        update();
      });
      curve.append(r);
      return r;
    });
    // Tick labels: every year start for months, every fifth year otherwise.
    steps.forEach((s, i) => {
      const show = spec.monthly ? s.endsWith('M01') : Number(s) % 5 === 0;
      if (!show) return;
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', (i * step + step / 2).toFixed(1));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'se-tick');
      tx.textContent = s.slice(0, 4);
      curve.append(tx);
    });
    const mine = selected ? byCode.get(selected) : undefined;
    if (mine) {
      const vals = mine.value.filter((v): v is number => v !== null);
      const lo = Math.min(0, ...vals);
      const hi = Math.max(1, ...vals);
      const yOf = (v: number) => H - 16 - ((v - lo) / (hi - lo)) * (H - 26);
      const d = mine.value
        .map((v, i) =>
          v === null
            ? ''
            : `${i && mine.value[i - 1] !== null ? 'L' : 'M'}${(i * step + step / 2).toFixed(1)} ${yOf(v).toFixed(1)}`,
        )
        .join('');
      const line = document.createElementNS(ns, 'path');
      line.setAttribute('d', d);
      line.setAttribute('class', 'se-mine-line');
      curve.append(line);
    }
    const maxAt = values.indexOf(Math.max(...values));
    curve.setAttribute(
      'aria-label',
      fill(k('curve_label'), {
        first: nf.format(values[0] ?? 0),
        firstWhen: label(0),
        last: nf.format(values[values.length - 1] ?? 0),
        lastWhen: label(values.length - 1),
        max: nf.format(values[maxAt] ?? 0),
        maxWhen: label(maxAt),
      }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    bars.forEach((b, i) => {
      b.classList.toggle('is-now', i === slot);
    });
  }

  // ---- Table ------------------------------------------------------------------------------
  function table() {
    caption.textContent = fill(k('table_caption'), { when: label(slot) });
    const ranked = concellos
      .filter((c) => c.value[slot] !== null && c.value[slot] !== undefined)
      .sort((a, b) => (b.value[slot] ?? 0) - (a.value[slot] ?? 0));
    const pick = ranked.length > 30 ? [...ranked.slice(0, 15), ...ranked.slice(-15)] : ranked;
    tbody.replaceChildren(
      ...pick.map((c) => {
        const v = spec.vars(c, slot);
        const tr = document.createElement('tr');
        [c.name, num(v[spec.columns[0]]), num(v[spec.columns[1]]), num(v.value)].forEach(
          (text, j) => {
            const td = document.createElement(j === 0 ? 'th' : 'td');
            if (j === 0) td.setAttribute('scope', 'row');
            td.textContent = text;
            tr.append(td);
          },
        );
        return tr;
      }),
    );
  }

  // ---- Controls ---------------------------------------------------------------------------
  const update = () => {
    paint();
    render();
    table();
    writeHash();
  };
  range.min = '0';
  range.max = String(steps.length - 1);
  range.step = '1';
  range.addEventListener('input', () => {
    slot = Number(range.value);
    update();
  });
  let timer = 0;
  const setPlaying = (p: boolean) => {
    playing = p;
    playBtn.textContent = p ? (dict.pulse_pause ?? '') : (dict.pulse_play ?? '');
    playBtn.setAttribute('aria-pressed', String(p));
    window.clearInterval(timer);
    if (p) {
      timer = window.setInterval(() => {
        slot = (slot + 1) % steps.length;
        update();
      }, speed * 1000);
    }
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));
  for (const sp of spec.speeds) {
    const o = document.createElement('option');
    o.value = String(sp);
    o.textContent = fill(k('speed_opt'), { s: nf.format(sp) });
    speedSel.append(o);
  }
  speedSel.value = String(speed);
  speedSel.addEventListener('change', () => {
    speed = Number(speedSel.value);
    if (playing) setPlaying(true);
  });

  status.textContent = '';
  frame_();
  drawCurve();
  update();
  setPlaying(playing);
}
