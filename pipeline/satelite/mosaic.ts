// Web Mercator mosaic of Galicia: a pixel canvas at the finest zoom, the
// Galicia mask (IGN outline), resampling of each UTM composite into the
// canvas, halving for coarser zooms, and cutting 256 px tiles.
//
// Pixels are addressed in global pixel coordinates of a zoom level
// (0 … 256·2^z, top-left origin, as XYZ tiles).

import { lonLatToUtm, utmToLonLat } from '../lib/utm.ts';

export const TILE = 256;

export function lonToPx(lon: number, z: number): number {
  return ((lon + 180) / 360) * TILE * 2 ** z;
}

export function latToPx(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** z;
}

export function pxToLon(x: number, z: number): number {
  return (x / (TILE * 2 ** z)) * 360 - 180;
}

export function pxToLat(y: number, z: number): number {
  const n = Math.PI * (1 - (2 * y) / (TILE * 2 ** z));
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** RGBA true colour plus an NDVI byte per pixel (alpha shared: 0 = no data). */
export interface Canvas {
  z: number;
  /** Global pixel of the canvas's top-left corner. */
  x0: number;
  y0: number;
  width: number;
  height: number;
  rgba: Uint8Array;
  ndvi: Uint8Array;
}

export function createCanvas(
  z: number,
  x0: number,
  y0: number,
  width: number,
  height: number,
): Canvas {
  return {
    z,
    x0,
    y0,
    width,
    height,
    rgba: new Uint8Array(width * height * 4),
    ndvi: new Uint8Array(width * height),
  };
}

/** Canvas covering a lon/lat box at zoom z (whole pixels). */
export function canvasForBounds(
  b: { west: number; south: number; east: number; north: number },
  z: number,
): Canvas {
  const x0 = Math.floor(lonToPx(b.west, z));
  const y0 = Math.floor(latToPx(b.north, z));
  const x1 = Math.ceil(lonToPx(b.east, z));
  const y1 = Math.ceil(latToPx(b.south, z));
  return createCanvas(z, x0, y0, x1 - x0, y1 - y0);
}

type Ring = number[][];
type PolygonCoords = Ring[];

/**
 * Rasterise polygons into a mask the size of the canvas (1 inside). A pixel is
 * inside when its centre is (even-odd rule per polygon, so holes stay out).
 */
export function rasterizeMask(
  polygons: PolygonCoords[],
  c: Pick<Canvas, 'z' | 'x0' | 'y0' | 'width' | 'height'>,
): Uint8Array {
  const mask = new Uint8Array(c.width * c.height);
  for (const poly of polygons) {
    const rings = poly.map((ring) =>
      ring.map(
        ([lon, lat]) =>
          [lonToPx(lon as number, c.z) - c.x0, latToPx(lat as number, c.z) - c.y0] as const,
      ),
    );
    let ymin = Number.POSITIVE_INFINITY;
    let ymax = Number.NEGATIVE_INFINITY;
    for (const r of rings)
      for (const [, y] of r) [ymin, ymax] = [Math.min(ymin, y), Math.max(ymax, y)];
    const row0 = Math.max(0, Math.floor(ymin));
    const row1 = Math.min(c.height - 1, Math.ceil(ymax));
    const xs: number[] = [];
    for (let row = row0; row <= row1; row++) {
      const yc = row + 0.5;
      xs.length = 0;
      for (const r of rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, yi] = r[i] as readonly [number, number];
          const [xj, yj] = r[j] as readonly [number, number];
          if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) / (yj - yi)) * (xj - xi));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil((xs[k] as number) - 0.5));
        const b = Math.min(c.width - 1, Math.floor((xs[k + 1] as number) - 0.5));
        if (b >= a) mask.fill(1, row * c.width + a, row * c.width + b + 1);
      }
    }
  }
  return mask;
}

/** Bounding box of polygons in lon/lat. */
export function boundsOf(polygons: PolygonCoords[]) {
  const b = { west: 180, south: 90, east: -180, north: -90 };
  for (const p of polygons)
    for (const r of p)
      for (const [lon, lat] of r) {
        b.west = Math.min(b.west, lon as number);
        b.east = Math.max(b.east, lon as number);
        b.south = Math.min(b.south, lat as number);
        b.north = Math.max(b.north, lat as number);
      }
  return b;
}

/** A composite on a UTM grid (north-up, square pixels). */
export interface UtmImage {
  zone: number;
  /** Upper-left corner (m). */
  originX: number;
  originY: number;
  pixelSize: number;
  width: number;
  height: number;
  /** RGB (stretched) and NDVI code per pixel; alpha 0 = no data. */
  rgb: Uint8Array;
  ndvi: Uint8Array;
  alpha: Uint8Array;
}

/** Lon/lat box of a UTM image (its corners and edge midpoints), for clipping the canvas loop. */
export function utmImageBounds(img: UtmImage) {
  const pts: Array<[number, number]> = [];
  for (const fx of [0, 0.5, 1])
    for (const fy of [0, 0.5, 1])
      pts.push([
        img.originX + fx * img.width * img.pixelSize,
        img.originY - fy * img.height * img.pixelSize,
      ]);
  const ll = pts.map(([e, n]) => utmToLonLat(e, n, img.zone));
  return {
    west: Math.min(...ll.map((p) => p[0])),
    east: Math.max(...ll.map((p) => p[0])),
    south: Math.min(...ll.map((p) => p[1])),
    north: Math.max(...ll.map((p) => p[1])),
  };
}

/**
 * Resample a UTM image into the canvas inside the mask, filling only pixels
 * still empty (so the first image wins where MGRS tiles overlap). Bilinear
 * where the four neighbours have data, nearest otherwise. The UTM position is
 * computed exactly every STEP pixels along a row and interpolated between.
 * Returns the number of pixels written.
 */
export function splat(canvas: Canvas, mask: Uint8Array, img: UtmImage, STEP = 16): number {
  const b = utmImageBounds(img);
  const z = canvas.z;
  const cx0 = Math.max(0, Math.floor(lonToPx(b.west, z)) - canvas.x0);
  const cx1 = Math.min(canvas.width - 1, Math.ceil(lonToPx(b.east, z)) - canvas.x0);
  const cy0 = Math.max(0, Math.floor(latToPx(b.north, z)) - canvas.y0);
  const cy1 = Math.min(canvas.height - 1, Math.ceil(latToPx(b.south, z)) - canvas.y0);
  let written = 0;
  const W = img.width;
  const H = img.height;
  const inv = 1 / img.pixelSize;
  for (let cy = cy0; cy <= cy1; cy++) {
    const lat = pxToLat(canvas.y0 + cy + 0.5, z);
    let ax = 0;
    let ay = 0;
    let bx = 0;
    let by = 0;
    let segStart = -1;
    for (let cx = cx0; cx <= cx1; cx++) {
      const ci = cy * canvas.width + cx;
      if (mask[ci] === 0 || (canvas.rgba[ci * 4 + 3] as number) > 0) continue;
      // Exact projection at the start and end of each STEP segment.
      const seg = cx0 + Math.floor((cx - cx0) / STEP) * STEP;
      if (seg !== segStart) {
        segStart = seg;
        const segEnd = seg + STEP;
        [ax, ay] = lonLatToUtm(pxToLon(canvas.x0 + seg + 0.5, z), lat, img.zone);
        [bx, by] = lonLatToUtm(pxToLon(canvas.x0 + segEnd + 0.5, z), lat, img.zone);
      }
      const t = (cx - segStart) / STEP;
      const e = ax + t * (bx - ax);
      const n = ay + t * (by - ay);
      // Continuous pixel coordinates with pixel centres at integer + 0.5.
      const fx = (e - img.originX) * inv - 0.5;
      const fy = (img.originY - n) * inv - 0.5;
      if (fx < -0.5 || fy < -0.5 || fx > W - 0.5 || fy > H - 0.5) continue;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const dx = fx - x0;
      const dy = fy - y0;
      const i00 = y0 * W + x0;
      const inside = x0 >= 0 && y0 >= 0 && x0 + 1 < W && y0 + 1 < H;
      if (
        inside &&
        img.alpha[i00] &&
        img.alpha[i00 + 1] &&
        img.alpha[i00 + W] &&
        img.alpha[i00 + W + 1]
      ) {
        const w00 = (1 - dx) * (1 - dy);
        const w10 = dx * (1 - dy);
        const w01 = (1 - dx) * dy;
        const w11 = dx * dy;
        for (let k = 0; k < 3; k++) {
          canvas.rgba[ci * 4 + k] = Math.round(
            (img.rgb[i00 * 3 + k] as number) * w00 +
              (img.rgb[(i00 + 1) * 3 + k] as number) * w10 +
              (img.rgb[(i00 + W) * 3 + k] as number) * w01 +
              (img.rgb[(i00 + W + 1) * 3 + k] as number) * w11,
          );
        }
        canvas.ndvi[ci] = Math.round(
          (img.ndvi[i00] as number) * w00 +
            (img.ndvi[i00 + 1] as number) * w10 +
            (img.ndvi[i00 + W] as number) * w01 +
            (img.ndvi[i00 + W + 1] as number) * w11,
        );
      } else {
        const nx = Math.min(W - 1, Math.max(0, Math.round(fx)));
        const ny = Math.min(H - 1, Math.max(0, Math.round(fy)));
        const ni = ny * W + nx;
        if (!img.alpha[ni]) continue;
        for (let k = 0; k < 3; k++) canvas.rgba[ci * 4 + k] = img.rgb[ni * 3 + k] as number;
        canvas.ndvi[ci] = img.ndvi[ni] as number;
      }
      canvas.rgba[ci * 4 + 3] = 255;
      written++;
    }
  }
  return written;
}

/**
 * Half-resolution canvas (zoom z − 1): each pixel averages its up to four
 * children, weighted by their alpha; alpha becomes the covered share, so
 * coastlines stay smooth.
 */
export function halve(c: Canvas): Canvas {
  const x0 = Math.floor(c.x0 / 2);
  const y0 = Math.floor(c.y0 / 2);
  const out = createCanvas(
    c.z - 1,
    x0,
    y0,
    Math.ceil((c.x0 + c.width) / 2) - x0,
    Math.ceil((c.y0 + c.height) / 2) - y0,
  );
  for (let oy = 0; oy < out.height; oy++) {
    for (let ox = 0; ox < out.width; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let nd = 0;
      let a = 0;
      for (let k = 0; k < 4; k++) {
        const sx = (x0 + ox) * 2 + (k & 1) - c.x0;
        const sy = (y0 + oy) * 2 + (k >> 1) - c.y0;
        if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) continue;
        const si = sy * c.width + sx;
        const w = c.rgba[si * 4 + 3] as number;
        if (!w) continue;
        r += (c.rgba[si * 4] as number) * w;
        g += (c.rgba[si * 4 + 1] as number) * w;
        b += (c.rgba[si * 4 + 2] as number) * w;
        nd += (c.ndvi[si] as number) * w;
        a += w;
      }
      if (!a) continue;
      const oi = oy * out.width + ox;
      out.rgba[oi * 4] = Math.round(r / a);
      out.rgba[oi * 4 + 1] = Math.round(g / a);
      out.rgba[oi * 4 + 2] = Math.round(b / a);
      out.rgba[oi * 4 + 3] = Math.round(a / 4);
      out.ndvi[oi] = Math.round(nd / a);
    }
  }
  return out;
}

/** Tiles of zoom c.z that overlap the canvas. */
export function canvasTiles(c: Canvas): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let ty = Math.floor(c.y0 / TILE); ty <= Math.floor((c.y0 + c.height - 1) / TILE); ty++)
    for (let tx = Math.floor(c.x0 / TILE); tx <= Math.floor((c.x0 + c.width - 1) / TILE); tx++)
      out.push({ x: tx, y: ty });
  return out;
}

/**
 * Cut one 256 × 256 tile as RGBA, true colour or NDVI painted through a
 * lookup table (3 bytes per code). Null when every pixel is transparent.
 */
export function cutTile(
  c: Canvas,
  tx: number,
  ty: number,
  ndviLut?: Uint8Array,
): Uint8Array | null {
  const out = new Uint8Array(TILE * TILE * 4);
  let any = false;
  for (let y = 0; y < TILE; y++) {
    const sy = ty * TILE + y - c.y0;
    if (sy < 0 || sy >= c.height) continue;
    for (let x = 0; x < TILE; x++) {
      const sx = tx * TILE + x - c.x0;
      if (sx < 0 || sx >= c.width) continue;
      const si = sy * c.width + sx;
      const a = c.rgba[si * 4 + 3] as number;
      if (!a) continue;
      any = true;
      const oi = (y * TILE + x) * 4;
      if (ndviLut) {
        const code = c.ndvi[si] as number;
        out[oi] = ndviLut[code * 3] as number;
        out[oi + 1] = ndviLut[code * 3 + 1] as number;
        out[oi + 2] = ndviLut[code * 3 + 2] as number;
      } else {
        out[oi] = c.rgba[si * 4] as number;
        out[oi + 1] = c.rgba[si * 4 + 1] as number;
        out[oi + 2] = c.rgba[si * 4 + 2] as number;
      }
      out[oi + 3] = a;
    }
  }
  return any ? out : null;
}
