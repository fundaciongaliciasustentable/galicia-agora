// Client for the map page. Nothing here talks to a third-party origin: the
// basemap, glyphs, sprites and data are all served by this site.
//
// A layer that is switched off makes no request: sources are added on the
// first toggle, never before.

import type { LayerSpecification, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { asset } from '../paths.ts';
import {
  classifyIndicator,
  classifyWarnings,
  DIVERGING,
  deviation,
  type Indicator,
  type LegendItem,
  type Row,
} from './choropleth.ts';
import {
  addAge,
  CATEGORY_FIELDS,
  encodeLayer,
  type LegendBlock,
  QUANTILE_FIELDS,
  quantiles,
  type Stats,
  TIME_FIELD,
} from './styles.ts';
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
  join?: { layer: string; key: string; where?: Record<string, unknown> };
  indicators?: Indicator[];
  ingest?: { every?: string };
  meta: {
    published_at: string | null;
    fetched_at: string;
    status: 'fresh' | 'stale' | 'failed';
    feature_count: number;
  } | null;
}

type Dict = Record<string, string>;

const TABLE_LIMIT = 500;
/** Layers updated at least every half hour are re-fetched while shown. */
const LIVE_REFRESH_MS = 5 * 60_000;

type Feature = { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> | null };
type Collection = { type: 'FeatureCollection'; features: Feature[] };

function isoMinutes(d?: string): number {
  const m = d?.match(/^PT(\d+)M$/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/** A wind arrow drawn on a canvas, used as an SDF icon so it takes any colour. */
function arrowImage(): { width: number; height: number; data: Uint8Array } {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#000';
  g.beginPath();
  g.moveTo(16, 2);
  g.lineTo(23, 13);
  g.lineTo(18, 13);
  g.lineTo(18, 30);
  g.lineTo(14, 30);
  g.lineTo(14, 13);
  g.lineTo(9, 13);
  g.closePath();
  g.fill();
  const img = g.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}
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

/** Which catalogue layer a style layer belongs to (choropleths draw on another layer's source). */
function ownerOf(l: { id: string; metadata?: unknown; source?: unknown }): string | undefined {
  const m = l.metadata as Record<string, unknown> | undefined;
  if (m && typeof m['ga:layer'] === 'string') return m['ga:layer'];
  return typeof l.source === 'string' ? l.source : undefined;
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
  const found = document.querySelector<HTMLElement>('.ga-app');
  if (!found) return;
  // A non-null alias so nested functions keep the narrowed type.
  const app: HTMLElement = found;
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
  // Developer aid: ?debug exposes the map instance in the console.
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as { gaMap?: MlMap }).gaMap = map;
  }
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  const active = new Set<string>();
  const hint = document.getElementById('ga-hint');

  const updateHash = () => {
    const c = map.getCenter();
    writeHash({ zoom: map.getZoom(), lat: c.lat, lon: c.lng, layers: [...active] });
    if (hint) hint.hidden = active.size > 0;
  };
  map.on('moveend', updateHash);

  const rowsByLayer = new Map<string, Map<string, Row>>();
  const selectedIndicator = new Map<string, string>();
  const added = new Set<string>();
  const dark = () => darkQuery.matches;

  /** Add a layer's source without drawing it (used as geometry for choropleths). */
  function ensureSource(id: string) {
    const layer = layersById.get(id);
    if (!layer || map.getSource(id)) return;
    const origin = window.location.origin;
    if (layer.tiles) {
      map.addSource(id, { type: 'vector', url: `pmtiles://${origin}${asset(layer.tiles)}` });
    } else {
      map.addSource(id, { type: 'geojson', data: asset(`data/${id}/data.geojson`) });
    }
  }

  async function addJoinLayer(layer: Layer) {
    const join = layer.join;
    if (!join) return;
    ensureSource(join.layer);
    const target = layersById.get(join.layer);
    const sourceLayer = target?.tiles ? join.layer : undefined;
    const filter = join.where
      ? ['all', ...Object.entries(join.where).map(([k, v]) => ['==', ['get', k], v])]
      : undefined;
    const meta = { 'ga:layer': layer.id };
    map.addLayer({
      id: `${layer.id}__fill`,
      type: 'fill',
      source: join.layer,
      ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
      ...(filter ? { filter } : {}),
      metadata: meta,
      paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.75 },
    } as LayerSpecification);
    map.addLayer({
      id: `${layer.id}__line`,
      type: 'line',
      source: join.layer,
      ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
      ...(filter ? { filter } : {}),
      metadata: meta,
      paint: { 'line-color': cssVar('--border'), 'line-width': 0.5 },
    } as LayerSpecification);
    const rows = (await (await fetch(asset(`data/${layer.id}/table.json`))).json()) as Row[];
    rowsByLayer.set(layer.id, new Map(rows.map((r) => [String(r[join.key]), r])));
    paintJoin(layer);
  }

  /** Recolour a choropleth for the selected indicator and update its legend. */
  function paintJoin(layer: Layer) {
    const join = layer.join;
    const rows = rowsByLayer.get(layer.id);
    if (!join || !rows || !map.getLayer(`${layer.id}__fill`)) return;
    const list = [...rows.values()];
    let classified: { fillColor: unknown; legend: LegendItem[] };
    let note = '';
    if (layer.indicators?.length) {
      const indId = selectedIndicator.get(layer.id) ?? layer.indicators[0]?.id;
      const ind = layer.indicators.find((i) => i.id === indId) ?? layer.indicators[0];
      if (!ind) return;
      classified = classifyIndicator(
        list,
        ind,
        join.key,
        dark() ? DIVERGING.dark : DIVERGING.light,
        lang as 'gl' | 'es',
      );
      note = ind.comparison === 'index' ? (dict.legend_index ?? '') : (dict.legend_points ?? '');
    } else {
      classified = classifyWarnings(list, join.key, lang as 'gl' | 'es');
    }
    map.setPaintProperty(`${layer.id}__fill`, 'fill-color', classified.fillColor as never);
    renderLegend(app, layer.id, classified.legend, note);
  }

  const collections = new Map<string, Collection>();
  const pulseLayers = new Set<string>();

  function ensureImages() {
    if (!map.hasImage('ga-arrow')) map.addImage('ga-arrow', arrowImage(), { sdf: true });
  }

  function statsFor(id: string, fc: Collection | undefined): Stats {
    const stats: Stats = { q: {}, cats: {} };
    if (!fc) return stats;
    for (const f of QUANTILE_FIELDS[id] ?? []) {
      (stats.q as Record<string, number[]>)[f] = quantiles(
        fc.features.map((x) => Number(x.properties?.[f])),
      );
    }
    const cat = CATEGORY_FIELDS[id];
    if (cat) {
      const [field, colour] = cat;
      const seen = new Map<string, string>();
      for (const x of fc.features) {
        const v = x.properties?.[field];
        if (typeof v === 'string' && !seen.has(v))
          seen.set(v, String(x.properties?.[colour] ?? ''));
      }
      (stats.cats as Record<string, Array<{ value: string; color: string }>>)[field] = [
        ...seen,
      ].map(([value, color]) => ({ value, color }));
    }
    return stats;
  }

  /** Draw (or redraw) a non-choropleth layer's style layers and legend. */
  function drawLayer(layer: Layer) {
    for (const l of map.getStyle().layers.filter((x) => ownerOf(x) === layer.id)) {
      map.removeLayer(l.id);
    }
    ensureImages();
    const encoding = encodeLayer(layer, {
      color: cssVar(layer.style.color_token ?? '--gs-verde-nato'),
      dark: dark(),
      sourceLayer: layer.tiles && layer.geometry !== 'raster' ? layer.id : undefined,
      stats: statsFor(layer.id, collections.get(layer.id)),
    });
    const visibility = active.has(layer.id) ? 'visible' : 'none';
    for (const spec of encoding.specs) {
      map.addLayer({
        ...spec,
        metadata: { 'ga:layer': layer.id },
        layout: { ...((spec.layout as object) ?? {}), visibility },
      } as LayerSpecification);
    }
    for (const p of encoding.pulse) pulseLayers.add(p);
    renderBlocks(app, layer.id, encoding.legend, lang as 'gl' | 'es');
  }

  /** Fetch a GeoJSON layer, add ages, and push it into its source. */
  async function loadCollection(layer: Layer): Promise<Collection> {
    const fc = (await (
      await fetch(asset(`data/${layer.id}/data.geojson`), { cache: 'no-cache' })
    ).json()) as Collection;
    const timeField = TIME_FIELD[layer.id];
    if (timeField) addAge(fc.features, timeField, Date.now());
    collections.set(layer.id, fc);
    return fc;
  }

  async function addLayer(id: string) {
    const layer = layersById.get(id);
    if (!layer || added.has(id)) return;
    if (layer.join) {
      added.add(id);
      void addJoinLayer(layer);
      return;
    }
    if (!map.getSource(id)) {
      const origin = window.location.origin;
      if (layer.tiles && layer.geometry === 'raster') {
        // PNG tiles from a raster PMTiles archive; MapLibre overzooms past its maxzoom.
        map.addSource(id, {
          type: 'raster',
          url: `pmtiles://${origin}${asset(layer.tiles)}`,
          tileSize: 256,
          attribution: layer.attribution,
        });
      } else if (layer.tiles) {
        map.addSource(id, {
          type: 'vector',
          url: `pmtiles://${origin}${asset(layer.tiles)}`,
          attribution: layer.attribution,
        });
      } else {
        const fc = await loadCollection(layer);
        if (map.getSource(id)) {
          (map.getSource(id) as unknown as { setData: (d: unknown) => void }).setData(fc);
        } else {
          map.addSource(id, { type: 'geojson', data: fc as never, attribution: layer.attribution });
        }
      }
    } else if (!layer.tiles && !collections.has(id)) {
      // Source added earlier as a choropleth base: reuse it, but load the data for stats.
      await loadCollection(layer);
    }
    drawLayer(layer);
    added.add(id);
  }

  /** Keep live layers current: ages every minute, new data every few minutes. */
  let lastFetch = Date.now();
  setInterval(async () => {
    const refetch = Date.now() - lastFetch >= LIVE_REFRESH_MS;
    if (refetch) lastFetch = Date.now();
    for (const id of active) {
      const layer = layersById.get(id);
      const src = map.getSource(id) as unknown as { setData?: (d: unknown) => void } | undefined;
      if (!layer || layer.join || layer.tiles || !src?.setData) continue;
      const live = isoMinutes(layer.ingest?.every) <= 30;
      try {
        if (refetch && live) {
          src.setData(await loadCollection(layer));
          drawLayer(layer);
        } else if (TIME_FIELD[id]) {
          const fc = collections.get(id);
          if (!fc) continue;
          addAge(fc.features, TIME_FIELD[id] as string, Date.now());
          src.setData(fc);
        }
      } catch {
        // Keep what is on screen; the next tick tries again.
      }
    }
  }, 60_000);

  /** Pulses: a ring that grows and fades around recent events. */
  if (!reducedMotion.matches) {
    let last = 0;
    const frame = (t: number) => {
      if (t - last > 50) {
        last = t;
        const phase = (t % 1800) / 1800;
        for (const pid of pulseLayers) {
          const owner = pid.split('__')[0] ?? '';
          if (!active.has(owner) || !map.getLayer(pid)) continue;
          map.setPaintProperty(pid, 'circle-radius', 5 + 16 * phase);
          map.setPaintProperty(pid, 'circle-stroke-opacity', 0.7 * (1 - phase));
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function setVisible(id: string, on: boolean) {
    if (on) {
      active.add(id);
      if (!added.has(id)) void addLayer(id);
      for (const l of map.getStyle().layers.filter((x) => ownerOf(x) === id)) {
        map.setLayoutProperty(l.id, 'visibility', 'visible');
      }
    } else {
      for (const l of map.getStyle().layers.filter((x) => ownerOf(x) === id)) {
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
    for (const sel of app.querySelectorAll<HTMLSelectElement>('select[data-indicator-for]')) {
      const id = sel.dataset.indicatorFor ?? '';
      sel.addEventListener('change', () => {
        selectedIndicator.set(id, sel.value);
        const layer = layersById.get(id);
        if (layer) paintJoin(layer);
      });
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
        const keepLayers = prev.layers.filter((l) => {
          const o = ownerOf(l);
          return o !== undefined && layersById.has(o);
        });
        return {
          ...next,
          sources: { ...next.sources, ...keep },
          layers: [...next.layers, ...keepLayers],
        };
      },
    });
    map.once('styledata', () => {
      for (const id of added) {
        const layer = layersById.get(id);
        if (layer?.join) paintJoin(layer);
        else if (layer) drawLayer(layer);
      }
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
      .layers.filter((l) => {
        const o = ownerOf(l);
        return o !== undefined && active.has(o);
      })
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
    const layer = layersById.get(ownerOf(f.layer) ?? String(f.source));
    if (!layer) return;
    if (layer.join) {
      const row = rowsByLayer.get(layer.id)?.get(String(f.properties?.[layer.join.key]));
      if (!row) return;
      renderJoinFicha(fichaBody, layer, row, lang, dict, selectedIndicator.get(layer.id));
    } else {
      renderFicha(fichaBody, layer, f.properties ?? {}, lang, dict);
    }
    // Concello cards carry a four-column table and need a wider panel.
    ficha.classList.toggle('is-wide', !!layer.join?.key && !!layer.indicators?.length);
    ficha.hidden = false;
  });
  map.on('mousemove', (e) => {
    const ids = map
      .getStyle()
      .layers.filter((l) => {
        const o = ownerOf(l);
        return o !== undefined && active.has(o);
      })
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

function renderLegend(app: HTMLElement, id: string, items: LegendItem[], note: string) {
  const box = app.querySelector<HTMLElement>(`[data-legend-for="${id}"]`);
  if (!box) return;
  const list = el('ul', { class: 'ga-legend' });
  for (const it of items) {
    const li = el('li');
    li.append(
      el('span', {
        class: 'ga-legend-swatch',
        style: `background:${it.color}`,
        'aria-hidden': 'true',
      }),
    );
    li.append(document.createTextNode(it.label));
    list.append(li);
  }
  const parts: Node[] = [list];
  if (note) parts.push(el('p', { class: 'ga-legend-note' }, note));
  box.replaceChildren(...parts);
  box.hidden = false;
}

const bi = (v: string | { gl: string; es: string }, lang: 'gl' | 'es') =>
  typeof v === 'string' ? v : v[lang];

/** Legend blocks for a point, line or area layer: dots, rings, ramps, arrows. */
function renderBlocks(app: HTMLElement, id: string, blocks: LegendBlock[], lang: 'gl' | 'es') {
  const box = app.querySelector<HTMLElement>(`[data-legend-for="${id}"]`);
  if (!box) return;
  if (!blocks.length) {
    box.hidden = true;
    return;
  }
  const parts: Node[] = [];
  for (const b of blocks) {
    if (b.title) parts.push(el('p', { class: 'ga-legend-title' }, b.title[lang]));
    if (b.ramp) {
      const bar = el('div', {
        class: 'ga-legend-ramp',
        style: `background:linear-gradient(to right,${b.ramp.colors.join(',')})`,
        'aria-hidden': 'true',
      });
      const labels = el('div', { class: 'ga-legend-ramp-labels' });
      for (const l of b.ramp.labels) labels.append(el('span', {}, bi(l, lang)));
      parts.push(bar, labels);
    }
    if (b.entries?.length) {
      const list = el('ul', { class: 'ga-legend' });
      for (const e of b.entries) {
        const li = el('li');
        const size = e.size ?? 10;
        const shape = e.shape ?? 'fill';
        const mark = el('span', {
          class: `ga-legend-mark ga-legend-${shape}`,
          style: `--c:${e.color};--s:${Math.min(size, 32)}px`,
          'aria-hidden': 'true',
        });
        if (shape === 'arrow') mark.textContent = '➜';
        li.append(mark, document.createTextNode(bi(e.label, lang)));
        list.append(li);
      }
      parts.push(list);
    }
    if (b.note) parts.push(el('p', { class: 'ga-legend-note' }, b.note[lang]));
  }
  box.replaceChildren(...parts);
  box.hidden = false;
}

/** Card for a concello: every indicator with its value, Galicia's and the comparison. */
function renderJoinFicha(
  body: HTMLElement,
  layer: Layer,
  row: Row,
  lang: string,
  dict: Dict,
  selected?: string,
) {
  const l = lang as 'gl' | 'es';
  const h = el('h2', {}, String(row.nome ?? ''));
  const sub = el('p', { class: 'ga-ficha-layer' }, layer.title[l]);
  const parts: Node[] = [h, sub];
  if (layer.indicators?.length) {
    const table = el('table', { class: 'ga-table ga-ficha-table' });
    const head = el('tr');
    for (const t of [dict.indicator, dict.value, 'Galicia', dict.comparison]) {
      head.append(el('th', { scope: 'col' }, t ?? ''));
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const ind of layer.indicators) {
      const tr = el('tr', ind.id === selected ? { class: 'is-selected' } : {});
      const d = deviation(row, ind);
      const rel = row[`${ind.id}_rel`];
      const relTxt =
        rel === null || rel === undefined
          ? '—'
          : ind.comparison === 'index'
            ? `${formatValue(rel, lang)} (Galicia = 100)`
            : `${d !== null && d > 0 ? '+' : ''}${formatValue(rel, lang)} p.`;
      tr.append(
        el('th', { scope: 'row' }, `${ind.label[l]} (${ind.unit})`),
        el('td', {}, `${formatValue(row[ind.id], lang)}`),
        el('td', {}, formatValue(row[`${ind.id}_galicia`], lang)),
        el('td', {}, relTxt),
      );
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const periods = [
      ...new Set(layer.indicators.map((i) => row[`${i.id}_periodo`]).filter(Boolean)),
    ];
    const wrap = el('div', { class: 'ga-ficha-table-wrap' });
    wrap.append(table);
    parts.push(
      wrap,
      el(
        'p',
        { class: 'ga-ficha-meta' },
        `${dict.period}: ${periods.join(', ')}. ${dict.own_calc}`,
      ),
    );
  } else {
    const dl = el('dl');
    for (const f of layer.table.fields) {
      if (f in row) dl.append(el('dt', {}, fieldLabel(f)), el('dd', {}, formatValue(row[f], lang)));
    }
    parts.push(dl);
  }
  const links = el('p');
  links.append(
    el('a', { href: layer.source_url, rel: 'noopener' }, dict.source ?? ''),
    document.createTextNode(` · ${layer.attribution}`),
  );
  parts.push(links);
  body.replaceChildren(...parts);
}
