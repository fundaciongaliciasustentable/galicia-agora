// /deformada/: cartograms of the 313 concellos (galicia-deformada layer). The pipeline gives
// every concello its rings in each variable on a common grid, so this page only decodes them,
// fits them to the screen and interpolates between two of them.
//
// A pair of variables with the same unit (births and deaths, young and old, two censuses) is
// drawn at the same scale: each map's total area follows Galicia's total, so the smaller one
// shrinks. Other pairs fill the same area and compare shares only.

import { asset } from '../paths.ts';

type Dict = Record<string, string>;

export const VARS = [
  'superficie',
  'poboacion',
  'pib',
  'nacementos',
  'defuncions',
  'menores_20',
  'maiores_65',
  'poboacion_1950',
  'poboacion_2021',
] as const;
export type Var = (typeof VARS)[number];

/** Pairs drawn at the same scale (same unit). */
const SAME_SCALE = new Set([
  'nacementos~defuncions',
  'menores_20~maiores_65',
  'poboacion_1950~poboacion_2021',
]);

export const PROVINCE_COLOURS: Record<string, string> = {
  'A Coruña': '#e8925a',
  Lugo: '#a6c86e',
  Ourense: '#5cc2b0',
  Pontevedra: '#7b98e6',
};

interface Concello {
  code: string;
  name: string;
  province: string;
  values: Record<Var, number | null>;
  /** Absolute ring positions per variable, flat [x0, y0, x1, y1, …]. */
  rings: Record<Var, Float32Array[]>;
}

/** [x0, y0, dx1, dy1, …] → absolute positions. */
export function decodeRing(r: number[]): Float32Array {
  const out = new Float32Array(r.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i < r.length; i += 2) {
    x += r[i] as number;
    y += r[i + 1] as number;
    out[i] = x;
    out[i + 1] = y;
  }
  return out;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.df-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const pf = new Intl.NumberFormat(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const pf2 = new Intl.NumberFormat(loc, { maximumSignificantDigits: 2 });
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const tr = (key: string, vars: Record<string, string | number> = {}) => {
    let s = dict[key] ?? key;
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  const svg = q<SVGSVGElement>('.df-stage');
  const g = q<SVGGElement>('.df-shapes');
  const heading = q<HTMLElement>('.df-heading');
  const totalEl = q<HTMLElement>('.df-total');
  const scaleEl = q<HTMLElement>('.df-scale');
  const detail = q<HTMLElement>('.df-detail');
  const status = q<HTMLElement>('.df-status');
  const playBtn = q<HTMLButtonElement>('.df-play');
  const tbody = q<HTMLElement>('.df-table tbody');
  const caption = q<HTMLElement>('.df-table caption');
  const sources = q<HTMLElement>('.df-sources');
  const hint = detail.innerHTML;

  // ---- Data -------------------------------------------------------------------------------
  const LAYER = 'galicia-deformada';
  let concellos: Concello[] = [];
  let periods: Record<string, string> = {};
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      const fc = (await (await fetch(asset(`data/${LAYER}/data.geojson`))).json()) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      concellos = fc.features.map(({ properties: p }) => {
        const formas = p.formas as Record<Var, number[][]>;
        const values = {} as Record<Var, number | null>;
        const rings = {} as Record<Var, Float32Array[]>;
        for (const v of VARS) {
          values[v] = (v === 'superficie' ? p.superficie_km2 : p[v]) as number | null;
          rings[v] = formas[v].map(decodeRing);
        }
        return {
          code: String(p.codigo_ine),
          name: String(p.nome),
          province: String(p.provincia),
          values,
          rings,
        };
      });
      periods = (fc.features[0]?.properties.periodos as Record<string, string>) ?? {};
      sources.textContent = layer.attribution;
    }
  } catch {
    // Handled below.
  }
  if (concellos.length === 0) {
    status.textContent = dict.deform_missing ?? '';
    return;
  }
  status.textContent = '';

  const totals = Object.fromEntries(
    VARS.map((v) => [v, concellos.reduce((s, c) => s + (c.values[v] ?? 0), 0)]),
  ) as Record<Var, number>;

  // Frame: the union of every map at full size, so a shrunk map stays in place.
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of concellos) {
    for (const v of VARS) {
      for (const r of c.rings[v]) {
        for (let i = 0; i < r.length; i += 2) {
          x0 = Math.min(x0, r[i] as number);
          x1 = Math.max(x1, r[i] as number);
          y0 = Math.min(y0, r[i + 1] as number);
          y1 = Math.max(y1, r[i + 1] as number);
        }
      }
    }
  }
  const pad = (x1 - x0) * 0.03;
  svg.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`);

  /** Area-weighted centre of a variable's map (about which it is scaled). */
  const centre = Object.fromEntries(
    VARS.map((v) => {
      let a = 0;
      let cx = 0;
      let cy = 0;
      for (const c of concellos) {
        for (const r of c.rings[v]) {
          for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
            const cr =
              (r[j] as number) * (r[i + 1] as number) - (r[i] as number) * (r[j + 1] as number);
            a += cr;
            cx += ((r[j] as number) + (r[i] as number)) * cr;
            cy += ((r[j + 1] as number) + (r[i + 1] as number)) * cr;
          }
        }
      }
      return [v, [cx / (3 * a), cy / (3 * a)]];
    }),
  ) as Record<Var, [number, number]>;

  // ---- Shapes -----------------------------------------------------------------------------
  const pathEls = concellos.map((c) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('fill', PROVINCE_COLOURS[c.province] ?? '#888');
    el.dataset.code = c.code;
    g.append(el);
    return el;
  });

  /** Linear scale factor of a variable inside a pair (1 unless the pair shares a scale). */
  const scaleOf = (v: Var, pair: [Var, Var] | null) => {
    if (!pair || !SAME_SCALE.has(pair.join('~'))) return 1;
    const big = Math.max(totals[pair[0]], totals[pair[1]]);
    return Math.sqrt(totals[v] / big);
  };

  /** Draw every concello between `a` (t = 0) and `b` (t = 1). */
  function draw(a: Var, b: Var, t: number, sa: number, sb: number) {
    const [ax, ay] = centre[a];
    const [bx, by] = centre[b];
    concellos.forEach((c, u) => {
      let d = '';
      c.rings[a].forEach((ra, k) => {
        const rb = c.rings[b][k] as Float32Array;
        for (let i = 0; i < ra.length; i += 2) {
          const xa = ax + ((ra[i] as number) - ax) * sa;
          const ya = ay + ((ra[i + 1] as number) - ay) * sa;
          const xb = bx + ((rb[i] as number) - bx) * sb;
          const yb = by + ((rb[i + 1] as number) - by) * sb;
          d += `${i ? 'L' : 'M'}${(xa + (xb - xa) * t).toFixed(1)} ${(ya + (yb - ya) * t).toFixed(1)}`;
        }
        d += 'Z';
      });
      pathEls[u]?.setAttribute('d', d);
    });
  }

  // ---- State ------------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.hash.slice(1));
  const isVar = (s: string | null): s is Var => VARS.includes(s as Var);
  let current: Var = isVar(params.get('v')) ? (params.get('v') as Var) : 'poboacion';
  let pair: [Var, Var] | null = null;
  const fromPair = (params.get('p') ?? '').split('~');
  if (fromPair.length === 2 && isVar(fromPair[0] ?? null) && isVar(fromPair[1] ?? null)) {
    pair = fromPair as [Var, Var];
    current = pair[0];
  }
  let selected: string | null = null;
  let playing = !reducedMotion.matches;
  // Shown state: from `shown` towards `target`.
  let shown: Var = current;
  let shownScale = scaleOf(current, pair);
  let anim: number | null = null;
  let loopTimer: number | null = null;

  const writeHash = () => {
    history.replaceState(null, '', pair ? `#p=${pair.join('~')}` : `#v=${current}`);
  };

  function morphTo(v: Var, done?: () => void) {
    if (anim !== null) cancelAnimationFrame(anim);
    const from = shown;
    const fromScale = shownScale;
    const toScale = scaleOf(v, pair);
    current = v;
    describe();
    if (reducedMotion.matches || (from === v && fromScale === toScale)) {
      shown = v;
      shownScale = toScale;
      draw(v, v, 0, toScale, toScale);
      done?.();
      return;
    }
    const t0 = performance.now();
    const ms = 1800;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      draw(from, v, ease(t), fromScale, toScale);
      if (t < 1) anim = requestAnimationFrame(step);
      else {
        anim = null;
        shown = v;
        shownScale = toScale;
        done?.();
      }
    };
    anim = requestAnimationFrame(step);
  }

  function loop() {
    if (!pair || !playing) return;
    const next = current === pair[0] ? pair[1] : pair[0];
    loopTimer = window.setTimeout(() => morphTo(next, loop), 2200);
  }

  function stopLoop() {
    if (loopTimer !== null) clearTimeout(loopTimer);
    loopTimer = null;
  }

  // ---- Text -------------------------------------------------------------------------------
  const fmtValue = (v: Var, x: number) =>
    v === 'superficie'
      ? tr('deform_total_superficie', { v: nf.format(x) })
      : v === 'pib'
        ? tr('deform_total_pib', { v: nf.format(x / 1000) })
        : v === 'nacementos' || v === 'defuncions'
          ? tr(`deform_total_${v}`, { v: nf.format(x) })
          : tr('deform_total_people', { v: nf.format(x) });

  function describe() {
    heading.textContent = tr(`deform_heading_${current}`, { year: periods[current] ?? '' });
    totalEl.textContent = `Galicia: ${fmtValue(current, totals[current])}`;
    if (pair) {
      const same = SAME_SCALE.has(pair.join('~'));
      const ratio = same ? pf2.format((100 * totals[pair[0]]) / totals[pair[1]]) : '';
      scaleEl.textContent = `${tr(same ? 'deform_scale_same' : 'deform_scale_own')} ${tr(`deform_ratio_${pair[0]}`, { r: ratio })}`;
    } else scaleEl.textContent = '';
    for (const b of app.querySelectorAll<HTMLButtonElement>('[data-var]')) {
      b.setAttribute('aria-pressed', String(!pair && b.dataset.var === current));
    }
    for (const b of app.querySelectorAll<HTMLButtonElement>('[data-pair]')) {
      b.setAttribute('aria-pressed', String(pair !== null && b.dataset.pair === pair.join('~')));
    }
    playBtn.hidden = !pair || reducedMotion.matches;
    playBtn.textContent = tr(playing ? 'pulse_pause' : 'pulse_play');
    playBtn.setAttribute('aria-pressed', String(!playing));
    showDetail();
    fillTable();
  }

  function showDetail() {
    const c = concellos.find((x) => x.code === selected);
    for (const el of pathEls) el.classList.toggle('is-on', el.dataset.code === selected);
    if (!c) {
      detail.innerHTML = hint;
      return;
    }
    const value = c.values[current];
    const strong = document.createElement('strong');
    strong.textContent = c.name;
    const text =
      value === null
        ? tr('deform_detail_none')
        : tr('deform_detail', {
            value: fmtValue(current, value),
            share: pf.format((100 * value) / totals[current]),
            area: pf.format((100 * (c.values.superficie ?? 0)) / totals.superficie),
          });
    detail.replaceChildren(strong, document.createElement('br'), text);
  }

  function fillTable() {
    caption.textContent = heading.textContent;
    const rows = [...concellos]
      .filter((c) => c.values[current] !== null)
      .sort((a, b) => (b.values[current] ?? 0) - (a.values[current] ?? 0));
    tbody.replaceChildren(
      ...rows.map((c) => {
        const tr0 = document.createElement('tr');
        const v = c.values[current] as number;
        const cells = [
          c.name,
          current === 'pib' ? nf.format(v / 1000) : nf.format(v),
          pf.format((100 * v) / totals[current]),
          pf.format((100 * (c.values.superficie ?? 0)) / totals.superficie),
        ];
        cells.forEach((text, i) => {
          const td = document.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.setAttribute('scope', 'row');
          td.textContent = text;
          tr0.append(td);
        });
        return tr0;
      }),
    );
  }

  // ---- Events -----------------------------------------------------------------------------
  for (const b of app.querySelectorAll<HTMLButtonElement>('[data-var]')) {
    b.addEventListener('click', () => {
      stopLoop();
      pair = null;
      morphTo(b.dataset.var as Var);
      writeHash();
    });
  }
  for (const b of app.querySelectorAll<HTMLButtonElement>('[data-pair]')) {
    b.addEventListener('click', () => {
      stopLoop();
      pair = (b.dataset.pair ?? '').split('~') as [Var, Var];
      playing = !reducedMotion.matches;
      morphTo(pair[0], loop);
      writeHash();
    });
  }
  playBtn.addEventListener('click', () => {
    playing = !playing;
    stopLoop();
    describe();
    if (playing) loop();
  });
  const pick = (target: EventTarget | null) => {
    const code = (target as SVGElement | null)?.dataset?.code ?? null;
    if (code !== selected) {
      selected = code;
      showDetail();
    }
  };
  g.addEventListener('pointermove', (e) => pick(e.target));
  g.addEventListener('click', (e) => pick(e.target));
  svg.addEventListener('pointerleave', () => pick(null));

  draw(current, current, 0, shownScale, shownScale);
  describe();
  if (pair) loop();
}
