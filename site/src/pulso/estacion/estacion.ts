// /pulso/estacion/: the seasonal population load of every concello, quarter by quarter (IGE).
// Concellos (the site's own concellos-parroquias tiles) are coloured by their load rate; the
// clock jumps from quarter to quarter with no interpolation, as the source is quarterly.
// 2025 is provisional with two quarters; the two still unpublished are shown empty. Below,
// Galicia's rate per quarter with the selected concello on top; in the panel, its detail.
//
// Data: the poboacion-estacional layer (IGE), served from this site.

import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl';
import { asset } from '../../paths.ts';
import { fill, loadStyle } from '../pulso.ts';
import { colourOf } from './engine.ts';

interface Concello {
  code: string;
  name: string;
  taxa: Array<number | null>;
  carga: Array<number | null>;
  residentes: Array<number | null>;
  parts: Record<
    'turismo' | 'segundas_vivendas' | 'estudos' | 'traballo' | 'saude',
    Array<number | null>
  >;
}
type Dict = Record<string, string>;

const LAYER = 'poboacion-estacional';
const SHAPES = 'concellos-parroquias';
/** Published quarters plus the ones still to come, so the gap is visible. */
const SLOTS = [
  '2024/I',
  '2024/II',
  '2024/III',
  '2024/IV',
  '2025/I',
  '2025/II',
  '2025/III',
  '2025/IV',
];
const SPEEDS = [2, 4, 8];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.es-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(loc);
  const f1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const sf = new Intl.NumberFormat(loc, { signDisplay: 'exceptZero' });
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;

  const clockEl = q<HTMLElement>('.es-clock');
  const nowEl = q<HTMLElement>('.es-now');
  const detail = q<HTMLElement>('.es-detail');
  const status = q<HTMLElement>('.es-status');
  const range = q<HTMLInputElement>('.es-range');
  const playBtn = q<HTMLButtonElement>('.es-play');
  const speedSel = q<HTMLSelectElement>('.es-speed');
  const curve = q<SVGSVGElement>('.es-curve svg');
  const tbody = q<HTMLElement>('.es-table tbody');
  const caption = q<HTMLElement>('.es-table caption');
  const sources = q<HTMLElement>('.es-sources');

  // ---- Data -------------------------------------------------------------------------------
  let concellos: Concello[] = [];
  let quarters: string[] = [];
  let galicia: Array<number | null> = [];
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
        taxa: p.taxa as Array<number | null>,
        carga: p.carga as Array<number | null>,
        residentes: p.residentes as Array<number | null>,
        parts: {
          turismo: p.turismo as Array<number | null>,
          segundas_vivendas: p.segundas_vivendas as Array<number | null>,
          estudos: p.estudos as Array<number | null>,
          traballo: p.traballo as Array<number | null>,
          saude: p.saude as Array<number | null>,
        },
      }));
      quarters = (fc.features[0]?.properties.trimestres as string[]) ?? [];
      galicia = (fc.features[0]?.properties.galicia_taxa as Array<number | null>) ?? [];
      sources.textContent = layer.attribution;
    }
  } catch {
    // Handled below.
  }
  if (concellos.length === 0 || !tiles) {
    status.textContent = dict.season_missing ?? '';
    return;
  }
  const byCode = new Map(concellos.map((c) => [c.code, c]));
  /** Index of a slot in the published quarters, or -1 while unpublished. */
  const qi = (slot: number) => quarters.indexOf(SLOTS[slot] as string);
  const published = SLOTS.map((_, i) => i).filter((i) => qi(i) >= 0);

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = SLOTS.indexOf((params.get('t') ?? '').replace('-', '/'));
  let slot = fromHash >= 0 ? fromHash : (published.find((i) => SLOTS[i] === '2024/III') ?? 0);
  let selected: string | null = byCode.has(params.get('c') ?? '') ? params.get('c') : null;
  let playing = !reducedMotion.matches;
  let speed = SPEEDS[1] as number;
  const writeHash = () => {
    const p = new URLSearchParams();
    p.set('t', (SLOTS[slot] as string).replace('/', '-'));
    if (selected) p.set('c', selected);
    history.replaceState(null, '', `#${p.toString()}`);
  };
  const roman = (s: string) => s.split('/')[1] ?? '';

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.es-map'),
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
  const concelloFilter: ExpressionSpecification = ['==', ['get', 'nivel'], 'concello'];
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
      id: 'estacion-fill',
      type: 'fill',
      source: SHAPES,
      'source-layer': SHAPES,
      filter: concelloFilter,
      paint: { 'fill-color': '#555', 'fill-opacity': 0.85 },
    });
    map.addLayer({
      id: 'estacion-line',
      type: 'line',
      source: SHAPES,
      'source-layer': SHAPES,
      filter: concelloFilter,
      paint: { 'line-color': '#111210', 'line-width': 0.4 },
    });
    map.addLayer({
      id: 'estacion-selected',
      type: 'line',
      source: SHAPES,
      'source-layer': SHAPES,
      filter: ['all', concelloFilter, ['==', ['get', 'codigo_ine'], selected ?? '']],
      paint: { 'line-color': '#ffffff', 'line-width': 2 },
    });
    map.on('click', 'estacion-fill', (e) => {
      const code = e.features?.[0]?.properties?.codigo_ine;
      if (typeof code === 'string' && byCode.has(code)) select(code);
    });
    map.on('mouseenter', 'estacion-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'estacion-fill', () => {
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
    const panel = q<HTMLElement>('.es-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.es-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.es-map').getBoundingClientRect();
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

  /** Fill colour per concello for the current slot; grey when the quarter is unpublished. */
  function paint() {
    if (!map.getLayer('estacion-fill')) return;
    const i = qi(slot);
    if (i < 0) {
      map.setPaintProperty('estacion-fill', 'fill-color', '#2a2b26');
    } else {
      const pairs: Array<string> = [];
      for (const c of concellos) {
        const v = c.taxa[i];
        if (v === null || v === undefined) continue;
        pairs.push(c.code, colourOf(v));
      }
      map.setPaintProperty('estacion-fill', 'fill-color', [
        'match',
        ['get', 'codigo_ine'],
        ...pairs,
        '#3a3b35',
      ] as unknown as ExpressionSpecification);
    }
    map.setFilter('estacion-selected', [
      'all',
      concelloFilter,
      ['==', ['get', 'codigo_ine'], selected ?? ''],
    ]);
  }

  // ---- Panel --------------------------------------------------------------------------------
  function render() {
    const s = SLOTS[slot] as string;
    const i = qi(slot);
    const provisional = s.startsWith('2025');
    const label = fill(dict.season_quarter ?? '', { q: roman(s) });
    clockEl.innerHTML = '';
    clockEl.append(`${s.slice(0, 4)} · ${label}`);
    if (provisional) {
      const b = document.createElement('span');
      b.className = 'es-badge';
      b.textContent = dict.season_provisional ?? '';
      clockEl.append(b);
    }
    if (i < 0) {
      nowEl.textContent = dict.season_missing_quarter ?? '';
    } else {
      const top = [...concellos]
        .filter((c) => c.taxa[i] !== null)
        .sort((a, b) => (b.taxa[i] ?? 0) - (a.taxa[i] ?? 0))
        .slice(0, 3)
        .map((c) => `${c.name} ${f1.format(c.taxa[i] as number)} %`)
        .join(', ');
      nowEl.textContent = fill(dict.season_now ?? '', { rate: f1.format(galicia[i] ?? 0), top });
    }
    renderDetail();
    range.value = String(slot);
    drawPlayhead();
  }

  function renderDetail() {
    const c = selected ? byCode.get(selected) : undefined;
    const i = qi(slot);
    if (!c) {
      detail.textContent = dict.season_pick ?? '';
      return;
    }
    if (i < 0 || c.taxa[i] === null) {
      detail.textContent = `${c.name}: ${dict.season_missing_quarter ?? ''}`;
      return;
    }
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = fill(dict.season_detail ?? '', {
      name: c.name,
      rate: f1.format(c.taxa[i] as number),
      load: nf.format(c.carga[i] ?? 0),
      res: nf.format(c.residentes[i] ?? 0),
    });
    p.append(strong);
    const parts = document.createElement('p');
    const v = (k: keyof Concello['parts']) => sf.format(c.parts[k][i] ?? 0);
    parts.textContent = fill(dict.season_parts ?? '', {
      tur: v('turismo'),
      sv: v('segundas_vivendas'),
      est: v('estudos'),
      tra: v('traballo'),
      sau: v('saude'),
    });
    detail.replaceChildren(p, parts);
  }

  function select(code: string) {
    selected = code;
    paint();
    renderDetail();
    drawCurve();
    writeHash();
  }

  // ---- Quarter bars -------------------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const step = W / SLOTS.length;
  let bars: SVGRectElement[] = [];
  function drawCurve() {
    const mine = selected ? byCode.get(selected) : undefined;
    const vals = [...galicia, ...(mine?.taxa ?? [])].filter((v): v is number => v !== null);
    const lo = Math.min(90, ...vals);
    const hi = Math.max(110, ...vals);
    const yOf = (v: number) => H - 16 - ((v - lo) / (hi - lo)) * (H - 26);
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curve.replaceChildren();
    bars = SLOTS.map((s, k) => {
      const i = qi(k);
      const v = i >= 0 ? galicia[i] : null;
      const r = document.createElementNS(ns, 'rect');
      const top = v === null || v === undefined ? 10 : yOf(v);
      r.setAttribute('x', (k * step + 6).toFixed(1));
      r.setAttribute('width', (step - 12).toFixed(1));
      r.setAttribute('y', top.toFixed(1));
      r.setAttribute('height', (H - 16 - top).toFixed(1));
      r.setAttribute('class', v === null || v === undefined ? 'es-bar is-missing' : 'es-bar');
      r.addEventListener('click', () => {
        slot = k;
        update();
      });
      curve.append(r);
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', (k * step + step / 2).toFixed(1));
      tx.setAttribute('y', String(H - 2));
      tx.setAttribute('class', 'es-tick');
      tx.textContent = s;
      curve.append(tx);
      return r;
    });
    if (mine) {
      const pts = SLOTS.map((_, k) => {
        const i = qi(k);
        const v = i >= 0 ? mine.taxa[i] : null;
        return v === null || v === undefined ? null : ([k * step + step / 2, yOf(v)] as const);
      });
      const d = pts
        .map((p, k) =>
          p ? `${k && pts[k - 1] ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}` : '',
        )
        .join('');
      const line = document.createElementNS(ns, 'path');
      line.setAttribute('d', d);
      line.setAttribute('class', 'es-mine-line');
      curve.append(line);
      for (const p of pts) {
        if (!p) continue;
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', p[0].toFixed(1));
        c.setAttribute('cy', p[1].toFixed(1));
        c.setAttribute('r', '4');
        c.setAttribute('class', 'es-mine');
        curve.append(c);
      }
    }
    const gv = galicia.filter((v): v is number => v !== null);
    curve.setAttribute(
      'aria-label',
      fill(dict.season_curve_label ?? '', {
        min: f1.format(Math.min(...gv)),
        max: f1.format(Math.max(...gv)),
      }),
    );
    drawPlayhead();
  }
  function drawPlayhead() {
    bars.forEach((b, k) => {
      b.classList.toggle('is-now', k === slot && qi(k) >= 0);
    });
  }

  // ---- Table ------------------------------------------------------------------------------
  function table() {
    const i = qi(slot);
    caption.textContent = fill(dict.season_table_caption ?? '', { q: SLOTS[slot] as string });
    if (i < 0) {
      tbody.replaceChildren();
      return;
    }
    const top = [...concellos]
      .filter((c) => c.taxa[i] !== null)
      .sort((a, b) => (b.taxa[i] ?? 0) - (a.taxa[i] ?? 0))
      .slice(0, 20);
    tbody.replaceChildren(
      ...top.map((c) => {
        const tr = document.createElement('tr');
        [
          c.name,
          f1.format(c.taxa[i] as number),
          nf.format(c.carga[i] ?? 0),
          nf.format(c.residentes[i] ?? 0),
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
  range.max = String(SLOTS.length - 1);
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
        // Through the published quarters only; the empty ones are there to look at, not to wait on.
        const next = published.find((k) => k > slot) ?? published[0] ?? 0;
        slot = next;
        update();
      }, speed * 1000);
    }
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));
  for (const sp of SPEEDS) {
    const o = document.createElement('option');
    o.value = String(sp);
    o.textContent = fill(dict.season_speed_opt ?? '', { s: sp });
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
