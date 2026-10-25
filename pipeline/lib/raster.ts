// Raster layers: fetch a WMTS (GoogleMapsCompatible, PNG) over a bounding
// box, drop fully transparent tiles and pack the rest into one PMTiles v3
// archive. Hand-rolled writer (header + gzip directories + raw PNG tiles) so
// the ingest needs neither the pmtiles CLI nor a new dependency.
//
// Output is deterministic: same tiles in, same bytes out, so an unchanged
// source yields the same checksum (and the same git blob on the data branch).

import { createHash } from 'node:crypto';
import { gzipSync, inflateSync } from 'node:zlib';
import { zxyToTileId } from 'pmtiles';
import type { AdapterContext } from './adapter.ts';
import { HttpError } from './http.ts';

export interface RasterNormalized {
  /** The PMTiles archive. */
  archive: Buffer;
  /** Non-empty tiles in the archive (stored as feature_count in meta.json). */
  tileCount: number;
  /** Publication time reported by the source (ISO 8601), or null. */
  publishedAt: string | null;
}

/** Adapter for `geometry: raster` + `output: pmtiles` layers (see ingest.ts). */
export interface RasterAdapter<Raw = unknown> {
  kind: 'raster';
  fetch(ctx: AdapterContext): Promise<Raw>;
  normalize(raw: Raw, ctx: AdapterContext): RasterNormalized | Promise<RasterNormalized>;
}

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Tile {
  z: number;
  x: number;
  y: number;
}

// ── Tile grid (Web Mercator, top-left origin, as WMTS GoogleMapsCompatible) ──

export function lonToX(lon: number, z: number): number {
  const n = 2 ** z;
  return Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
}

export function latToY(lat: number, z: number): number {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return Math.min(n - 1, Math.max(0, y));
}

/** Every tile touching the bbox, for each zoom from minzoom to maxzoom. */
export function tilesInBbox(bbox: Bbox, minzoom: number, maxzoom: number): Tile[] {
  const out: Tile[] = [];
  for (let z = minzoom; z <= maxzoom; z++) {
    const [x0, x1] = [lonToX(bbox.west, z), lonToX(bbox.east, z)];
    const [y0, y1] = [latToY(bbox.north, z), latToY(bbox.south, z)];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}

// ── PNG transparency check ──

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * True when every pixel of a PNG is fully transparent. Conservative: any
 * format it does not handle (interlaced, no alpha, unknown) counts as not
 * transparent, so the tile is kept.
 */
export function isTransparentPng(buf: Buffer): boolean {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return false;
  let width = 0;
  let height = 0;
  let depth = 0;
  let color = -1;
  let interlace = 0;
  let trns: Buffer | null = null;
  let paletteSize = 0;
  const idat: Buffer[] = [];
  for (let p = 8; p + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8] ?? 0;
      color = data[9] ?? -1;
      interlace = data[12] ?? 0;
    } else if (type === 'PLTE') paletteSize = len / 3;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!width || !height || interlace !== 0 || idat.length === 0) return false;

  let channels: number;
  let alphaOf: (row: Buffer, i: number) => number;
  if (color === 6 || color === 4) {
    // RGBA or grey+alpha: alpha is the last sample of each pixel.
    if (depth !== 8 && depth !== 16) return false;
    channels = color === 6 ? 4 : 2;
    const bpp = (channels * depth) / 8;
    const off = bpp - depth / 8;
    alphaOf =
      depth === 8 ? (r, i) => r[i * bpp + off] ?? 255 : (r, i) => r.readUInt16BE(i * bpp + off);
  } else if (color === 3) {
    // Palette: transparent only through tRNS (missing entries are opaque).
    if (!trns || ![1, 2, 4, 8].includes(depth)) return false;
    const alpha = trns;
    channels = 1;
    const perByte = 8 / depth;
    const mask = (1 << depth) - 1;
    alphaOf = (r, i) => {
      const byte = r[Math.floor(i / perByte)] ?? 0;
      const idx = (byte >> (8 - depth * ((i % perByte) + 1))) & mask;
      return idx < paletteSize ? (alpha[idx] ?? 255) : 255;
    };
  } else {
    return false;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil((width * channels * depth) / 8);
  const fb = Math.max(1, (channels * depth) / 8);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const row = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    if (row.length < stride) return false;
    for (let i = 0; i < stride; i++) {
      const a = i >= fb ? (row[i - fb] ?? 0) : 0;
      const b = prev[i] ?? 0;
      const c = i >= fb ? (prev[i - fb] ?? 0) : 0;
      const v = row[i] ?? 0;
      if (filter === 1) row[i] = (v + a) & 0xff;
      else if (filter === 2) row[i] = (v + b) & 0xff;
      else if (filter === 3) row[i] = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        row[i] = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else if (filter !== 0) return false;
    }
    for (let x = 0; x < width; x++) if (alphaOf(row, x) !== 0) return false;
    prev = row;
  }
  return true;
}

// ── PMTiles v3 writer ──

export interface PmtilesMeta {
  name: string;
  attribution: string;
  description?: string;
  bounds: Bbox;
  minzoom: number;
  maxzoom: number;
}

interface Entry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

const HEADER_BYTES = 127;
const ROOT_MAX_BYTES = 16_384 - HEADER_BYTES;

function varint(n: number, out: number[]) {
  let v = n;
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

function serializeDirectory(entries: Entry[]): Buffer {
  const out: number[] = [];
  varint(entries.length, out);
  let last = 0;
  for (const e of entries) {
    varint(e.tileId - last, out);
    last = e.tileId;
  }
  for (const e of entries) varint(e.runLength, out);
  for (const e of entries) varint(e.length, out);
  entries.forEach((e, i) => {
    const p = entries[i - 1];
    varint(p && e.offset === p.offset + p.length ? 0 : e.offset + 1, out);
  });
  return gzipSync(Buffer.from(out));
}

/** Root directory, plus leaf directories when the root would not fit in 16 KiB. */
function buildDirectories(entries: Entry[]): { root: Buffer; leaves: Buffer } {
  const root = serializeDirectory(entries);
  if (root.length <= ROOT_MAX_BYTES) return { root, leaves: Buffer.alloc(0) };
  for (let leafSize = 4096; ; leafSize = Math.ceil(leafSize * 1.2)) {
    const leafBufs: Buffer[] = [];
    const rootEntries: Entry[] = [];
    let offset = 0;
    for (let i = 0; i < entries.length; i += leafSize) {
      const chunk = entries.slice(i, i + leafSize);
      const leaf = serializeDirectory(chunk);
      rootEntries.push({
        tileId: chunk[0]?.tileId ?? 0,
        offset,
        length: leaf.length,
        runLength: 0,
      });
      leafBufs.push(leaf);
      offset += leaf.length;
    }
    const r = serializeDirectory(rootEntries);
    if (r.length <= ROOT_MAX_BYTES) return { root: r, leaves: Buffer.concat(leafBufs) };
  }
}

/**
 * Pack PNG tiles into a PMTiles v3 archive. Identical tiles are stored once
 * (consecutive ones as a run). Tiles are written in tile-id order (clustered).
 */
export function writePmtiles(tiles: Array<Tile & { data: Buffer }>, meta: PmtilesMeta): Buffer {
  const sorted = tiles
    .map((t) => ({ ...t, tileId: zxyToTileId(t.z, t.x, t.y) }))
    .sort((a, b) => a.tileId - b.tileId);

  const entries: Entry[] = [];
  const chunks: Buffer[] = [];
  const seen = new Map<string, { offset: number; length: number }>();
  let dataLength = 0;
  for (const t of sorted) {
    const hash = createHash('sha256').update(t.data).digest('hex');
    let loc = seen.get(hash);
    if (!loc) {
      loc = { offset: dataLength, length: t.data.length };
      seen.set(hash, loc);
      chunks.push(t.data);
      dataLength += t.data.length;
    }
    const last = entries[entries.length - 1];
    if (last && last.offset === loc.offset && last.tileId + last.runLength === t.tileId) {
      last.runLength++;
    } else {
      entries.push({ tileId: t.tileId, offset: loc.offset, length: loc.length, runLength: 1 });
    }
  }

  const { root, leaves } = buildDirectories(entries);
  const metadata = gzipSync(
    Buffer.from(
      JSON.stringify({
        name: meta.name,
        attribution: meta.attribution,
        ...(meta.description ? { description: meta.description } : {}),
        type: 'overlay',
        format: 'png',
      }),
    ),
  );

  const h = Buffer.alloc(HEADER_BYTES);
  h.write('PMTiles', 0, 'latin1');
  h.writeUInt8(3, 7);
  const rootOffset = HEADER_BYTES;
  const metaOffset = rootOffset + root.length;
  const leafOffset = metaOffset + metadata.length;
  const dataOffset = leafOffset + leaves.length;
  const u64 = (pos: number, v: number) => h.writeBigUInt64LE(BigInt(v), pos);
  u64(8, rootOffset);
  u64(16, root.length);
  u64(24, metaOffset);
  u64(32, metadata.length);
  u64(40, leafOffset);
  u64(48, leaves.length);
  u64(56, dataOffset);
  u64(64, dataLength);
  u64(72, sorted.length); // addressed tiles
  u64(80, entries.length); // tile entries
  u64(88, chunks.length); // tile contents
  h.writeUInt8(1, 96); // clustered
  h.writeUInt8(2, 97); // internal compression: gzip
  h.writeUInt8(1, 98); // tile compression: none (PNG is already compressed)
  h.writeUInt8(2, 99); // tile type: png
  h.writeUInt8(meta.minzoom, 100);
  h.writeUInt8(meta.maxzoom, 101);
  const e7 = (v: number) => Math.round(v * 1e7);
  h.writeInt32LE(e7(meta.bounds.west), 102);
  h.writeInt32LE(e7(meta.bounds.south), 106);
  h.writeInt32LE(e7(meta.bounds.east), 110);
  h.writeInt32LE(e7(meta.bounds.north), 114);
  h.writeUInt8(meta.minzoom, 118);
  h.writeInt32LE(e7((meta.bounds.west + meta.bounds.east) / 2), 119);
  h.writeInt32LE(e7((meta.bounds.south + meta.bounds.north) / 2), 123);

  return Buffer.concat([h, root, metadata, leaves, ...chunks]);
}

// ── WMTS → PMTiles adapter ──

export interface WmtsRasterOptions {
  /** GetTile URL with {z}, {x} and {y} (TILEMATRIX, TILECOL, TILEROW). */
  tileUrl: string;
  bbox: Bbox;
  minzoom: number;
  maxzoom: number;
  /** Archive metadata. */
  name: string;
  description?: string;
  /** Parallel requests (be polite: 4 at most). */
  concurrency?: number;
  /** Pause after each request, per worker. */
  delayMs?: number;
  /** Progress lines on stderr every N tiles (0 = silent). */
  logEvery?: number;
}

export interface WmtsRaw {
  tiles: Array<Tile & { data: Buffer }>;
  requested: number;
  /** Last-Modified of each non-empty tile served from the source cache. */
  lastModified: string[];
}

/**
 * Publication time from the tiles' Last-Modified. GeoWebCache stamps each tile
 * when it renders it: a seeded layer shares one day, while tiles re-rendered
 * later (cache expiry) carry later dates although the data did not change.
 * So take the day most tiles share (ties: the later day) and return the
 * latest stamp of that day. A reseed after a data change moves the whole
 * layer to the new day.
 */
export function modalModified(values: string[]): string | null {
  const byDay = new Map<string, number[]>();
  for (const v of values) {
    const t = Date.parse(v);
    if (!Number.isFinite(t)) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  let best: [string, number[]] | null = null;
  for (const [day, ts] of byDay) {
    if (!best || ts.length > best[1].length || (ts.length === best[1].length && day > best[0])) {
      best = [day, ts];
    }
  }
  return best ? new Date(Math.max(...best[1])).toISOString() : null;
}

/** Tiles per Last-Modified day, for the ingest log. */
function dayHistogram(values: string[]): string {
  const n = new Map<string, number>();
  for (const v of values) {
    const t = Date.parse(v);
    if (Number.isFinite(t)) {
      const d = new Date(t).toISOString().slice(0, 10);
      n.set(d, (n.get(d) ?? 0) + 1);
    }
  }
  return [...n]
    .sort((a, b) => b[1] - a[1])
    .map(([d, c]) => `${d}: ${c}`)
    .join(', ');
}

export function wmtsRasterAdapter(opts: WmtsRasterOptions): RasterAdapter<WmtsRaw> {
  const concurrency = Math.min(4, Math.max(1, opts.concurrency ?? 4));
  const delayMs = opts.delayMs ?? 100;
  const logEvery = opts.logEvery ?? 0;
  return {
    kind: 'raster',
    async fetch(ctx) {
      const todo = tilesInBbox(opts.bbox, opts.minzoom, opts.maxzoom);
      const tiles: WmtsRaw['tiles'] = [];
      const lastModified: string[] = [];
      let next = 0;
      let done = 0;
      const worker = async () => {
        for (let i = next++; i < todo.length; i = next++) {
          const t = todo[i] as Tile;
          const url = opts.tileUrl
            .replace('{z}', String(t.z))
            .replace('{x}', String(t.x))
            .replace('{y}', String(t.y));
          try {
            const res = await ctx.get(url, { timeoutMs: 30_000 });
            if (!isTransparentPng(res.body)) {
              tiles.push({ ...t, data: res.body });
              const hit = res.headers['geowebcache-cache-result'];
              if (res.lastModified && hit !== 'MISS') lastModified.push(res.lastModified);
            }
          } catch (err) {
            // A missing tile is an empty tile; anything else fails the run
            // (a partial archive must never replace a complete one).
            if (!(err instanceof HttpError && err.status === 404)) throw err;
          }
          done++;
          if (logEvery && done % logEvery === 0) {
            process.stderr.write(`  ${done}/${todo.length} tiles, ${tiles.length} kept\n`);
          }
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      if (logEvery) process.stderr.write(`  Last-Modified by day: ${dayHistogram(lastModified)}\n`);
      return { tiles, requested: todo.length, lastModified };
    },
    normalize(raw, ctx) {
      return {
        archive: writePmtiles(raw.tiles, {
          name: opts.name,
          attribution: ctx.layer.attribution,
          description: opts.description,
          bounds: opts.bbox,
          minzoom: opts.minzoom,
          maxzoom: opts.maxzoom,
        }),
        tileCount: raw.tiles.length,
        publishedAt: modalModified(raw.lastModified),
      };
    },
  };
}
