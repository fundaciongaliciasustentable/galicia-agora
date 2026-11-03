// The animated part of /linas/: ridgelines that move through time (galicia-linas-tempo layer).
// One sequence at a time on a canvas; between two frames every height is interpolated, so the
// lines rise and fall smoothly. The frame and its total are given as text next to it.

import { asset } from '../paths.ts';
import { decodeHeights } from './poster.ts';

type Dict = Record<string, string>;

interface Sequence {
  id: string;
  rows: number;
  cols: number;
  frames: string[];
  totals: number[];
  unit: string;
  heights: Uint8Array[];
}

/** Seconds per frame. */
const PACE: Record<string, number> = { seculo: 1.2, raios: 0.9, lume: 0.9 };
const UNITS: Record<string, Record<'gl' | 'es', string>> = {
  persoas: { gl: 'persoas', es: 'personas' },
  raios: { gl: 'raios', es: 'rayos' },
  hectáreas: { gl: 'hectáreas queimadas', es: 'hectáreas quemadas' },
};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const ease = (t: number) => t * t * (3 - 2 * t);

export async function startTempo(app: HTMLElement, dict: Dict, lang: 'gl' | 'es'): Promise<void> {
  const found = app.querySelector<HTMLElement>('.lt-box');
  if (!found) return;
  const box: HTMLElement = found;
  const q = <T extends Element>(sel: string) => box.querySelector<T>(sel) as T;
  const canvas = q<HTMLCanvasElement>('canvas');
  const frameEl = q<HTMLElement>('.lt-frame');
  const totalEl = q<HTMLElement>('.lt-total');
  const textEl = q<HTMLElement>('.lt-text');
  const playBtn = q<HTMLButtonElement>('.lt-play');
  const range = q<HTMLInputElement>('.lt-range');
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  // Own month names: browsers without Galician data would fall back to Spanish.
  const months = (dict.pulse_months ?? '').split(',');
  const label = (f: string) =>
    f.length === 7 ? `${months[Number(f.slice(5, 7)) - 1] ?? f.slice(5, 7)} ${f.slice(0, 4)}` : f;

  let sequences: Sequence[] = [];
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; meta: unknown }>;
    };
    if (catalog.layers.find((l) => l.id === 'galicia-linas-tempo')?.meta) {
      const fc = (await (await fetch(asset('data/galicia-linas-tempo/data.geojson'))).json()) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      sequences = fc.features
        .map(({ properties: p }) => p)
        .sort((a, b) => Number(a.orde) - Number(b.orde))
        .map((p) => ({
          id: String(p.id),
          rows: Number(p.filas),
          cols: Number(p.columnas),
          frames: p.fotogramas as string[],
          totals: p.totais as number[],
          unit: String(p.unidade),
          heights: (p.perfis as string[]).map(decodeHeights),
        }));
    }
  } catch {
    // Handled below.
  }
  if (sequences.length === 0) {
    box.hidden = true;
    return;
  }

  let seq = sequences[0] as Sequence;
  let pos = 0;
  let playing = !reducedMotion.matches;
  let last: number | null = null;
  let raf: number | null = null;

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const i = Math.min(seq.frames.length - 1, Math.floor(pos));
    const j = Math.min(seq.frames.length - 1, i + 1);
    const t = ease(pos - i);
    const a = seq.heights[i] as Uint8Array;
    const b = seq.heights[j] as Uint8Array;
    const left = w * 0.06;
    const right = w * 0.94;
    const top = h * 0.12;
    const bottom = h * 0.96;
    const step = (bottom - top) / seq.rows;
    const amp = step * 9;
    ctx.lineWidth = Math.max(0.8, w / 700);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#f2f0e8';
    for (let r = 0; r < seq.rows; r++) {
      const y = top + r * step;
      ctx.beginPath();
      for (let c = 0; c < seq.cols; c++) {
        const k = r * seq.cols + c;
        const v = (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t;
        const x = left + ((right - left) * c) / (seq.cols - 1);
        if (c) ctx.lineTo(x, y - (v / 255) * amp);
        else ctx.moveTo(x, y - (v / 255) * amp);
      }
      ctx.lineTo(right, y + 2);
      ctx.lineTo(left, y + 2);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();
      // Stroke only the profile, not the closing edges.
      ctx.beginPath();
      for (let c = 0; c < seq.cols; c++) {
        const k = r * seq.cols + c;
        const v = (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t;
        const x = left + ((right - left) * c) / (seq.cols - 1);
        if (c) ctx.lineTo(x, y - (v / 255) * amp);
        else ctx.moveTo(x, y - (v / 255) * amp);
      }
      ctx.stroke();
    }
    const shown = Math.round(pos) % seq.frames.length;
    frameEl.textContent = label(seq.frames[shown] as string);
    const unit = UNITS[seq.unit]?.[lang] ?? seq.unit;
    totalEl.textContent = `${nf.format(seq.totals[shown] ?? 0)} ${unit}`;
    range.value = String(pos);
  }

  function tick(now: number) {
    if (last !== null && playing) {
      pos += (now - last) / 1000 / (PACE[seq.id] ?? 1);
      // Hold the last frame a little, then start again.
      if (pos >= seq.frames.length - 1 + 0.8) pos = 0;
    }
    last = now;
    draw();
    raf = playing ? requestAnimationFrame(tick) : null;
  }

  function setPlaying(on: boolean) {
    playing = on;
    playBtn.textContent = dict[on ? 'pulse_pause' : 'pulse_play'] ?? '';
    playBtn.setAttribute('aria-pressed', String(!on));
    last = null;
    if (on && raf === null) raf = requestAnimationFrame(tick);
  }

  function choose(id: string) {
    seq = sequences.find((s) => s.id === id) ?? seq;
    pos = 0;
    range.max = String(seq.frames.length - 1);
    range.step = '0.01';
    textEl.textContent = dict[`lines_t_${seq.id}_text`] ?? '';
    for (const b of box.querySelectorAll<HTMLButtonElement>('[data-seq]')) {
      b.setAttribute('aria-pressed', String(b.dataset.seq === seq.id));
    }
    draw();
  }

  for (const b of box.querySelectorAll<HTMLButtonElement>('[data-seq]')) {
    b.hidden = !sequences.some((s) => s.id === b.dataset.seq);
    b.addEventListener('click', () => choose(b.dataset.seq ?? ''));
  }
  playBtn.addEventListener('click', () => setPlaying(!playing));
  range.addEventListener('input', () => {
    setPlaying(false);
    pos = Number(range.value);
    draw();
  });
  new ResizeObserver(() => draw()).observe(canvas);
  choose(seq.id);
  setPlaying(playing);
}
