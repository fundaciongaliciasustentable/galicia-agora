// Client for the map page. Nothing here talks to a third-party origin: the
// basemap, glyphs, sprites and data are all served by this site.
//
// A layer that is switched off makes no request: sources are added on the
// first toggle, never before.

import type { LayerSpecification, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { asset } from '../paths.ts';
import { layerStyles } from './styles.ts';
import { readHash, writeHash } from './urlstate.ts';

interface Layer {
  id: string;
  title: { gl: string; es: string };
  geometry: string;
  style: { kind: string; color_token?: string; label_field?: string };
  table: { fields: string[] };
  source_url: string;
  attribution: string;
  licence: { spdx?: string; text_url: string };
  operator: { name: string; url: string };
  tiles?: string;
  meta: {
    published_at: string | null;
    fetched_at: string;
    status: 'fresh' | 'stale' | 'failed';
    feature_count: number;
  } | null;
}

type Dict = Record<string, string>;

const TABLE_LIMIT = 500;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#4a5846';
}

function relative(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

function absolute(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'gl' ? 'gl-ES' : 'es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(iso));
}

function formatValue(v: unknown, lang: string): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number')
    return new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES').format(v);
  if (typeof v === 'boolean') return v ? '✓' : '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return absolute(v, lang);
  return String(v);
}

/** Units for common measurement fields. */
const UNITS: Record<string, string> = {
  temperatura: '°C',
  humidade: '%',
  vento_velocidade: 'm/s',
  refacho: 'm/s',
  vento_direccion: '°',
  chuvia_10min: 'mm',
  presion: 'hPa',
  altitude: 'm',
  area_ha: 'ha',
  superficie_ha: 'ha',
  frp: 'MW',
};

/** Field names are snake_case Galician; show them readably. */
function fieldLabel(f: string): string {
  const s = f.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function loadStyle(dark: boolean): Promise<StyleSpecification> {
  const res = await fetch(asset(`style-${dark ? 'dark' : 'light'}.json`));
  const style = (await res.json()) as StyleSpecification;
  const origin = window.location.origin;
  // MapLibre needs absolute URLs for glyphs, sprites and pmtiles sources.
  if (style.glyphs) style.glyphs = origin + asset(style.glyphs);
  if (typeof style.sprite === 'string') style.sprite = origin + asset(style.sprite);
  for (const src of Object.values(style.sources)) {
    if ('url' in src && typeof src.url === 'string' && src.url.startsWith('pmtiles:///')) {
      src.url = `pmtiles://${origin}${asset(src.url.slice('pmtiles://'.length))}`;
    }
  }
  return style;
}

export async function start(): Promise<void> {
  const app = document.querySelector<HTMLElement>('.ga-app');
  if (!app) return;
  const lang = app.dataset.lang ?? 'gl';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;

  // Mobile panel toggle.
  const toggle = app.querySelector<HTMLButtonElement>('.ga-panel-toggle');
  const setPanel = (open: boolean) => {
    app.classList.toggle('panel-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    if (open) app.querySelector<HTMLElement>('#ga-panel input')?.focus();
    else toggle?.focus();
  };
  toggle?.addEventListener('click', () => setPanel(!app.classList.contains('panel-open')));
  app.querySelector('.ga-panel-close')?.addEventListener('click', () => setPanel(false));
  app.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.classList.contains('panel-open')) setPanel(false);
  });

  // maplibre-gl 6 is ESM with named exports only.
  const [maplibregl, { Protocol }] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  await import('maplibre-gl/dist/maplibre-gl.css');

  maplibregl.setWorkerUrl(asset('maplibre/maplibre-gl-worker.mjs'));
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);

  const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as { layers: Layer[] };
  const layersById = new Map(catalog.layers.map((l) => [l.id, l]));

  refreshFreshness(app, catalog.layers, lang, dict);
  setInterval(() => refreshFreshness(app, catalog.layers, lang, dict), 60_000);

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const state = readHash();
  const map: MlMap = new maplibregl.Map({
    container: 'ga-map',
    style: await loadStyle(darkQuery.matches),
    center: [state.lon, state.lat],
    zoom: state.zoom,
    minZoom: 6,
    maxZoom: 16,
    maxBounds: [
      [-13, 40.5],
      [-4.5, 45.5],
    ],
    attributionControl: { compact: true },
    fadeDuration: reducedMotion.matches ? 0 : 300,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  const active = new Set<string>();
  const hint = document.getElementById('ga-hint');

  const updateHash = () => {
    const c = map.getCenter();
    writeHash({ zoom: map.getZoom(), lat: c.lat, lon: c.lng, layers: [...active] });
    if (hint) hint.hidden = active.size > 0;
  };
  map.on('moveend', updateHash);

  function addLayer(id: string) {
    const layer = layersById.get(id);
    if (!layer || map.getSource(id)) return;
    const origin = window.location.origin;
    if (layer.tiles) {
      map.addSource(id, {
        type: 'vector',
        url: `pmtiles://${origin}${asset(layer.tiles)}`,
        attribution: layer.attribution,
      });
    } else {
      map.addSource(id, {
        type: 'geojson',
        data: asset(`data/${id}/data.geojson`),
        attribution: layer.attribution,
      });
    }
    const color = cssVar(layer.style.color_token ?? '--gs-verde-nato');
    for (const spec of layerStyles(layer, color, layer.tiles ? id : undefined)) {
      map.addLayer(spec as LayerSpecification);
    }
  }

  function setVisible(id: string, on: boolean) {
    if (on) {
      if (!map.getSource(id)) addLayer(id);
      for (const l of map.getStyle().layers.filter((x) => 'source' in x && x.source === id)) {
        map.setLayoutProperty(l.id, 'visibility', 'visible');
      }
      active.add(id);
    } else {
      for (const l of map.getStyle().layers.filter((x) => 'source' in x && x.source === id)) {
        map.setLayoutProperty(l.id, 'visibility', 'none');
      }
      active.delete(id);
    }
    updateHash();
  }

  const checkboxes = app.querySelectorAll<HTMLInputElement>('input[data-toggle]');
  map.on('load', () => {
    // Start with the attribution collapsed so it does not cover the panel button on phones.
    document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    for (const cb of checkboxes) {
      const id = cb.dataset.toggle ?? '';
      if (state.layers.includes(id) && layersById.has(id)) {
        cb.checked = true;
        setVisible(id, true);
      }
      cb.addEventListener('change', () => setVisible(id, cb.checked));
    }
    updateHash();
  });

  // Re-apply the basemap when the colour scheme changes, keeping data layers.
  darkQuery.addEventListener('change', async () => {
    const style = await loadStyle(darkQuery.matches);
    map.setStyle(style, {
      transformStyle: (prev, next) => {
        if (!prev) return next;
        const keep = Object.fromEntries(
          Object.entries(prev.sources).filter(([k]) => layersById.has(k)),
        );
        const keepLayers = prev.layers.filter(
          (l) => 'source' in l && layersById.has(String(l.source)),
        );
        return {
          ...next,
          sources: { ...next.sources, ...keep },
          layers: [...next.layers, ...keepLayers],
        };
      },
    });
  });

  // Feature card on click.
  const ficha = document.getElementById('ga-ficha') as HTMLElement;
  const fichaBody = ficha.querySelector('.ga-ficha-body') as HTMLElement;
  ficha.querySelector('.ga-ficha-close')?.addEventListener('click', () => {
    ficha.hidden = true;
  });

  map.on('click', (e) => {
    const ids = map
      .getStyle()
      .layers.filter((l) => 'source' in l && active.has(String(l.source)))
      .map((l) => l.id);
    if (!ids.length) return;
    const hits = map.queryRenderedFeatures(e.point, { layers: ids });
    if (!hits.length) {
      ficha.hidden = true;
      return;
    }
    // Points sit on top of areas: a click on a station must not open the parroquia under it.
    const rank = (t: string) => (t.includes('Point') ? 0 : t.includes('Line') ? 1 : 2);
    const f = [...hits].sort((a, b) => rank(a.geometry.type) - rank(b.geometry.type))[0];
    if (!f) return;
    const layer = layersById.get(String(f.source));
    if (!layer) return;
    renderFicha(fichaBody, layer, f.properties ?? {}, lang, dict);
    ficha.hidden = false;
  });
  map.on('mousemove', (e) => {
    const ids = map
      .getStyle()
      .layers.filter((l) => 'source' in l && active.has(String(l.source)))
      .map((l) => l.id);
    const hit = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }).length > 0 : false;
    map.getCanvas().style.cursor = hit ? 'pointer' : '';
  });

  // Accessible table view.
  const dialog = document.getElementById('ga-table') as HTMLDialogElement;
  const dialogBody = dialog.querySelector('.ga-dialog-body') as HTMLElement;
  for (const btn of app.querySelectorAll<HTMLButtonElement>('button[data-table]')) {
    btn.addEventListener('click', async () => {
      const layer = layersById.get(btn.dataset.table ?? '');
      if (!layer) return;
      dialogBody.replaceChildren(el('p', {}, dict.loading));
      dialog.showModal();
      try {
        const rows = (await (await fetch(asset(`data/${layer.id}/table.json`))).json()) as Array<
          Record<string, unknown>
        >;
        renderTable(dialogBody, layer, rows, lang, dict);
      } catch {
        dialogBody.replaceChildren(el('p', {}, dict.load_error));
      }
    });
  }

  // Place search results navigate to #map=…; follow them without reloading.
  window.addEventListener('hashchange', () => {
    const s = readHash();
    map.jumpTo({ center: [s.lon, s.lat], zoom: s.zoom });
    for (const cb of checkboxes) {
      const id = cb.dataset.toggle ?? '';
      if (s.layers.includes(id) && !cb.checked) {
        cb.checked = true;
        setVisible(id, true);
      }
    }
  });

  loadSearch(lang);
}

function refreshFreshness(app: HTMLElement, layers: Layer[], lang: string, dict: Dict) {
  for (const l of layers) {
    const badge = app.querySelector<HTMLElement>(`[data-status-for="${l.id}"]`);
    if (badge) {
      const status = l.meta?.status ?? 'none';
      badge.dataset.status = status;
      badge.textContent = dict[`status_${status}`] ?? status;
    }
    const time = app.querySelector<HTMLTimeElement>(`[data-layer="${l.id}"] time[data-relative]`);
    if (time && l.meta?.published_at) {
      time.textContent = relative(l.meta.published_at, lang);
      time.title = absolute(l.meta.published_at, lang);
    }
  }
}

function renderFicha(
  body: HTMLElement,
  layer: Layer,
  props: Record<string, unknown>,
  lang: string,
  dict: Dict,
) {
  // label_field is what the map writes next to a point (e.g. a temperature); the card title is the name.
  const title = String(
    props.nome ??
      props.tren ??
      props[layer.style.label_field ?? ''] ??
      layer.title[lang as 'gl' | 'es'],
  );
  const h = el('h2', {}, title);
  const sub = el('p', { class: 'ga-ficha-layer' }, layer.title[lang as 'gl' | 'es']);
  const dl = el('dl');
  const fields = layer.table.fields.length ? layer.table.fields : Object.keys(props);
  for (const f of fields) {
    if (!(f in props)) continue;
    const unit = UNITS[f] && props[f] !== null && props[f] !== undefined ? ` ${UNITS[f]}` : '';
    dl.append(el('dt', {}, fieldLabel(f)), el('dd', {}, formatValue(props[f], lang) + unit));
  }
  const meta = el('p', { class: 'ga-ficha-meta' });
  meta.append(
    document.createTextNode(`${dict.operator}: ${layer.operator.name}. `),
    document.createTextNode(
      layer.meta?.published_at
        ? `${dict.published}: ${absolute(layer.meta.published_at, lang)}. `
        : `${dict.published_unknown}. `,
    ),
  );
  const links = el('p');
  const src = el(
    'a',
    { href: String(props.fonte_url ?? layer.source_url), rel: 'noopener' },
    dict.source,
  );
  const lic = el(
    'a',
    { href: layer.licence.text_url, rel: 'noopener' },
    layer.licence.spdx ?? dict.licence,
  );
  links.append(
    src,
    document.createTextNode(' · '),
    lic,
    document.createTextNode(` · ${layer.attribution}`),
  );
  body.replaceChildren(h, sub, dl, meta, links);
}

function renderTable(
  body: HTMLElement,
  layer: Layer,
  rows: Array<Record<string, unknown>>,
  lang: string,
  dict: Dict,
) {
  const fields = layer.table.fields;
  const wrap = el('div', { class: 'ga-table-wrap' });
  const table = el('table', { class: 'ga-table' });
  const caption = el(
    'caption',
    {},
    `${layer.title[lang as 'gl' | 'es']} · ${rows.length} ${dict.features} · ${layer.attribution}`,
  );
  const thead = el('thead');
  const hr = el('tr');
  for (const f of fields) hr.append(el('th', { scope: 'col' }, fieldLabel(f)));
  thead.append(hr);
  const tbody = el('tbody');
  for (const r of rows.slice(0, TABLE_LIMIT)) {
    const tr = el('tr');
    for (const f of fields) tr.append(el('td', {}, formatValue(r[f], lang)));
    tbody.append(tr);
  }
  table.append(caption, thead, tbody);
  wrap.append(table);
  const parts: Node[] = [el('h2', {}, layer.title[lang as 'gl' | 'es']), wrap];
  if (rows.length > TABLE_LIMIT) {
    const p = el('p', {}, `${(dict.table_limit ?? '').replace('{n}', String(TABLE_LIMIT))} `);
    p.append(el('a', { href: asset(`data/${layer.id}/data.geojson`), download: '' }, 'GeoJSON'));
    parts.push(p);
  }
  body.replaceChildren(...parts);
}

/** Pagefind place search (self-hosted under /pagefind/). */
function loadSearch(lang: string) {
  const host = document.getElementById('ga-search');
  if (!host) return;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = asset('pagefind/pagefind-ui.css');
  document.head.append(css);
  const script = document.createElement('script');
  script.src = asset('pagefind/pagefind-ui.js');
  script.onload = () => {
    const PagefindUI = (window as unknown as { PagefindUI?: new (o: object) => unknown })
      .PagefindUI;
    if (!PagefindUI) return;
    new PagefindUI({
      element: '#ga-search',
      showImages: false,
      showSubResults: false,
      resetStyles: false,
      pageSize: 8,
      translations: {
        placeholder: host.dataset.label ?? (lang === 'gl' ? 'Buscar lugar' : 'Buscar lugar'),
      },
      processResult: (r: { meta: Record<string, string>; excerpt: string }) => {
        r.excerpt = [r.meta.tipo, r.meta.onde].filter(Boolean).join(' · ');
        return r;
      },
    });
  };
  document.head.append(script);
}
