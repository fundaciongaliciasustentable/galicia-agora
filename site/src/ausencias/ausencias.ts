// /pulso/ausencias/: the places of Galicia left without anyone (aldeas-baleiras layer). A night
// map of every population entity: a warm light where people live, an empty ring where nobody
// does, a bright ring the year a place empties. The clock steps from 2000 to the last year of the
// INE Nomenclátor; the panel names the places emptied that year, and the bars give the count.
//
// The map reads the layer's tiles (all 30,500 points, filtered by year with the
// anos_baleira_txt text); the text reads its table.json, which only holds the places ever empty.
// Populations under 5 are never shown as numbers.

import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl';
import { asset } from '../paths.ts';
import { fill, loadStyle, pickerRoom } from '../pulso/pulso.ts';

interface Place {
  code: string;
  name: string;
  concello: string;
  years: number[];
  since: number | null;
  before2000: boolean;
}
type Dict = Record<string, string>;

const LAYER = 'aldeas-baleiras';
const FIRST = 2000;
const STEP_MS = 1400;
const LIT = '#ffcf70';
const GHOST = '#c9d3dc';
const NAMES_SHOWN = 40;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.au-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const nf = new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES');
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const clockEl = q<HTMLElement>('.au-clock');
  const nowEl = q<HTMLElement>('.au-now');
  const namesEl = q<HTMLElement>('.au-names');
  const detail = q<HTMLElement>('.au-detail');
  const status = q<HTMLElement>('.au-status');
  const range = q<HTMLInputElement>('.au-range');
  const playBtn = q<HTMLButtonElement>('.au-play');
  const curve = q<SVGSVGElement>('.au-curve svg');
  const tbody = q<HTMLElement>('.au-table tbody');
  const caption = q<HTMLElement>('.au-table caption');
  const sources = q<HTMLElement>('.au-sources');

  // ---- Data -------------------------------------------------------------------------------
  let places: Place[] = [];
  let tiles: string | null = null;
  const concelloName = new Map<string, string>();
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown; tiles?: string }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    tiles = layer?.tiles ?? null;
    if (layer?.meta) {
      sources.textContent = layer.attribution;
      const [rows, names] = await Promise.all([
        fetch(asset(`data/${LAYER}/table.json`)).then(
          (r) => r.json() as Promise<Array<Record<string, unknown>>>,
        ),
        // Concello names, from a small table already on the site; codes if it is missing.
        fetch(asset('data/galicia-deformada/table.json'))
          .then((r) => (r.ok ? (r.json() as Promise<Array<Record<string, unknown>>>) : []))
          .catch(() => []),
      ]);
      for (const n of names) concelloName.set(String(n.codigo_ine), String(n.nome));
      places = rows.map((p) => ({
        code: String(p.codigo),
        name: String(p.nome),
        concello: String(p.codigo).slice(0, 5),
        years: (p.anos_baleira as number[]) ?? [],
        since: (p.baleira_desde as number | null) ?? null,
        before2000: Boolean(p.baleira_antes_2000),
      }));
    }
  } catch {
    // Handled below.
  }
  if (places.length === 0 || !tiles) {
    status.textContent = dict.absence_missing ?? '';
    return;
  }
  status.textContent = '';
  const last = Math.max(...places.flatMap((p) => p.years));
  const years: number[] = [];
  for (let y = FIRST; y <= last; y++) years.push(y);
  const empty = new Map(years.map((y) => [y, 0]));
  const emptiedIn = new Map<number, Place[]>(years.map((y) => [y, []]));
  for (const p of places) {
    const set = new Set(p.years);
    for (const y of p.years) {
      empty.set(y, (empty.get(y) ?? 0) + 1);
      // Emptied that year: at 0 now and not the year before (2000 has no year before).
      if (y > FIRST && !set.has(y - 1)) emptiedIn.get(y)?.push(p);
    }
  }
  const concelloOf = (code: string) => concelloName.get(code) ?? code;

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const fromHash = years.indexOf(Number(params.get('t')));
  let slot = fromHash >= 0 ? fromHash : 0;
  let playing = !reducedMotion.matches && fromHash < 0;
  let timer: number | null = null;
  let picked: Record<string, unknown> | null = null;
  const writeHash = () => history.replaceState(null, '', `#t=${years[slot]}`);

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.au-map'),
    style: await loadStyle(),
    center: [-8.0, 42.8],
    zoom: 7,
    minZoom: 5,
    maxZoom: 14,
    maxBounds: [
      [-16, 37],
      [-1.5, 48.5],
    ],
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  const yearText = (y: number) => `,${y},`;
  const isEmpty = (y: number): ExpressionSpecification => [
    'in',
    yearText(y),
    ['get', 'anos_baleira_txt'],
  ];
  const filters = (y: number) => ({
    lit: ['all', ['<=', ['get', 'primeiro_ano'], y], ['!', isEmpty(y)]] as ExpressionSpecification,
    ghost: isEmpty(y),
    fresh: (y > FIRST
      ? ['all', isEmpty(y), ['!', isEmpty(y - 1)]]
      : ['==', 1, 0]) as ExpressionSpecification,
  });

  let added = false;
  const addLayers = () => {
    if (added || !map.isStyleLoaded()) return;
    added = true;
    // Dim the basemap: the lights are the map.
    for (const l of map.getStyle().layers ?? []) {
      if (l.type === 'symbol') map.setLayoutProperty(l.id, 'visibility', 'none');
    }
    map.addSource(LAYER, {
      type: 'vector',
      url: `pmtiles://${window.location.origin}${asset(tiles as string)}`,
    });
    const f = filters(years[slot] as number);
    const size = (lo: number, hi: number): ExpressionSpecification => [
      'interpolate',
      ['linear'],
      ['zoom'],
      6,
      lo,
      12,
      hi,
    ];
    // 1 for a hamlet, up to 3 for a large village or town.
    const weight: ExpressionSpecification = [
      'min',
      3,
      [
        'sqrt',
        ['max', 1, ['/', ['max', ['get', 'pob'], ['coalesce', ['get', 'pob_2000'], 0]], 25]],
      ],
    ];
    map.addLayer({
      id: 'au-lit',
      type: 'circle',
      source: LAYER,
      'source-layer': LAYER,
      filter: f.lit,
      paint: {
        'circle-color': LIT,
        // Zoom must be the top-level input: the size factor goes inside each stop.
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          ['*', 0.35, weight],
          9,
          ['*', 1, weight],
          12,
          ['*', 2.6, weight],
        ],
        'circle-opacity': 0.6,
        'circle-blur': 0.3,
      },
    });
    map.addLayer({
      id: 'au-ghost',
      type: 'circle',
      source: LAYER,
      'source-layer': LAYER,
      filter: f.ghost,
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        'circle-radius': size(1.1, 5),
        'circle-stroke-color': GHOST,
        'circle-stroke-width': size(0.5, 1.2),
        'circle-stroke-opacity': 0.75,
      },
    });
    map.addLayer({
      id: 'au-fresh',
      type: 'circle',
      source: LAYER,
      'source-layer': LAYER,
      filter: f.fresh,
      paint: {
        'circle-color': 'rgba(255,255,255,0.15)',
        'circle-radius': size(2.6, 9),
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': size(1, 2),
        'circle-blur': 0.2,
      },
    });
    map.addLayer({
      id: 'au-names',
      type: 'symbol',
      source: LAYER,
      'source-layer': LAYER,
      minzoom: 10.5,
      filter: f.ghost,
      layout: {
        'text-field': ['get', 'nome'],
        'text-font': ['Noto Sans Italic'],
        'text-size': 11,
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
      },
      paint: { 'text-color': '#9aa4ad', 'text-halo-color': '#07080a', 'text-halo-width': 1.2 },
    });
    for (const id of ['au-lit', 'au-ghost', 'au-fresh']) {
      map.on('click', id, (e) => {
        picked = (e.features?.[0]?.properties as Record<string, unknown>) ?? null;
        renderDetail();
      });
      map.on('mouseenter', id, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', id, () => {
        map.getCanvas().style.cursor = '';
      });
    }
    paint();
  };
  for (const ev of ['styledata', 'load', 'idle'] as const) map.on(ev, addLayers);
  addLayers();

  let userMoved = false;
  map.on('movestart', (e) => {
    if ((e as { originalEvent?: unknown }).originalEvent) userMoved = true;
  });
  const frame = () => {
    const panel = q<HTMLElement>('.au-panel').getBoundingClientRect();
    const fig = q<HTMLElement>('.au-curve').getBoundingClientRect();
    const box = q<HTMLElement>('.au-map').getBoundingClientRect();
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
  };
  window.addEventListener('resize', () => {
    if (!userMoved) frame();
  });
  void document.fonts.ready.then(() => {
    if (!userMoved) frame();
  });

  function paint() {
    if (!map.getLayer('au-lit')) return;
    const f = filters(years[slot] as number);
    map.setFilter('au-lit', f.lit);
    map.setFilter('au-ghost', f.ghost);
    map.setFilter('au-fresh', f.fresh);
    map.setFilter('au-names', f.ghost);
  }

  // ---- Text -------------------------------------------------------------------------------
  function render() {
    const y = years[slot] as number;
    clockEl.textContent = String(y);
    nowEl.textContent = fill(dict.absence_count ?? '', { n: nf.format(empty.get(y) ?? 0) });
    if (y === FIRST) {
      namesEl.textContent = fill(dict.absence_first ?? '', { n: nf.format(empty.get(y) ?? 0) });
    } else {
      const list = emptiedIn.get(y) ?? [];
      if (list.length === 0) {
        namesEl.textContent = fill(dict.absence_new_none ?? '', { y });
      } else {
        const head = document.createElement('strong');
        head.textContent = fill(dict.absence_new ?? '', { y, n: nf.format(list.length) });
        const shown = list
          .slice(0, NAMES_SHOWN)
          .map((p) => `${p.name} (${concelloOf(p.concello)})`)
          .join(' · ');
        const more =
          list.length > NAMES_SHOWN
            ? ` · ${fill(dict.absence_more ?? '', { n: nf.format(list.length - NAMES_SHOWN) })}`
            : '';
        namesEl.replaceChildren(head, ' ', `${shown}${more}`);
      }
    }
    range.value = String(slot);
    for (const [k, b] of bars.entries()) b.classList.toggle('is-now', k === slot);
    renderDetail();
    paint();
  }

  function renderDetail() {
    if (!picked) {
      detail.textContent = dict.absence_pick ?? '';
      return;
    }
    const p = picked;
    const strong = document.createElement('strong');
    strong.textContent = `${String(p.nome)} (${concelloOf(String(p.codigo).slice(0, 5))})`;
    const y = years[slot] as number;
    const yearsEmpty = new Set(
      String(p.anos_baleira_txt ?? '')
        .split(',')
        .filter(Boolean)
        .map(Number),
    );
    let text: string;
    if (yearsEmpty.has(y)) {
      // The start of the run of zeros that includes the shown year.
      let from = y;
      while (yearsEmpty.has(from - 1)) from--;
      text =
        from === FIRST
          ? (dict.absence_detail_empty_2000 ?? '')
          : fill(dict.absence_detail_empty ?? '', { y: from });
    } else {
      const pob = Number(p.pob);
      const lastYear = years[years.length - 1] as number;
      text =
        y !== lastYear
          ? ''
          : pob >= 5
            ? fill(dict.absence_detail_lit ?? '', { pob: nf.format(pob), y })
            : fill(dict.absence_detail_few ?? '', { y });
    }
    const parts: Array<string | Node> = [strong, document.createElement('br'), text];
    if (p.rexurdiu === true || p.rexurdiu === 'true') {
      parts.push(document.createElement('br'), dict.absence_detail_revived ?? '');
    }
    detail.replaceChildren(...parts);
  }

  function fillTable() {
    caption.textContent = fill(dict.absence_count ?? '', {
      n: nf.format(empty.get(last) ?? 0),
    });
    const now = places
      .filter((p) => p.since !== null)
      .sort((a, b) => (b.since ?? 0) - (a.since ?? 0) || a.name.localeCompare(b.name));
    tbody.replaceChildren(
      ...now.map((p) => {
        const tr = document.createElement('tr');
        const cells = [
          p.name,
          concelloOf(p.concello),
          p.before2000 ? (dict.absence_before ?? '') : String(p.since),
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

  // ---- Bars -------------------------------------------------------------------------------
  const W = 1000;
  const H = 120;
  const ns = 'http://www.w3.org/2000/svg';
  const top = Math.max(...years.map((y) => empty.get(y) ?? 0));
  curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const step = W / years.length;
  const bars = years.map((y, k) => {
    const v = empty.get(y) ?? 0;
    const h = (v / top) * (H - 26);
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('class', 'au-bar');
    r.setAttribute('x', String(k * step + 1));
    r.setAttribute('y', String(H - 16 - h));
    r.setAttribute('width', String(step - 2));
    r.setAttribute('height', String(h));
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${y}: ${nf.format(v)}`;
    r.append(title);
    r.addEventListener('click', () => {
      setPlaying(false);
      slot = k;
      render();
      writeHash();
    });
    curve.append(r);
    if (k % 5 === 0 || k === years.length - 1) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('class', 'au-tick');
      t.setAttribute('x', String(k * step + step / 2));
      t.setAttribute('y', String(H - 2));
      t.textContent = String(y);
      curve.append(t);
    }
    return r;
  });

  // ---- Controls ---------------------------------------------------------------------------
  range.min = '0';
  range.max = String(years.length - 1);
  function setPlaying(on: boolean) {
    playing = on;
    playBtn.textContent = dict[on ? 'pulse_pause' : 'pulse_play'] ?? '';
    playBtn.setAttribute('aria-pressed', String(!on));
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    if (on) {
      timer = window.setInterval(() => {
        // Stop on the last year.
        if (slot >= years.length - 1) {
          setPlaying(false);
          return;
        }
        slot++;
        render();
        writeHash();
      }, STEP_MS);
    }
  }
  playBtn.addEventListener('click', () => {
    if (!playing && slot >= years.length - 1) slot = 0;
    setPlaying(!playing);
    render();
  });
  range.addEventListener('input', () => {
    setPlaying(false);
    slot = Number(range.value);
    render();
    writeHash();
  });

  fillTable();
  renderDetail();
  render();
  setPlaying(playing);
}
