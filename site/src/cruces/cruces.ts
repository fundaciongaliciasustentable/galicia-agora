// /cruces/: bivariate maps of the concellos. Any indicator of a published layer joined to the
// concellos (catalog `join` + `indicators`) can be crossed with any other: each is cut into
// terciles over the concellos with data in both, and the 3 × 3 combination picks the colour
// (Stevens' palette: blue up the vertical axis, red along the horizontal, dark where both are
// high). A cell of the legend highlights and lists its concellos; values shown are always the
// originals of each source, with their period.

import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl';
import { asset } from '../paths.ts';
import { fill, loadStyle } from '../pulso/pulso.ts';
import { group, terciles } from './classes.ts';

type Dict = Record<string, string>;
type Row = Record<string, unknown>;

interface Indicator {
  key: string;
  layer: string;
  id: string;
  label: string;
  unit: string;
}

/** Rows: vertical axis (low → high); columns: horizontal axis (low → high). */
export const PALETTE = [
  ['#e8e8e8', '#e4acac', '#c85a5a'],
  ['#b0d5df', '#ad9ea5', '#985356'],
  ['#64acbe', '#627f8c', '#574249'],
];
const DARK = new Set(['#c85a5a', '#985356', '#64acbe', '#627f8c', '#574249']);
const NO_DATA = '#d6d3ca';

/** Suggested pairs: [vertical, horizontal, invert vertical, invert horizontal]. */
export const PRESETS: Record<string, [string, string, boolean, boolean]> = {
  old_shrinking: ['maiores_65_pct', 'variacion_poboacion_10a', false, true],
  income_age: ['renda_hab', 'idade_media', false, false],
  empty_homes: ['vivendas_baleiras_pct', 'variacion_poboacion_10a', false, true],
  far_old: ['maiores_65_pct', 'dist_centro_saude', false, false],
  births_foreign: ['natalidade_3a', 'estranxeiros_pct', false, false],
  tourist_homes: ['vut_1000hab', 'vivendas_baleiras_pct', false, false],
};

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.cx-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 });
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const selA = q<HTMLSelectElement>('.cx-sel-a');
  const selB = q<HTMLSelectElement>('.cx-sel-b');
  const invA = q<HTMLButtonElement>('.cx-inv-a');
  const invB = q<HTMLButtonElement>('.cx-inv-b');
  const grid = q<HTMLElement>('.cx-grid');
  const labA = q<HTMLElement>('.cx-lab-a');
  const labB = q<HTMLElement>('.cx-lab-b');
  const cutsEl = q<HTMLElement>('.cx-cuts');
  const cellEl = q<HTMLElement>('.cx-cell');
  const detail = q<HTMLElement>('.cx-detail');
  const status = q<HTMLElement>('.cx-status');
  const tbody = q<HTMLElement>('.cx-table tbody');
  const thA = q<HTMLElement>('.cx-th-a');
  const thB = q<HTMLElement>('.cx-th-b');
  const sources = q<HTMLElement>('.cx-sources');

  // ---- Data: every indicator joined to the concellos ---------------------------------------
  const indicators: Indicator[] = [];
  const byConcello = new Map<string, Record<string, unknown>>();
  const names = new Map<string, string>();
  let tiles: string | null = null;
  const attributions = new Map<string, string>();
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{
        id: string;
        attribution: string;
        meta: unknown;
        tiles?: string;
        join?: { layer: string; key: string };
        indicators?: Array<{ id: string; label: Record<string, string>; unit: string }>;
      }>;
    };
    tiles = catalog.layers.find((l) => l.id === 'concellos-parroquias')?.tiles ?? null;
    const joined = catalog.layers.filter(
      (l) => l.meta && l.join?.layer === 'concellos-parroquias' && l.indicators?.length,
    );
    const tables = await Promise.all(
      joined.map((l) =>
        fetch(asset(`data/${l.id}/table.json`))
          .then((r) => (r.ok ? (r.json() as Promise<Row[]>) : []))
          .catch(() => [] as Row[]),
      ),
    );
    joined.forEach((l, i) => {
      const table = tables[i] ?? [];
      if (table.length === 0) return;
      attributions.set(l.id, l.attribution);
      for (const ind of l.indicators ?? []) {
        indicators.push({
          key: ind.id,
          layer: l.id,
          id: ind.id,
          label: ind.label[lang] ?? ind.id,
          unit: ind.unit,
        });
      }
      for (const r of table) {
        const code = String(r.codigo_ine);
        if (r.nome) names.set(code, String(r.nome));
        const merged = byConcello.get(code) ?? {};
        for (const ind of l.indicators ?? []) {
          merged[ind.id] = r[ind.id];
          merged[`${ind.id}_periodo`] = r[`${ind.id}_periodo`];
          merged[`${ind.id}_galicia`] = r[`${ind.id}_galicia`];
        }
        byConcello.set(code, merged);
      }
    });
  } catch {
    // Handled below.
  }
  if (indicators.length < 2 || !tiles) {
    status.textContent = dict.cross_missing ?? '';
    return;
  }
  status.textContent = '';
  const ind = new Map(indicators.map((i) => [i.key, i]));
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

  for (const sel of [selA, selB]) {
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const i of indicators) {
      let og = groups.get(i.layer);
      if (!og) {
        og = document.createElement('optgroup');
        og.label = i.layer;
        groups.set(i.layer, og);
        sel.append(og);
      }
      const o = document.createElement('option');
      o.value = i.key;
      o.textContent = `${i.label} (${i.unit})`;
      og.append(o);
    }
  }

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  let a = ind.has(params.get('a') ?? '') ? (params.get('a') as string) : 'maiores_65_pct';
  let b = ind.has(params.get('b') ?? '') ? (params.get('b') as string) : 'variacion_poboacion_10a';
  if (!ind.has(a)) a = indicators[0]?.key as string;
  if (!ind.has(b)) b = indicators[1]?.key as string;
  let invertA = params.get('ia') === '1';
  let invertB = params.has('ib') ? params.get('ib') === '1' : b === 'variacion_poboacion_10a';
  let cell: [number, number] | null = null;
  let picked: string | null = null;
  const writeHash = () => {
    const p = new URLSearchParams({ a, b, ia: invertA ? '1' : '0', ib: invertB ? '1' : '0' });
    history.replaceState(null, '', `#${p.toString()}`);
  };

  // Classes of the current pair.
  let classes = new Map<string, [number, number]>();
  let cuts: { a: [number, number]; b: [number, number] } = { a: [0, 0], b: [0, 0] };
  function classify() {
    const both = [...byConcello.entries()].filter(
      ([, r]) => num(r[a]) !== null && num(r[b]) !== null,
    );
    cuts = {
      a: terciles(both.map(([, r]) => num(r[a]) as number)),
      b: terciles(both.map(([, r]) => num(r[b]) as number)),
    };
    classes = new Map(
      both.map(([code, r]) => [
        code,
        [group(num(r[a]) as number, cuts.a, invertA), group(num(r[b]) as number, cuts.b, invertB)],
      ]),
    );
  }

  // ---- Map --------------------------------------------------------------------------------
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');
  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map: MlMap = new maplibregl.Map({
    container: q<HTMLElement>('.cx-map'),
    style: await loadStyle('light'),
    center: [-8.0, 42.8],
    zoom: 7,
    minZoom: 5,
    maxZoom: 12,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  const SRC = 'concellos-parroquias';
  const concello: ExpressionSpecification = ['==', ['get', 'nivel'], 'concello'];
  let added = false;
  const addLayers = () => {
    if (added || !map.isStyleLoaded()) return;
    added = true;
    map.addSource(SRC, {
      type: 'vector',
      url: `pmtiles://${window.location.origin}${asset(tiles as string)}`,
    });
    map.addLayer({
      id: 'cx-fill',
      type: 'fill',
      source: SRC,
      'source-layer': SRC,
      filter: concello,
      paint: { 'fill-color': NO_DATA, 'fill-opacity': 0.92 },
    });
    map.addLayer({
      id: 'cx-line',
      type: 'line',
      source: SRC,
      'source-layer': SRC,
      filter: concello,
      paint: { 'line-color': '#fbfaf6', 'line-width': 0.5 },
    });
    map.addLayer({
      id: 'cx-picked',
      type: 'line',
      source: SRC,
      'source-layer': SRC,
      filter: ['==', ['get', 'codigo_ine'], ''],
      paint: { 'line-color': '#111', 'line-width': 2 },
    });
    map.on('click', 'cx-fill', (e) => {
      const code = e.features?.[0]?.properties?.codigo_ine;
      picked = typeof code === 'string' ? code : null;
      renderDetail();
      paint();
    });
    map.on('mouseenter', 'cx-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'cx-fill', () => {
      map.getCanvas().style.cursor = '';
    });
    paint();
  };
  for (const ev of ['styledata', 'load', 'idle'] as const) map.on(ev, addLayers);
  addLayers();

  let userMoved = false;
  map.on('movestart', (e) => {
    if ((e as { originalEvent?: unknown }).originalEvent) userMoved = true;
  });
  const frame = () => {
    const panel = q<HTMLElement>('.cx-panel').getBoundingClientRect();
    const wide = window.innerWidth >= 700;
    map.fitBounds(
      [
        [-9.3, 41.8],
        [-6.7, 43.8],
      ],
      {
        padding: wide
          ? { left: panel.width + 40, right: 50, top: 20, bottom: 20 }
          : { left: 10, right: 10, top: 10, bottom: panel.height + 20 },
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
    if (!map.getLayer('cx-fill')) return;
    const pairs: string[] = [];
    for (const [code, [i, j]] of classes) pairs.push(code, PALETTE[i]?.[j] as string);
    map.setPaintProperty('cx-fill', 'fill-color', [
      'match',
      ['get', 'codigo_ine'],
      ...pairs,
      NO_DATA,
    ] as unknown as ExpressionSpecification);
    // A picked cell fades the rest.
    const inCell = cell
      ? [...classes].filter(([, [i, j]]) => i === cell?.[0] && j === cell?.[1]).map(([c]) => c)
      : null;
    map.setPaintProperty(
      'cx-fill',
      'fill-opacity',
      inCell
        ? ([
            'case',
            ['in', ['get', 'codigo_ine'], ['literal', inCell]],
            0.95,
            0.18,
          ] as ExpressionSpecification)
        : 0.92,
    );
    map.setFilter('cx-picked', ['==', ['get', 'codigo_ine'], picked ?? '']);
  }

  // ---- Panel ------------------------------------------------------------------------------
  const fmt = (key: string, v: unknown) => {
    const n = num(v);
    return n === null
      ? (dict.cross_no_data ?? '')
      : `${nf.format(n)} ${ind.get(key)?.unit ?? ''}`.trim();
  };
  /** Word for the raw level of a group (0 low, 1 middle, 2 high). */
  const levelWord = (g: number) => [dict.cross_low, dict.cross_mid, dict.cross_high][g] ?? '';

  function renderLegend() {
    const counts = PALETTE.map(() => [0, 0, 0]);
    for (const [i, j] of classes.values())
      (counts[i] as number[])[j] = ((counts[i] as number[])[j] ?? 0) + 1;
    grid.replaceChildren();
    // Rows from high (top) to low.
    for (let i = 2; i >= 0; i--) {
      for (let j = 0; j < 3; j++) {
        const colour = PALETTE[i]?.[j] as string;
        const n = counts[i]?.[j] ?? 0;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.background = colour;
        btn.textContent = String(n);
        btn.classList.toggle('is-dark', DARK.has(colour));
        btn.setAttribute('aria-label', fill(dict.cross_legend_label ?? '', { n }));
        btn.setAttribute('aria-pressed', String(cell?.[0] === i && cell?.[1] === j));
        btn.addEventListener('click', () => {
          cell = cell?.[0] === i && cell?.[1] === j ? null : [i, j];
          renderLegend();
          renderCell();
          paint();
        });
        grid.append(btn);
      }
    }
    const ia = ind.get(a);
    const ib = ind.get(b);
    labA.textContent = `${ia?.label ?? a} ${invertA ? '↓' : '↑'}`;
    labB.textContent = `${ib?.label ?? b} ${invertB ? '←' : '→'}`;
    cutsEl.textContent = fill(dict.cross_cuts ?? '', {
      a: `${ia?.label}: ${nf.format(cuts.a[0])} / ${nf.format(cuts.a[1])} ${ia?.unit ?? ''}`,
      b: `${ib?.label}: ${nf.format(cuts.b[0])} / ${nf.format(cuts.b[1])} ${ib?.unit ?? ''}`,
    });
  }

  function renderCell() {
    if (!cell) {
      cellEl.textContent = dict.cross_cell_hint ?? '';
      return;
    }
    const [i, j] = cell;
    const codes = [...classes].filter(([, [x, y]]) => x === i && y === j).map(([c]) => c);
    const head = document.createElement('strong');
    head.textContent = fill(dict.cross_cell ?? '', {
      n: codes.length,
      a: ind.get(a)?.label ?? a,
      la: levelWord(invertA ? 2 - i : i),
      b: ind.get(b)?.label ?? b,
      lb: levelWord(invertB ? 2 - j : j),
    });
    const ul = document.createElement('ul');
    for (const code of codes.sort((x, y) => (names.get(x) ?? x).localeCompare(names.get(y) ?? y))) {
      const li = document.createElement('li');
      const r = byConcello.get(code) ?? {};
      li.textContent = `${names.get(code) ?? code}: ${fmt(a, r[a])} · ${fmt(b, r[b])}`;
      ul.append(li);
    }
    cellEl.replaceChildren(head, ul);
  }

  function renderDetail() {
    if (!picked) {
      detail.textContent = dict.cross_detail_pick ?? '';
      return;
    }
    const r = byConcello.get(picked) ?? {};
    const strong = document.createElement('strong');
    strong.textContent = names.get(picked) ?? picked;
    const line = (key: string) => {
      const p = document.createElement('p');
      p.style.margin = '2px 0 0';
      const period = r[`${key}_periodo`] ? ` (${String(r[`${key}_periodo`])})` : '';
      const gal = num(r[`${key}_galicia`]);
      p.textContent = `${ind.get(key)?.label}${period}: ${fmt(key, r[key])}${
        gal === null ? '' : ` · ${fill(dict.cross_galicia ?? '', { v: fmt(key, gal) })}`
      }`;
      return p;
    };
    detail.replaceChildren(strong, line(a), line(b));
  }

  function fillTable() {
    thA.textContent = ind.get(a)?.label ?? a;
    thB.textContent = ind.get(b)?.label ?? b;
    const codes = [...byConcello.keys()].sort((x, y) =>
      (names.get(x) ?? x).localeCompare(names.get(y) ?? y),
    );
    tbody.replaceChildren(
      ...codes.map((code) => {
        const r = byConcello.get(code) ?? {};
        const c = classes.get(code);
        const tr = document.createElement('tr');
        const cells = [
          names.get(code) ?? code,
          fmt(a, r[a]),
          fmt(b, r[b]),
          c ? `${c[0] + 1}·${c[1] + 1}` : '–',
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

  function update() {
    selA.value = a;
    selB.value = b;
    invA.setAttribute('aria-pressed', String(invertA));
    invB.setAttribute('aria-pressed', String(invertB));
    invA.setAttribute(
      'aria-label',
      fill(dict.cross_invert_label ?? '', { v: ind.get(a)?.label ?? a }),
    );
    invB.setAttribute(
      'aria-label',
      fill(dict.cross_invert_label ?? '', { v: ind.get(b)?.label ?? b }),
    );
    for (const btn of app.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
      const p = PRESETS[btn.dataset.preset ?? ''];
      btn.hidden = !p || !ind.has(p[0]) || !ind.has(p[1]);
      btn.setAttribute(
        'aria-pressed',
        String(!!p && p[0] === a && p[1] === b && p[2] === invertA && p[3] === invertB),
      );
    }
    sources.textContent = [...new Set([ind.get(a)?.layer, ind.get(b)?.layer])]
      .map((l) => attributions.get(l ?? '') ?? '')
      .filter(Boolean)
      .join(' · ');
    cell = null;
    classify();
    renderLegend();
    renderCell();
    renderDetail();
    fillTable();
    paint();
    writeHash();
  }

  selA.addEventListener('change', () => {
    a = selA.value;
    update();
  });
  selB.addEventListener('change', () => {
    b = selB.value;
    update();
  });
  invA.addEventListener('click', () => {
    invertA = !invertA;
    update();
  });
  invB.addEventListener('click', () => {
    invertB = !invertB;
    update();
  });
  for (const btn of app.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.preset ?? ''];
      if (!p) return;
      [a, b, invertA, invertB] = p;
      update();
    });
  }
  update();
}
