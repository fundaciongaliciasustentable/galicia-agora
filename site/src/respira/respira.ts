// /pulso/respira/: Galicia breathing. The monthly whole-Galicia images of the Sentinel-2 mosaic
// (previews.json of satelite-mes and ndvi-mes), cross-faded: two stacked images, the next month
// fading in over the current one, so green rises and falls and harvests and burns come and go.
// A period picks the months played: the last twelve, or any calendar year that is complete.

import { asset } from '../paths.ts';

type Dict = Record<string, string>;
interface Preview {
  month: string;
  file: string;
  scenes: number;
  gap_share: number;
  first_date: string | null;
  last_date: string | null;
}

const KINDS = ['satelite-mes', 'ndvi-mes'] as const;
type Kind = (typeof KINDS)[number];
/** Seconds per month. */
const PACE = 1.6;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const ease = (t: number) => t * t * (3 - 2 * t);

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.re-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const imgA = q<HTMLImageElement>('.re-a');
  const imgB = q<HTMLImageElement>('.re-b');
  const clock = q<HTMLElement>('.re-clock');
  const info = q<HTMLElement>('.re-info');
  const status = q<HTMLElement>('.re-status');
  const range = q<HTMLInputElement>('.re-range');
  const playBtn = q<HTMLButtonElement>('.re-play');
  const legend = q<HTMLElement>('.re-legend');
  const sources = q<HTMLElement>('.re-sources');
  const fill = (key: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), dict[key] ?? key);
  const months = (dict.pulse_months ?? '').split(',');
  const monthName = (m: string) =>
    `${months[Number(m.slice(5, 7)) - 1] ?? m.slice(5)} ${m.slice(0, 4)}`;
  const day = (iso: string | null) =>
    iso ? `${Number(iso.slice(8, 10))} de ${months[Number(iso.slice(5, 7)) - 1] ?? ''}` : '–';

  // ---- Data -------------------------------------------------------------------------------
  const series = new Map<Kind, Preview[]>();
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string }>;
    };
    sources.textContent = catalog.layers
      .filter((l) => (KINDS as readonly string[]).includes(l.id))
      .map((l) => l.attribution)
      .slice(0, 1)
      .join(' ');
    await Promise.all(
      KINDS.map(async (k) => {
        const r = await fetch(asset(`data/${k}/previews.json`));
        if (!r.ok) return;
        const idx = (await r.json()) as { previews: Preview[] };
        if (idx.previews?.length) series.set(k, idx.previews);
      }),
    );
  } catch {
    // Handled below.
  }
  if (series.size === 0) {
    status.textContent = dict.breath_missing ?? '';
    return;
  }

  let kind: Kind = series.has('satelite-mes') ? 'satelite-mes' : 'ndvi-mes';
  // Periods: the last twelve months, and every calendar year with its twelve months.
  const allMonths = [...new Set([...series.values()].flat().map((p) => p.month))].sort();
  const years = [...new Set(allMonths.map((m) => m.slice(0, 4)))].filter(
    (y) => allMonths.filter((m) => m.startsWith(y)).length === 12,
  );
  const periodBox = q<HTMLElement>('.re-periods');
  const params = new URLSearchParams(window.location.hash.slice(1));
  let period = years.includes(params.get('ano') ?? '') ? (params.get('ano') as string) : 'last';
  const inPeriod = (ps: Preview[]) =>
    period === 'last' ? ps.slice(-12) : ps.filter((p) => p.month.startsWith(period));
  let list = inPeriod(series.get(kind) as Preview[]);
  const src = (k: Kind, p: Preview) => asset(`data/${k}/${p.file}`);
  // Load every image once, so the fades never wait.
  for (const [k, ps] of series) for (const p of ps) new Image().src = src(k, p);

  // A year starts in January; the last twelve months, on the latest.
  let pos = period === 'last' ? Math.max(0, list.length - 1) : 0;
  let playing = !reducedMotion.matches && list.length > 1;
  let last: number | null = null;
  let raf: number | null = null;
  let shownA = '';
  let shownB = '';

  function draw() {
    const n = list.length;
    const i = Math.min(n - 1, Math.floor(pos));
    const j = (i + 1) % n;
    const t = n > 1 ? ease(pos - i) : 0;
    const a = src(kind, list[i] as Preview);
    const b = src(kind, list[j] as Preview);
    if (a !== shownA) imgA.src = shownA = a;
    if (b !== shownB) imgB.src = shownB = b;
    imgB.style.opacity = String(t);
    const p = list[Math.round(pos) % n] as Preview;
    clock.textContent = monthName(p.month);
    info.textContent =
      fill('breath_info', {
        scenes: p.scenes,
        from: day(p.first_date),
        to: day(p.last_date),
        gap: new Intl.NumberFormat(lang === 'gl' ? 'gl-ES' : 'es-ES', {
          maximumFractionDigits: 1,
        }).format(p.gap_share * 100),
      }) + (period === 'last' && n < 12 ? ` ${fill('breath_few', { n })}` : '');
    range.value = String(pos);
  }

  function tick(now: number) {
    if (last !== null && playing) {
      pos += (now - last) / 1000 / PACE;
      // The year closes on itself: after the last month, back to the first.
      if (pos >= list.length) pos -= list.length;
    }
    last = now;
    draw();
    raf = playing ? requestAnimationFrame(tick) : null;
  }

  function setPlaying(on: boolean) {
    playing = on && list.length > 1;
    playBtn.textContent = dict[playing ? 'pulse_pause' : 'pulse_play'] ?? '';
    playBtn.setAttribute('aria-pressed', String(!playing));
    playBtn.disabled = list.length < 2;
    last = null;
    if (playing && raf === null) raf = requestAnimationFrame(tick);
  }

  function choose(k: Kind) {
    if (!series.has(k)) return;
    kind = k;
    list = inPeriod(series.get(k) as Preview[]);
    if (list.length === 0) list = (series.get(k) as Preview[]).slice(-12);
    range.max = String(Math.max(0, list.length - 1));
    pos = Math.min(pos, list.length - 1);
    legend.hidden = k !== 'ndvi-mes';
    for (const b of app.querySelectorAll<HTMLButtonElement>('[data-kind]')) {
      b.setAttribute('aria-pressed', String(b.dataset.kind === k));
      b.disabled = !series.has(b.dataset.kind as Kind);
    }
    shownA = shownB = '';
    draw();
  }

  for (const b of app.querySelectorAll<HTMLButtonElement>('[data-kind]')) {
    b.addEventListener('click', () => choose(b.dataset.kind as Kind));
  }
  // Period buttons: the last twelve months and each complete year.
  for (const value of ['last', ...years]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.period = value;
    b.textContent = value === 'last' ? (dict.breath_last ?? '') : value;
    b.addEventListener('click', () => {
      period = value;
      pos = 0;
      history.replaceState(null, '', value === 'last' ? location.pathname : `#ano=${value}`);
      markPeriod();
      choose(kind);
    });
    periodBox.append(b);
  }
  const markPeriod = () => {
    for (const b of periodBox.querySelectorAll<HTMLButtonElement>('[data-period]')) {
      b.setAttribute('aria-pressed', String(b.dataset.period === period));
    }
  };
  periodBox.hidden = years.length === 0;
  markPeriod();
  playBtn.addEventListener('click', () => setPlaying(!playing));
  range.addEventListener('input', () => {
    setPlaying(false);
    pos = Number(range.value);
    draw();
  });
  status.textContent = '';
  choose(kind);
  setPlaying(playing);
}
