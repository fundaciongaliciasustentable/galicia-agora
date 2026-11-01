// Minimal Cloud Optimized GeoTIFF reader over HTTP Range requests, enough for
// the Sentinel-2 L2A COGs on AWS (sentinel-cogs): tiled, one sample per pixel,
// 8/16-bit unsigned, Deflate (or none), optional horizontal predictor, with
// reduced-resolution overviews. Reads windows from any level, fetching only
// the tiles it needs and merging neighbouring byte ranges into one request.
//
// Hand-rolled (like the PMTiles writer in lib/raster.ts) so the pipeline needs
// neither GDAL nor a new dependency; anything it does not handle throws, and
// the caller skips that scene.

import { inflateSync } from 'node:zlib';

/** Fetch bytes [start, end] (inclusive) of a URL. */
export type RangeGet = (url: string, start: number, end: number) => Promise<Buffer>;

export interface CogLevel {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  bitsPerSample: number;
  compression: number;
  predictor: number;
  offsets: number[];
  byteCounts: number[];
}

export interface Cog {
  url: string;
  /** Level 0 is full resolution; the rest are overviews, largest first. */
  levels: CogLevel[];
  /** Upper-left corner of the full-resolution grid, in the file's CRS (metres). */
  originX: number;
  originY: number;
  /** Full-resolution pixel size (metres). */
  pixelSize: number;
}

const TAG = {
  NewSubfileType: 254,
  ImageWidth: 256,
  ImageLength: 257,
  BitsPerSample: 258,
  Compression: 259,
  SamplesPerPixel: 277,
  PlanarConfiguration: 284,
  Predictor: 317,
  TileWidth: 322,
  TileLength: 323,
  TileOffsets: 324,
  TileByteCounts: 325,
  SampleFormat: 339,
  ModelPixelScale: 33550,
  ModelTiepoint: 33922,
} as const;

// TIFF field types → byte size.
const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
  16: 8,
  17: 8,
  18: 8,
};

/** Thrown while parsing when the header buffer is too short; holds the length needed. */
class NeedMore extends Error {
  constructor(readonly bytes: number) {
    super(`need ${bytes} bytes of header`);
  }
}

type Tags = Map<number, number[]>;

/** Parse every IFD of a (Big)TIFF from the start of the file. */
export function parseTiff(buf: Buffer): Tags[] {
  const need = (end: number) => {
    if (end > buf.length) throw new NeedMore(end);
  };
  need(16);
  const le = buf.toString('latin1', 0, 2) === 'II';
  if (!le && buf.toString('latin1', 0, 2) !== 'MM') throw new Error('not a TIFF');
  const u16 = (p: number) => {
    need(p + 2);
    return le ? buf.readUInt16LE(p) : buf.readUInt16BE(p);
  };
  const u32 = (p: number) => {
    need(p + 4);
    return le ? buf.readUInt32LE(p) : buf.readUInt32BE(p);
  };
  const u64 = (p: number) => {
    need(p + 8);
    return Number(le ? buf.readBigUInt64LE(p) : buf.readBigUInt64BE(p));
  };
  const f64 = (p: number) => {
    need(p + 8);
    return le ? buf.readDoubleLE(p) : buf.readDoubleBE(p);
  };
  const magic = u16(2);
  const big = magic === 43;
  if (!big && magic !== 42) throw new Error(`unexpected TIFF magic ${magic}`);

  const read = (type: number, p: number): number => {
    switch (type) {
      case 1:
      case 2:
      case 6:
      case 7:
        need(p + 1);
        return buf[p] ?? 0;
      case 3:
      case 8:
        return u16(p);
      case 4:
      case 9:
        return u32(p);
      case 12:
        return f64(p);
      case 16:
      case 17:
        return u64(p);
      default:
        throw new Error(`unsupported TIFF field type ${type}`);
    }
  };

  const ifds: Tags[] = [];
  let next = big ? u64(8) : u32(4);
  while (next) {
    const tags: Tags = new Map();
    const count = big ? u64(next) : u16(next);
    const entrySize = big ? 20 : 12;
    const first = next + (big ? 8 : 2);
    for (let i = 0; i < count; i++) {
      const e = first + i * entrySize;
      const tag = u16(e);
      const type = u16(e + 2);
      const n = big ? u64(e + 4) : u32(e + 4);
      const size = TYPE_SIZE[type];
      if (!size) continue; // unknown type: skip the tag
      const inline = size * n <= (big ? 8 : 4);
      const at = inline ? e + (big ? 12 : 8) : big ? u64(e + 12) : u32(e + 8);
      // Only numeric tags are needed; ASCII and others are skipped.
      if (type === 2) continue;
      const values: number[] = [];
      for (let k = 0; k < n; k++) values.push(read(type, at + k * size));
      tags.set(tag, values);
    }
    ifds.push(tags);
    const after = first + count * entrySize;
    next = big ? u64(after) : u32(after);
  }
  return ifds;
}

function one(tags: Tags, tag: number, fallback?: number): number {
  const v = tags.get(tag)?.[0] ?? fallback;
  if (v === undefined) throw new Error(`TIFF tag ${tag} missing`);
  return v;
}

/** Build the level list and georeferencing from parsed IFDs (masks are skipped). */
export function cogFromTags(url: string, ifds: Tags[]): Cog {
  const levels: CogLevel[] = [];
  for (const t of ifds) {
    // Bit 2 of NewSubfileType marks a transparency mask; skip those.
    if ((one(t, TAG.NewSubfileType, 0) & 4) !== 0) continue;
    if (one(t, TAG.SamplesPerPixel, 1) !== 1) throw new Error('only single-band COGs');
    if (one(t, TAG.SampleFormat, 1) !== 1) throw new Error('only unsigned integer COGs');
    const bits = one(t, TAG.BitsPerSample);
    if (bits !== 8 && bits !== 16) throw new Error(`unsupported bit depth ${bits}`);
    if (!t.has(TAG.TileWidth)) throw new Error('only tiled TIFFs');
    levels.push({
      width: one(t, TAG.ImageWidth),
      height: one(t, TAG.ImageLength),
      tileWidth: one(t, TAG.TileWidth),
      tileHeight: one(t, TAG.TileLength),
      bitsPerSample: bits,
      compression: one(t, TAG.Compression, 1),
      predictor: one(t, TAG.Predictor, 1),
      offsets: t.get(TAG.TileOffsets) ?? [],
      byteCounts: t.get(TAG.TileByteCounts) ?? [],
    });
  }
  const first = ifds[0];
  if (!first || levels.length === 0) throw new Error('TIFF without images');
  const scale = first.get(TAG.ModelPixelScale);
  const tie = first.get(TAG.ModelTiepoint);
  if (!scale || !tie || tie.length < 6) throw new Error('TIFF without georeferencing');
  // Tiepoint (i, j, k, x, y, z): raster (i, j) maps to model (x, y).
  const pixelSize = scale[0] ?? 0;
  return {
    url,
    levels,
    originX: (tie[3] ?? 0) - (tie[0] ?? 0) * pixelSize,
    originY: (tie[4] ?? 0) + (tie[1] ?? 0) * (scale[1] ?? pixelSize),
    pixelSize,
  };
}

/** Open a COG: read the header (growing the request until every IFD fits). */
export async function openCog(url: string, get: RangeGet, firstBytes = 65_536): Promise<Cog> {
  let size = firstBytes;
  for (let tries = 0; tries < 6; tries++) {
    const buf = await get(url, 0, size - 1);
    try {
      return cogFromTags(url, parseTiff(buf));
    } catch (err) {
      if (!(err instanceof NeedMore)) throw err;
      // A short reply means the whole file is shorter than asked: nothing more to fetch.
      if (buf.length < size) throw new Error(`truncated TIFF header in ${url}`);
      size = Math.max(err.bytes + 4096, size * 2);
    }
  }
  throw new Error(`TIFF header too large in ${url}`);
}

/** The level whose pixel size is closest to `metres` without being coarser, if possible. */
export function levelFor(cog: Cog, metres: number): number {
  let best = 0;
  for (let i = 0; i < cog.levels.length; i++) {
    const lv = cog.levels[i] as CogLevel;
    const size = cog.pixelSize * ((cog.levels[0] as CogLevel).width / lv.width);
    if (size <= metres * 1.01) best = i;
  }
  return best;
}

/** Undo the horizontal-differencing predictor (TIFF predictor 2), in place. */
export function unpredict(data: Uint8Array | Uint16Array, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 1; x < width; x++) {
      data[row + x] =
        ((data[row + x] as number) + (data[row + x - 1] as number)) &
        (data instanceof Uint16Array ? 0xffff : 0xff);
    }
  }
}

/** Decode one tile's bytes into samples (tileWidth × tileHeight). */
export function decodeTile(level: CogLevel, bytes: Buffer): Uint8Array | Uint16Array {
  let raw: Buffer;
  if (level.compression === 1) raw = bytes;
  else if (level.compression === 8 || level.compression === 32946) raw = inflateSync(bytes);
  else throw new Error(`unsupported TIFF compression ${level.compression}`);
  const n = level.tileWidth * level.tileHeight;
  let out: Uint8Array | Uint16Array;
  if (level.bitsPerSample === 8) {
    out = new Uint8Array(n);
    out.set(raw.subarray(0, n));
  } else {
    out = new Uint16Array(n);
    // Sentinel COGs are little-endian; copy through a DataView to stay alignment-safe.
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const m = Math.min(n, raw.length >> 1);
    for (let i = 0; i < m; i++) out[i] = dv.getUint16(i * 2, true);
  }
  if (level.predictor === 2) unpredict(out, level.tileWidth, level.tileHeight);
  else if (level.predictor !== 1) throw new Error(`unsupported TIFF predictor ${level.predictor}`);
  return out;
}

/** Group byte ranges that are close together so one request fetches several tiles. */
export function mergeRanges(
  ranges: Array<{ offset: number; length: number }>,
  maxGap = 65_536,
  maxSpan = 16 * 1024 * 1024,
): Array<{ start: number; end: number }> {
  const sorted = ranges.filter((r) => r.length > 0).sort((a, b) => a.offset - b.offset);
  const out: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    const end = r.offset + r.length - 1;
    if (last && r.offset - last.end - 1 <= maxGap && end - last.start < maxSpan) {
      last.end = Math.max(last.end, end);
    } else out.push({ start: r.offset, end });
  }
  return out;
}

/**
 * Read a window [x0, x0 + w) × [y0, y0 + h) of one level into a new array
 * (pixels outside the image stay 0, which is nodata in Sentinel-2 COGs).
 */
export async function readWindow(
  cog: Cog,
  levelIndex: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  get: RangeGet,
): Promise<Uint8Array | Uint16Array> {
  const lv = cog.levels[levelIndex];
  if (!lv) throw new Error(`no level ${levelIndex}`);
  const out = lv.bitsPerSample === 8 ? new Uint8Array(w * h) : new Uint16Array(w * h);
  const across = Math.ceil(lv.width / lv.tileWidth);
  const tx0 = Math.max(0, Math.floor(x0 / lv.tileWidth));
  const ty0 = Math.max(0, Math.floor(y0 / lv.tileHeight));
  const tx1 = Math.min(across - 1, Math.floor((x0 + w - 1) / lv.tileWidth));
  const ty1 = Math.min(
    Math.ceil(lv.height / lv.tileHeight) - 1,
    Math.floor((y0 + h - 1) / lv.tileHeight),
  );
  const wanted: Array<{ tx: number; ty: number; offset: number; length: number }> = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * across + tx;
      wanted.push({ tx, ty, offset: lv.offsets[i] ?? 0, length: lv.byteCounts[i] ?? 0 });
    }
  }
  for (const r of mergeRanges(wanted)) {
    const bytes = await get(cog.url, r.start, r.end);
    for (const t of wanted) {
      if (t.length === 0 || t.offset < r.start || t.offset + t.length - 1 > r.end) continue;
      const tile = decodeTile(
        lv,
        bytes.subarray(t.offset - r.start, t.offset - r.start + t.length),
      );
      // Copy the overlap of this tile with the window.
      const gx0 = t.tx * lv.tileWidth;
      const gy0 = t.ty * lv.tileHeight;
      const ax = Math.max(x0, gx0);
      const bx = Math.min(x0 + w, gx0 + lv.tileWidth, lv.width);
      const ay = Math.max(y0, gy0);
      const by = Math.min(y0 + h, gy0 + lv.tileHeight, lv.height);
      for (let y = ay; y < by; y++) {
        const src = (y - gy0) * lv.tileWidth + (ax - gx0);
        out.set(tile.subarray(src, src + (bx - ax)), (y - y0) * w + (ax - x0));
      }
    }
  }
  return out;
}
