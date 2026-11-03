// One "Galicia en liñas" poster as an SVG string, from the galicia-linas profiles: ROWS lines
// from north to south, each drawn over a black fill so it hides the lines behind it (the
// Unknown Pleasures look). The same string is shown on the page and downloaded.

export interface PosterData {
  id: string;
  rows: number;
  cols: number;
  /** ROWS × COLS heights, 0–255. */
  heights: Uint8Array;
  scale: 'raiz' | 'lineal';
  title: string;
  detail: string;
  credit: string;
}

export const WIDTH = 1200;
export const HEIGHT = 1500;
const LEFT = 170;
const RIGHT = 1030;
const TOP = 250;
const BOTTOM = 1290;
const INK = '#f2f0e8';
const FONT = "'Source Sans 3', Helvetica, Arial, sans-serif";

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `stride` > 1 skips samples and every other line (lighter thumbnails). */
export function posterSvg(p: PosterData, stride = 1): string {
  const step = (BOTTOM - TOP) / p.rows;
  const amp = step * (p.scale === 'lineal' ? 7 : 9);
  const parts: string[] = [];
  // Thumbnails keep one line in two: at that size 80 lines merge into a grey texture.
  for (let r = stride > 1 ? 1 : 0; r < p.rows; r += stride > 1 ? 2 : 1) {
    const y = TOP + r * step;
    let d = '';
    for (let c = 0; c < p.cols; c += stride) {
      const x = LEFT + ((RIGHT - LEFT) * c) / (p.cols - 1);
      const h = ((p.heights[r * p.cols + c] as number) / 255) * amp;
      d += `${c ? 'L' : 'M'}${x.toFixed(1)} ${(y - h).toFixed(1)}`;
    }
    d += `L${RIGHT} ${(y - ((p.heights[r * p.cols + p.cols - 1] as number) / 255) * amp).toFixed(1)}`;
    parts.push(
      `<path d="${d}L${RIGHT} ${y + 2}L${LEFT} ${y + 2}Z" fill="#000"/>`,
      // Thumbnails get a heavier line, or the thin one turns into moiré.
      `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${stride > 1 ? 3 : 1.4}" stroke-linejoin="round"/>`,
    );
  }
  const text = (y: number, size: number, colour: string, spacing: number, s: string) =>
    `<text x="${WIDTH / 2}" y="${y}" fill="${colour}" font-family="${FONT}" font-size="${size}" letter-spacing="${spacing}" text-anchor="middle">${esc(s)}</text>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#000"/>`,
    ...parts,
    text(1385, 32, INK, 14, 'GALICIA'),
    text(1426, 19, INK, 5, p.title.toUpperCase()),
    text(1456, 14, '#9a988f', 3, p.detail.toUpperCase()),
    text(1484, 11, '#6b6a63', 1, p.credit),
    '</svg>',
  ].join('');
}

/** Base64 → bytes (browser). */
export function decodeHeights(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
