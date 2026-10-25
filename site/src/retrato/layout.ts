// Pure geometry for the concello portrait: the same 313 dots laid out as a map (each concello
// at its representative point) or as a distribution strip (a beeswarm along the indicator's
// value). The page animates between the two layouts; nothing here touches the DOM.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Pos {
  x: number;
  y: number;
}

const RAD = Math.PI / 180;

/**
 * Equirectangular projection fitted to a box, with the horizontal scale shrunk by cos(lat)
 * at the centre (good enough at Galicia's size; no projection library needed).
 */
export function fitGeo(
  points: Array<[number, number]>,
  box: Box,
): (lon: number, lat: number) => Pos {
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...lons), Math.max(...lons)];
  const [y0, y1] = [Math.min(...lats), Math.max(...lats)];
  const k = Math.cos(((y0 + y1) / 2) * RAD);
  const w = (x1 - x0) * k || 1;
  const h = y1 - y0 || 1;
  const s = Math.min(box.width / w, box.height / h);
  const ox = box.x + (box.width - w * s) / 2;
  const oy = box.y + (box.height - h * s) / 2;
  return (lon, lat) => ({ x: ox + (lon - x0) * k * s, y: oy + (y1 - lat) * s });
}

export interface Scale {
  (v: number): number;
  domain: [number, number];
  kind: 'linear' | 'log' | 'sqrt';
}

/**
 * Value scale for the strip, so one city or a long tail does not squeeze the rest:
 * - log when every value is positive and they span more than twenty-fold (density);
 * - square root when values start at 0 and the maximum is over ten times the median
 *   (tourist dwellings: many concellos with none, a few coastal ones with very many);
 * - linear otherwise.
 */
export function valueScale(values: number[], x0: number, x1: number): Scale {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] ?? 0;
  const kind: Scale['kind'] =
    min > 0 && max / min > 20 ? 'log' : min >= 0 && max > 10 * median ? 'sqrt' : 'linear';
  const t = kind === 'log' ? Math.log : kind === 'sqrt' ? Math.sqrt : (v: number) => v;
  const [a, b] = [t(min), t(max)];
  const span = b - a || 1;
  const f = ((v: number) => x0 + ((t(v) - a) / span) * (x1 - x0)) as Scale;
  f.domain = [min, max];
  f.kind = kind;
  return f;
}

/**
 * Beeswarm: dots keep their x and get the smallest vertical offset from the centre line
 * that does not overlap a dot already placed. Dots are placed in x order, so the result is
 * stable for the same input. Returns y offsets (centre = 0) in input order.
 */
export function beeswarm(xs: number[], radius: number): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x || a.i - b.i);
  const d = radius * 2;
  const placed: Array<{ x: number; y: number }> = [];
  const out = new Array<number>(xs.length).fill(0);
  let start = 0;
  for (const { x, i } of order) {
    while (start < placed.length && (placed[start] as { x: number }).x < x - d) start++;
    const near = placed.slice(start);
    // Candidate offsets: 0, then just above or below each nearby dot; take the smallest free one.
    const candidates = [0];
    for (const p of near) {
      const dy = Math.sqrt(Math.max(0, d * d - (p.x - x) ** 2));
      candidates.push(p.y + dy, p.y - dy);
    }
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    const free = (y: number) => near.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 >= d * d - 1e-6);
    const y = candidates.find(free) ?? 0;
    placed.push({ x, y });
    out[i] = y;
  }
  return out;
}

/**
 * Where a value sits among the others, in neutral words: the share of concellos below it
 * (or above it, when it is in the lower half). Never a rank of better or worse.
 */
export function position(
  value: number,
  values: number[],
): { side: 'above' | 'below' | 'middle'; pct: number } {
  const others = values.length - 1;
  if (others <= 0) return { side: 'middle', pct: 0 };
  const lower = values.filter((v) => v < value).length;
  const higher = values.filter((v) => v > value).length;
  if (lower === higher) return { side: 'middle', pct: 50 };
  return lower > higher
    ? { side: 'above', pct: Math.round((lower / others) * 100) }
    : { side: 'below', pct: Math.round((higher / others) * 100) };
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
