// Concello portrait (/retrato/). The 313 concellos are dots: on a map at their representative
// point, or along a strip ordered by the active indicator. Scrolling through the indicator
// cards moves the dots between layouts, so the map and the distribution are one picture.
//
// Data: every catalogue layer joined to concellos-parroquias with indicators, read from the
// same table.json files the map uses. Dot positions come from perfil-concellos. Nothing is
// requested from another origin. Colours follow the map's diverging scale (distance from the
// Galicia value, not better or worse).

import {
  breaksFor,
  classIndex,
  DIVERGING,
  deviation,
  type Indicator,
  type Row,
} from '../map/choropleth.ts';
import { asset } from '../paths.ts';
import { beeswarm, easeInOutCubic, fitGeo, position, valueScale } from './layout.ts';

interface Layer {
  id: string;
  title: { gl: string; es: string };
  attribution: string;
  source_url: string;
  licence: { spdx?: string; text_url: string };
  join?: { layer: string; key: string };
  indicators?: Indicator[];
  meta: { status: 'fresh' | 'stale' | 'failed'; published_at: string | null } | null;
}

interface Concello {
  code: string;
  nome: string;
  provincia: string;
  lon: number;
  lat: number;
  superficie: number | null;
  lugares: number | null;
}

interface Item {
  key: string;
  layer: Layer;
  ind: Indicator;
  rows: Map<string, Row>;
  /** Values of every concello with data, for scales and positions. */
  values: number[];
  breaks: { near: number; strong: number };
}

interface Dot {
  x: number;
  y: number;
  r: number;
  color: string;
  from: { x: number; y: number; r: number; color: string };
  to: { x: number; y: number; r: number; color: string };
  delay: number;
}

type Dict = Record<string, string>;
type Mode = 'map' | 'strip';

const PROFILE = 'perfil-concellos';
const JOIN = 'concellos-parroquias';
/** Reading order of the groups; any other joined layer follows. */
const ORDER = ['indicadores-concellos', PROFILE, 'vut-concello', 'cobertura-banda-larga'];
const DURATION = 800;
const STAGGER = 380;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

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

function fill(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);
}

/** "#rrggbb" or "rgb(…)" → [r, g, b]; anything else → null (then colours switch, not blend). */
function rgb(c: string): [number, number, number] | null {
  const h = /^#([0-9a-f]{6})$/i.exec(c);
  if (h?.[1]) {
    const n = Number.parseInt(h[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function mix(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const c = ca.map((v, i) => Math.round(v + ((cb[i] as number) - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.rt-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const nf = new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES', {
    maximumFractionDigits: 1,
  });
  const fmt = (v: number | null) =>
    v === null
      ? '—'
      : Math.abs(v) < 1 && v !== 0
        ? v.toLocaleString(lang, { maximumFractionDigits: 2 })
        : nf.format(v);

  const stage = app.querySelector<HTMLElement>('.rt-stage') as HTMLElement;
  const canvas = app.querySelector<HTMLCanvasElement>('.rt-canvas') as HTMLCanvasElement;
  const tip = app.querySelector<HTMLElement>('.rt-tip') as HTMLElement;
  const list = app.querySelector<HTMLElement>('.rt-list') as HTMLElement;
  const status = app.querySelector<HTMLElement>('.rt-status') as HTMLElement;
  const search = app.querySelector<HTMLInputElement>('.rt-search input') as HTMLInputElement;
  const datalist = app.querySelector<HTMLDataListElement>('#rt-concellos') as HTMLDataListElement;
  const foot = app.querySelector<HTMLElement>('.rt-stage-foot');
  const modeButtons = [...app.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  // ---- Data -------------------------------------------------------------------------------
  let catalog: { layers: Layer[] };
  try {
    catalog = (await (await fetch(asset('data/catalog.json'))).json()) as { layers: Layer[] };
  } catch {
    status.textContent = dict.load_error ?? '';
    return;
  }
  const joined = catalog.layers
    .filter((l) => l.join?.layer === JOIN && (l.indicators?.length ?? 0) > 0 && l.meta)
    .sort((a, b) => rank(a.id) - rank(b.id));
  function rank(id: string): number {
    const i = ORDER.indexOf(id);
    return i < 0 ? ORDER.length : i;
  }
  if (!joined.some((l) => l.id === PROFILE)) {
    status.textContent = dict.portrait_missing ?? '';
    return;
  }
  const tables = await Promise.all(
    joined.map(async (l) => {
      try {
        const r = await fetch(asset(`data/${l.id}/table.json`));
        return r.ok ? ((await r.json()) as Row[]) : null;
      } catch {
        return null;
      }
    }),
  );

  const concellos: Concello[] = [];
  const items: Item[] = [];
  joined.forEach((layer, li) => {
    const rows = tables[li];
    if (!rows) return;
    const key = layer.join?.key ?? 'codigo_ine';
    const byCode = new Map(rows.map((r) => [String(r[key]), r]));
    if (layer.id === PROFILE) {
      for (const r of rows) {
        const lon = num(r.lon);
        const lat = num(r.lat);
        if (lon === null || lat === null) continue;
        concellos.push({
          code: String(r.codigo_ine),
          nome: String(r.nome ?? ''),
          provincia: String(r.provincia ?? ''),
          lon,
          lat,
          superficie: num(r.superficie_km2),
          lugares: num(r.lugares),
        });
      }
    }
    for (const ind of layer.indicators ?? []) {
      const values = rows.map((r) => num(r[ind.id])).filter((v): v is number => v !== null);
      if (values.length < 2) continue;
      items.push({
        key: `${layer.id}.${ind.id}`,
        layer,
        ind,
        rows: byCode,
        values,
        breaks: breaksFor(rows, ind),
      });
    }
  });
  if (concellos.length === 0) {
    status.textContent = dict.portrait_missing ?? '';
    return;
  }
  concellos.sort((a, b) => a.nome.localeCompare(b.nome, lang));
  const byCode = new Map(concellos.map((c) => [c.code, c]));
  const byName = new Map(concellos.map((c) => [c.nome.toLocaleLowerCase(lang), c]));
  for (const c of concellos) datalist.append(el('option', { value: c.nome }));

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  let selected = byCode.get(params.get('c') ?? '') ?? byCode.get('15078') ?? concellos[0];
  let active: Item | null = items.find((i) => i.key === params.get('i')) ?? null;
  let mode: Mode = params.get('v') === 'map' ? 'map' : 'strip';
  let hover: Concello | null = null;

  const writeHash = () => {
    const p = new URLSearchParams();
    if (selected) p.set('c', selected.code);
    if (active) p.set('i', active.key);
    if (mode === 'map') p.set('v', 'map');
    history.replaceState(null, '', `#${p.toString()}`);
  };

  // ---- Geometry ---------------------------------------------------------------------------
  let width = 0;
  let height = 0;
  const dots: Dot[] = concellos.map(() => ({
    x: 0,
    y: 0,
    r: 0,
    color: '#888',
    from: { x: 0, y: 0, r: 0, color: '#888' },
    to: { x: 0, y: 0, r: 0, color: '#888' },
    delay: 0,
  }));
  let axis: {
    y: number;
    x0: number;
    x1: number;
    galicia: number | null;
    galiciaValue: number | null;
    min: number;
    max: number;
    kind: 'linear' | 'log' | 'sqrt';
  } | null = null;

  const palette = () => (darkQuery.matches ? DIVERGING.dark : DIVERGING.light);

  function colorOf(c: Concello): string {
    if (!active) return cssVar('--text-muted');
    const row = active.rows.get(c.code);
    const d = row ? deviation(row, active.ind) : null;
    return d === null ? cssVar('--border') : (palette()[classIndex(d, active.breaks)] ?? '#888');
  }

  function valueFor(c: Concello, item: Item | null = active): number | null {
    return item ? num(item.rows.get(c.code)?.[item.ind.id]) : null;
  }

  /** Target layout for the current mode and indicator. */
  function targets(): Array<{ x: number; y: number; r: number; color: string }> {
    const pad = Math.max(16, width * 0.05);
    const narrow = width < 520;
    if (mode === 'map' || !active) {
      axis = null;
      const project = fitGeo(
        concellos.map((c) => [c.lon, c.lat]),
        { x: pad, y: pad, width: width - 2 * pad, height: height - 2 * pad },
      );
      const r = Math.max(2.5, Math.min(width, height) / (narrow ? 90 : 110));
      return concellos.map((c) => ({ ...project(c.lon, c.lat), r, color: colorOf(c) }));
    }
    const item = active;
    const x0 = pad + 8;
    const x1 = width - pad - 8;
    const scale = valueScale(item.values, x0, x1);
    const cy = height * 0.5 + 4;
    const xs = concellos.map((c) => {
      const v = valueFor(c, item);
      return v === null ? Number.NaN : scale(v);
    });
    const withData = xs.map((x, i) => ({ x, i })).filter((p) => !Number.isNaN(p.x));
    let r = Math.min(7, Math.max(2.5, (x1 - x0) / 70));
    let ys: number[] = [];
    for (let tries = 0; tries < 8; tries++) {
      ys = beeswarm(
        withData.map((p) => p.x),
        r + 0.6,
      );
      if (Math.max(0, ...ys.map(Math.abs)) <= height * 0.5 - 44) break;
      r *= 0.86;
    }
    // Still too tall for a very peaked distribution: squeeze the offsets (dots may touch).
    const limit = height * 0.5 - 44;
    const tallest = Math.max(0, ...ys.map(Math.abs));
    if (tallest > limit) ys = ys.map((y) => (y * limit) / tallest);
    const out = concellos.map(() => ({ x: 0, y: 0, r, color: '' }));
    withData.forEach((p, k) => {
      out[p.i] = { x: p.x, y: cy + (ys[k] ?? 0), r, color: colorOf(concellos[p.i] as Concello) };
    });
    // Concellos without data line up quietly in the top-left corner.
    let n = 0;
    concellos.forEach((c, i) => {
      if (!Number.isNaN(xs[i] as number)) return;
      out[i] = { x: x0 + n * (r * 2.4), y: 10, r: r * 0.8, color: colorOf(c) };
      n++;
    });
    const g = num(
      [...item.rows.values()].find((row) => num(row[`${item.ind.id}_galicia`]) !== null)?.[
        `${item.ind.id}_galicia`
      ],
    );
    axis = {
      y: cy,
      x0,
      x1,
      galicia: g === null ? null : scale(g),
      galiciaValue: g,
      min: scale.domain[0],
      max: scale.domain[1],
      kind: scale.kind,
    };
    return out;
  }

  // ---- Animation and drawing --------------------------------------------------------------
  let animStart = 0;
  let animating = false;

  function layout(animate: boolean) {
    const t = targets();
    const xs = t.map((p) => p.x);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    dots.forEach((d, i) => {
      const to = t[i] as Dot['to'];
      d.from = { x: d.x, y: d.y, r: d.r, color: d.color };
      d.to = to;
      // A wave across the stage: the left side moves first.
      d.delay = maxX > minX ? ((to.x - minX) / (maxX - minX)) * STAGGER : 0;
    });
    if (!animate || reducedMotion.matches) {
      for (const d of dots) Object.assign(d, d.to);
      animating = false;
      draw();
      return;
    }
    animStart = performance.now();
    if (!animating) {
      animating = true;
      requestAnimationFrame(frame);
    }
  }

  function frame(now: number) {
    let done = true;
    for (const d of dots) {
      const t = Math.min(1, Math.max(0, (now - animStart - d.delay) / DURATION));
      if (t < 1) done = false;
      const e = easeInOutCubic(t);
      d.x = d.from.x + (d.to.x - d.from.x) * e;
      d.y = d.from.y + (d.to.y - d.from.y) * e;
      d.r = d.from.r + (d.to.r - d.from.r) * e;
      d.color = mix(d.from.color, d.to.color, e);
    }
    draw();
    if (done) animating = false;
    else requestAnimationFrame(frame);
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, canvas.height);
    const text = cssVar('--text');
    const muted = cssVar('--text-muted');
    const surface = cssVar('--surface');
    ctx.font = `600 13px ${cssVar('--gs-font-corpo')}`;

    if (axis && active && mode === 'strip') {
      ctx.strokeStyle = cssVar('--border');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(axis.x0, axis.y);
      ctx.lineTo(axis.x1, axis.y);
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.textBaseline = 'top';
      const bottom = height - 18;
      ctx.textAlign = 'left';
      ctx.fillText(fmt(axis.min), axis.x0, bottom);
      ctx.textAlign = 'right';
      ctx.fillText(`${fmt(axis.max)} ${active.ind.unit}`, axis.x1, bottom);
      if (axis.kind !== 'linear' && width > 560) {
        ctx.textAlign = 'center';
        const note = axis.kind === 'log' ? dict.portrait_log : dict.portrait_sqrt;
        ctx.fillText(note ?? '', (axis.x0 + axis.x1) / 2, bottom);
      }
      if (axis.galicia !== null) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = muted;
        ctx.beginPath();
        ctx.moveTo(axis.galicia, 30);
        ctx.lineTo(axis.galicia, height - 26);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = muted;
        const gLabel = `Galicia · ${fmt(axis.galiciaValue)}`;
        const gw = ctx.measureText(gLabel).width;
        ctx.fillText(gLabel, Math.min(width - gw / 2 - 4, Math.max(gw / 2 + 4, axis.galicia)), 26);
      }
    }

    const sel = selected ? concellos.indexOf(selected) : -1;
    const hov = hover ? concellos.indexOf(hover) : -1;
    dots.forEach((d, i) => {
      if (i === sel) return;
      ctx.beginPath();
      ctx.arc(d.x, d.y, Math.max(0.5, d.r), 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      // A faint outline in the text colour keeps the pale middle class visible on any background.
      ctx.lineWidth = 0.75;
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = text;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    if (hov >= 0 && hov !== sel) {
      const d = dots[hov] as Dot;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r + 2, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = text;
      ctx.stroke();
    }
    if (sel >= 0 && selected) {
      const d = dots[sel] as Dot;
      const R = Math.max(d.r * 1.9, 7);
      ctx.beginPath();
      ctx.arc(d.x, d.y, R + 5, 0, Math.PI * 2);
      ctx.fillStyle = `${surface}`;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(d.x, d.y, R, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = text;
      ctx.stroke();
      // Label above the dot, kept inside the stage.
      const v = valueFor(selected);
      const label = active && v !== null ? `${selected.nome} · ${fmt(v)}` : selected.nome;
      ctx.font = `700 15px ${cssVar('--gs-font-corpo')}`;
      const w = ctx.measureText(label).width;
      const lx = Math.min(width - w / 2 - 8, Math.max(w / 2 + 8, d.x));
      const ly = d.y - R - 10;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4;
      ctx.strokeStyle = surface;
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = text;
      ctx.fillText(label, lx, ly);
    }
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = rect.width;
    // Plot height: the footer bar (legend and view switch) sits over the bottom of the canvas.
    height = rect.height - (foot?.offsetHeight ?? 0);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    layout(false);
  }

  // ---- Cards ------------------------------------------------------------------------------
  const cards = new Map<string, HTMLElement>();
  const intro = el('section', { class: 'rt-card rt-intro', 'data-key': '' });
  list.append(intro);
  let currentGroup = '';
  for (const item of items) {
    if (item.layer.id !== currentGroup) {
      currentGroup = item.layer.id;
      const head = el('header', { class: 'rt-group' });
      head.append(el('h2', {}, item.layer.title[lang]));
      if (item.layer.meta && item.layer.meta.status !== 'fresh') {
        head.append(
          el(
            'span',
            { class: 'ga-status', 'data-status': item.layer.meta.status },
            dict[`status_${item.layer.meta.status}`] ?? '',
          ),
        );
      }
      const src = el('details', { class: 'rt-source' });
      const body = el('p');
      body.append(
        el('a', { href: item.layer.source_url, rel: 'noopener' }, dict.source ?? ''),
        document.createTextNode(` · ${item.layer.attribution}`),
      );
      src.append(el('summary', {}, dict.portrait_sources ?? ''), body);
      head.append(src);
      list.append(head);
    }
    const card = el('section', {
      class: 'rt-card',
      'data-key': item.key,
      tabindex: '0',
      'aria-label': item.ind.label[lang],
    });
    cards.set(item.key, card);
    list.append(card);
  }

  function renderIntro() {
    if (!selected) return;
    const c = selected;
    intro.replaceChildren(
      el('p', { class: 'rt-kicker' }, c.provincia),
      el('h1', { class: 'rt-name' }, c.nome),
      el(
        'p',
        { class: 'rt-facts' },
        [
          c.superficie !== null ? `${fmt(c.superficie)} km²` : '',
          c.lugares ? `${nf.format(c.lugares)} ${dict.portrait_places}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      ),
      el('p', { class: 'rt-lede' }, fill(dict.portrait_lede ?? '', { n: concellos.length })),
    );
  }

  function miniStrip(item: Item, value: number | null): SVGSVGElement {
    const W = 300;
    const H = 30;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'rt-mini');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    const s = valueScale(item.values, 2, W - 2);
    const ticks = document.createElementNS(ns, 'path');
    ticks.setAttribute('d', item.values.map((v) => `M${s(v).toFixed(1)} 8V22`).join(''));
    ticks.setAttribute('class', 'rt-mini-ticks');
    svg.append(ticks);
    const g = num([...item.rows.values()][0]?.[`${item.ind.id}_galicia`]);
    if (g !== null) {
      const gl = document.createElementNS(ns, 'path');
      gl.setAttribute('d', `M${s(g).toFixed(1)} 2V28`);
      gl.setAttribute('class', 'rt-mini-galicia');
      svg.append(gl);
    }
    if (value !== null) {
      const me = document.createElementNS(ns, 'path');
      me.setAttribute('d', `M${s(value).toFixed(1)} 0V30`);
      me.setAttribute('class', 'rt-mini-me');
      svg.append(me);
    }
    return svg;
  }

  function renderCard(item: Item) {
    const card = cards.get(item.key);
    if (!card || !selected) return;
    const row = item.rows.get(selected.code);
    const v = valueFor(selected, item);
    const g = num(row?.[`${item.ind.id}_galicia`]);
    const periodo = row?.[`${item.ind.id}_periodo`];
    const parts: Node[] = [el('h3', {}, item.ind.label[lang])];
    const big = el('p', { class: 'rt-value' });
    big.append(
      el('strong', {}, fmt(v)),
      document.createTextNode(v === null ? ` ${dict.portrait_no_data}` : ` ${item.ind.unit}`),
    );
    parts.push(big);
    parts.push(el('p', { class: 'rt-galicia' }, `Galicia: ${fmt(g)} ${item.ind.unit}`));
    if (v !== null) {
      const pos = position(v, item.values);
      const key =
        pos.side === 'middle'
          ? 'portrait_middle'
          : pos.side === 'above'
            ? 'portrait_above'
            : 'portrait_below';
      parts.push(el('p', { class: 'rt-pos' }, fill(dict[key] ?? '', { pct: pos.pct })));
    }
    parts.push(miniStrip(item, v));
    const meta: string[] = [];
    if (periodo) meta.push(`${dict.period}: ${periodo}`);
    meta.push(item.ind.source);
    parts.push(el('p', { class: 'rt-meta' }, meta.join(' · ')));
    if (item.ind.note) {
      const det = el('details', { class: 'rt-note' });
      det.append(el('summary', {}, dict.portrait_how ?? ''), el('p', {}, item.ind.note[lang]));
      parts.push(det);
    }
    card.replaceChildren(...parts);
  }

  function renderAll() {
    renderIntro();
    for (const item of items) renderCard(item);
    for (const [k, c] of cards) c.classList.toggle('is-active', active?.key === k);
    search.value = selected?.nome ?? '';
    const v = selected ? valueFor(selected) : null;
    canvas.setAttribute(
      'aria-label',
      active && selected
        ? `${active.ind.label[lang]}. ${selected.nome}: ${fmt(v)} ${active.ind.unit}.`
        : (dict.portrait_canvas ?? ''),
    );
    for (const b of modeButtons) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      // The intro always shows the map: the switch only applies to an indicator.
      b.disabled = !active;
    }
  }

  // ---- Interaction ------------------------------------------------------------------------
  function select(c: Concello | undefined) {
    if (!c || c === selected) return;
    selected = c;
    renderAll();
    writeHash();
    draw();
  }

  function activate(key: string) {
    const next = items.find((i) => i.key === key) ?? null;
    if (next === active) return;
    active = next;
    for (const [k, c] of cards) c.classList.toggle('is-active', active?.key === k);
    renderAll();
    writeHash();
    layout(true);
  }

  search.addEventListener('change', () => {
    const c = byName.get(search.value.trim().toLocaleLowerCase(lang));
    if (c) select(c);
    else status.textContent = dict.portrait_not_found ?? '';
  });
  search.addEventListener('input', () => {
    status.textContent = '';
  });

  for (const b of modeButtons) {
    b.addEventListener('click', () => {
      mode = b.dataset.mode === 'map' ? 'map' : 'strip';
      renderAll();
      writeHash();
      layout(true);
    });
  }

  function hit(e: PointerEvent): Concello | null {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    dots.forEach((d, i) => {
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd < bestD && dd <= (d.r + 6) ** 2) {
        bestD = dd;
        best = i;
      }
    });
    return best >= 0 ? (concellos[best] as Concello) : null;
  }

  canvas.addEventListener('pointermove', (e) => {
    const c = hit(e);
    if (c !== hover) {
      hover = c;
      if (!animating) draw();
    }
    if (c) {
      const v = valueFor(c);
      tip.textContent = active && v !== null ? `${c.nome} · ${fmt(v)} ${active.ind.unit}` : c.nome;
      const rect = stage.getBoundingClientRect();
      tip.style.left = `${Math.min(rect.width - 8, e.clientX - rect.left + 12)}px`;
      tip.style.top = `${e.clientY - rect.top + 12}px`;
      tip.hidden = false;
      canvas.style.cursor = 'pointer';
    } else {
      tip.hidden = true;
      canvas.style.cursor = '';
    }
  });
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    tip.hidden = true;
    if (!animating) draw();
  });
  canvas.addEventListener('click', (e) => select(hit(e) ?? undefined));

  // Scrollytelling: the card crossing the middle of the viewport drives the stage.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        activate((e.target as HTMLElement).dataset.key ?? '');
      }
    },
    { rootMargin: '-50% 0px -45% 0px' },
  );
  observer.observe(intro);
  for (const c of cards.values()) {
    observer.observe(c);
    c.addEventListener('click', () => activate(c.dataset.key ?? ''));
    c.addEventListener('focus', () => activate(c.dataset.key ?? ''));
  }

  // Links to another concello or indicator on the same page arrive as a hash change.
  window.addEventListener('hashchange', () => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    const c = byCode.get(p.get('c') ?? '');
    const m: Mode = p.get('v') === 'map' ? 'map' : 'strip';
    if (m !== mode) {
      mode = m;
      layout(true);
    }
    if (c) select(c);
    const key = p.get('i');
    if (key && key !== active?.key) {
      activate(key);
      cards
        .get(key)
        ?.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    }
  });

  new ResizeObserver(() => resize()).observe(stage);
  darkQuery.addEventListener('change', () => layout(false));

  status.textContent = '';
  renderAll();
  resize();
  // Opening: the dots gather from the selected concello into the map of Galicia.
  if (!reducedMotion.matches && selected) {
    const s = dots[concellos.indexOf(selected)] as Dot;
    const target = targets();
    dots.forEach((d, i) => {
      Object.assign(d, { x: s.to.x, y: s.to.y, r: 0, color: (target[i] as Dot['to']).color });
    });
    layout(true);
  }
  if (active) cards.get(active.key)?.scrollIntoView({ block: 'start' });
}
