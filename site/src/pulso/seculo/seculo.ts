// /pulso/seculo/: a century of population in every concello, census by census (INE 1900–2021,
// on today's boundaries). Concellos (the site's own concellos-parroquias tiles) are coloured by
// their population against 1900; the clock jumps from census to census with no interpolation.
// Below, Galicia's population per census with the picked concello's curve on top; in the
// panel, its detail; a table of the largest gains and losses.
//
// Data: the poboacion-seculo layer (INE), served from this site.

import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { colourOf } from '../estacion/engine.ts';
import { fill, loadStyle } from '../pulso.ts';

interface Concello {
  code: string;
  name: string;
  pop: Array<number | null>;
  index: Array<number | null>;
  unit: string[];
  includes: string[];
}
type Dict = Record<string, string>;

const LAYER = 'poboacion-seculo';
const SHAPES = 'concellos-parroquias';
const SPEEDS = [2, 3, 5];
/** Brown for loss, white for the same people as in 1900, purple for growth. */
export const CENTURY_STOPS: Array<[number, string]> = [
  [25, '#7f3b08'],
  [50, '#e08214'],
  [75, '#fdb863'],
  [100, '#f7f7f2'],
  [150, '#b2abd2'],
  [250, '#8073ac'],
  [400, '#2d004b'],
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.se-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(loc);
  const f0 = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
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
  let years: number[] = [];
  let galicia: number[] = [];
  let tiles: string | null = null;
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown; tiles?: string }>;
    };
    tiles = catalog.layers.find((l) => l.id === SHAPES)?.tiles ?? null;
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      const fc = (await (await fetch(asset(`data/${LAYER}/data.geojson`))).json()) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      concellos = fc.features.map(({ properties: p }) => ({
        code: String(p.codigo_ine),
        name: String(p.nome),
        pop: p.poboacion as Array<number | null>,
        index: p.indice_1900 as Array<number | null>,
        unit: p.unidade as string[],
        includes: p.inclue as string[],
      }));
      years = (fc.features[0]?.properties.censos as number[]) ?? [];
      galicia = (fc.features[0]?.properties.galicia as number[]) ?? [];
      sources.textContent = layer.attribution;
    }
  } catch {
    // Handled below.
  }
  if (concellos.length === 0 || !tiles || years.length === 0) {
    status.textContent = dict.century_missing ?? '';
    return;
  }
  const byCode = new Map(concellos.map((c) => [c.code, c]));

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = years.indexOf(Number(params.get('t')));
  let slot = fromHash >= 0 ? fromHash : years.length - 1;
  let selected: string | null = byCode.has(params.get('c') ?? '') ? params.get('c') : null;
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;
  const writeHash = () => {
    const p = new URLSearchParams();
    p.set('t', String(years[slot]));
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
    [
      'in',
      ['get', 'codigo_ine'],
      ['literal', selected ? (byCode.get(selected)?.unit ?? [selected]) : []],
    ],
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
      id: 'seculo-fill',
      type: 'fill',
      source: SHAPES,
      'source-layer': SHAPES,
      filter: concelloFilter,
      paint: { 'fill-color': '#555', 'fill-opacity': 0.9 },
    });
    map.addLayer({
      id: 'seculo-line',
      type: 'line',
      source: SHAPES,
      'source-layer': SHAPES,
      filter: concelloFilter,
      paint: { 'line-color': '#111210', 'line-width': 0.35 },
    });
    map.addLayer({
      id: 'seculo-selected',
      type: 'line',
      source: SHAPES,
      'source-layer': SHAPES,
      filter: selectedFilter(),
      paint: { 'line-color': '#ffffff', 'line-width': 2 },
    });
    map.on('click', 'seculo-fill', (e) => {
      const code = e.features?.[0]?.properties?.codigo_ine;
      if (typeof code === 'string' && byCode.has(code)) select(code);
    });
    map.on('mouseenter', 'seculo-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'seculo-fill', () => {
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
          right: wide ? 60 : 10,
          top: Math.max(10, top),
          bottom,
        },
        animate: false,
      },
    );
  }

  function paint() {
    if (!map.getLayer('seculo-fill')) return;
    const pairs: string[] = [];
    for (const c of concellos) {
      const v = c.index[slot];
      if (v === null || v === undefined) continue;
      pairs.push(c.code, colourOf(v, CENTURY_STOPS));
    }
    map.setPaintProperty('seculo-fill', 'fill-color', [
      'match',
      ['get', 'codigo_ine'],
      ...pairs,
      '#3a3b35',
    ] as unknown as ExpressionSpecification);
    map.setFilter('seculo-selected', selectedFilter());
  }

  // ---- Panel --------------------------------------------------------------------------------
  function render() {
    const y = years[slot] as number;
    clockEl.textContent = String(y);
    let up = 0;
    let down = 0;
    for (const c of concellos) {
      const v = c.index[slot];
      if (v === null || v === undefined) continue;
      if (v > 100) up++;
      else if (v < 100) down++;
    }
    nowEl.textContent = fill(dict.century_now ?? '', {
      pop: nf.format(galicia[slot] ?? 0),
      index: f0.format((100 * (galicia[slot] ?? 0)) / (galicia[0] ?? 1)),
      up,
      down,
    });
    renderDetail();
    range.value = String(slot);
    drawPlayhead();
  }

  function renderDetail() {
    const c = selected ? byCode.get(selected) : undefined;
    if (!c) {
      detail.textContent = dict.century_pick ?? '';
      return;
    }
    const parts: HTMLElement[] = [];
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    const pop = c.pop[slot];
    strong.textContent = fill(dict.century_detail ?? '', {
      name: c.name,
      pop: pop === null || pop === undefined ? '–' : nf.format(pop),
      y: years[slot] as number,
      index:
        c.index[slot] === null || c.index[slot] === undefined
          ? '–'
          : f0.format(c.index[slot] as number),
    });
    p.append(strong);
    parts.push(p);
    if (c.unit.length > 1) {
      const u = document.createElement('p');
      u.textContent = fill(dict.century_detail_unit ?? '', {
        others: c.unit
          .filter((x) => x !== c.code)
          .map((x) => byCode.get(x)?.name ?? x)
          .join(', '),
      });
      parts.push(u);
    }
    if (c.includes.length) {
      const inc = document.createElement('p');
      inc.textContent = fill(dict.century_detail_includes ?? '', { names: c.includes.join(', ') });
      parts.push(inc);
    }
    detail.replaceChildren(...parts);
  }

  function select(code: string) {
    selected = code;
    paint();
    renderDetail();
    drawCurve();
    writeHash();
  }

  // ---- Census bars ------------------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  let bars: SVGRectElement[] = [];
  function drawCurve() {
    const step = W / years.length;
    const gMax = Math.max(...galicia);
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    bars = years.map((y, k) => {
      const v = galicia[k] ?? 0;
      const top = H - 16 - (v / gMax) * (H - 26);
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', (k * step + 5).toFixed(1));
      r.setAttribute('width', (step - 10).toFixed(1));
      r.setAttribute('y', top.toFixed(1));
      r.setAttribute('height', (H - 16 - top).toFixed(1));
      r.setAttribute('class', 'se-bar');
      r.addEventListener('click', () => {
        slot = k;
        update();
      });
      curve.append(r);
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', (k * step + step / 2).toFixed(1));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'se-tick');
      tx.textContent = String(y);
      curve.append(tx);
      return r;
    });
    const mine = selected ? byCode.get(selected) : undefined;
    if (mine) {
      const vals = mine.index.filter((v): v is number => v !== null);
      const hi = Math.max(100, ...vals);
      const pts = mine.index.map((v, k) =>
        v === null ? null : ([k * step + step / 2, H - 16 - (v / hi) * (H - 26)] as const),
      );
      const d = pts
        .map((p, k) =>
          p ? `${k && pts[k - 1] ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}` : '',
        )
        .join('');
      const line = document.createElementNS(ns, 'path');
      line.setAttribute('d', d);
      line.setAttribute('class', 'se-mine-line');
      curve.append(line);
      for (const p of pts) {
        if (!p) continue;
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', p[0].toFixed(1));
        c.setAttribute('cy', p[1].toFixed(1));
        c.setAttribute('r', '4');
        c.setAttribute('class', 'se-mine');
        curve.append(c);
      }
    }
    const maxYear = years[galicia.indexOf(gMax)];
    curve.setAttribute(
      'aria-label',
      fill(dict.century_curve_label ?? '', {
        first: nf.format(galicia[0] ?? 0),
        last: nf.format(galicia[galicia.length - 1] ?? 0),
        max: nf.format(gMax),
        maxYear: maxYear ?? '',
      }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    bars.forEach((b, k) => {
      b.classList.toggle('is-now', k === slot);
    });
  }

  // ---- Table ------------------------------------------------------------------------------
  function table() {
    const y = years[slot] as number;
    caption.textContent = fill(dict.century_table_caption ?? '', { y });
    const ranked = [...concellos]
      .filter((c) => c.index[slot] !== null && c.unit.length === 1)
      .sort((a, b) => (b.index[slot] ?? 0) - (a.index[slot] ?? 0));
    const pick = [...ranked.slice(0, 15), ...ranked.slice(-15)];
    tbody.replaceChildren(
      ...pick.map((c) => {
        const tr = document.createElement('tr');
        [
          c.name,
          nf.format(c.pop[0] ?? 0),
          nf.format(c.pop[slot] ?? 0),
          f0.format(c.index[slot] ?? 0),
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
  const update = () => {
    paint();
    render();
    table();
    writeHash();
  };
  range.min = '0';
  range.max = String(years.length - 1);
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
        slot = (slot + 1) % years.length;
        update();
      }, speed * 1000);
    }
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));
  for (const sp of SPEEDS) {
    const o = document.createElement('option');
    o.value = String(sp);
    o.textContent = fill(dict.century_speed_opt ?? '', { s: sp });
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
