// Pack cached tiles into PMTiles v3 archives without holding them in memory:
// pass 1 reads each tile once to hash it (identical tiles are stored once)
// and lays out the directory; pass 2 writes the preamble and streams the
// distinct tiles from disk. Output is deterministic (same tiles, same bytes),
// so an unchanged archive keeps its checksum and is not uploaded again.
//
// Archives are split so that none exceeds `limitBytes`: first the planned
// zoom groups, then a zoom group by zoom, then a single zoom by columns.

import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, renameSync, statSync, writeSync } from 'node:fs';
import { zxyToTileId } from 'pmtiles';
import {
  type Bbox,
  type Entry,
  type PmtilesMeta,
  pmtilesPreamble,
  type Tile,
} from '../../lib/raster.ts';
import { EXT, type TileFormat, tilePath, tileState } from './fetch.ts';
import { boundsOf } from './tiles.ts';

export interface Group {
  /** File stem, e.g. "z6-14", "z16-a". */
  name: string;
  minzoom: number;
  maxzoom: number;
  tiles: Tile[];
}

export interface ArchiveInfo {
  file: string;
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  tiles: number;
  bytes: number;
  sha256: string;
}

/** Default split: overview zooms in one archive, the two detailed zooms in another. */
export const DEFAULT_GROUPS: Array<[number, number]> = [
  [6, 14],
  [15, 16],
];

const zoomName = (a: number, b: number) => (a === b ? `z${a}` : `z${a}-${b}`);

export function planGroups(tiles: Tile[], ranges: Array<[number, number]>): Group[] {
  return ranges.map(([minzoom, maxzoom]) => ({
    name: zoomName(minzoom, maxzoom),
    minzoom,
    maxzoom,
    tiles: tiles.filter((t) => t.z >= minzoom && t.z <= maxzoom),
  }));
}

/**
 * Split groups whose stored size exceeds the limit: by zoom first, then a
 * single zoom by whole tile columns into parts of similar size.
 */
export function splitGroups(
  groups: Group[],
  sizeOf: (t: Tile) => number,
  limitBytes: number,
): Group[] {
  const out: Group[] = [];
  const total = (ts: Tile[]) => ts.reduce((s, t) => s + sizeOf(t), 0);
  for (const g of groups) {
    const bytes = total(g.tiles);
    if (bytes <= limitBytes) {
      out.push(g);
    } else if (g.minzoom < g.maxzoom) {
      const perZoom: Group[] = [];
      for (let z = g.minzoom; z <= g.maxzoom; z++) {
        perZoom.push({
          name: zoomName(z, z),
          minzoom: z,
          maxzoom: z,
          tiles: g.tiles.filter((t) => t.z === z),
        });
      }
      out.push(...splitGroups(perZoom, sizeOf, limitBytes));
    } else {
      // One zoom: cut into k parts along x, keeping whole columns together.
      const k = Math.ceil(bytes / (limitBytes * 0.95));
      const byX = new Map<number, Tile[]>();
      for (const t of g.tiles) byX.set(t.x, [...(byX.get(t.x) ?? []), t]);
      const cols = [...byX.keys()].sort((a, b) => a - b);
      const target = bytes / k;
      let part: Tile[] = [];
      let acc = 0;
      const parts: Tile[][] = [];
      for (const x of cols) {
        const col = byX.get(x) ?? [];
        const colBytes = total(col);
        if (part.length && acc + colBytes > target && parts.length < k - 1) {
          parts.push(part);
          part = [];
          acc = 0;
        }
        part.push(...col);
        acc += colBytes;
      }
      if (part.length) parts.push(part);
      parts.forEach((p, i) => {
        out.push({
          name: `${g.name}-${String.fromCharCode(97 + i)}`,
          minzoom: g.minzoom,
          maxzoom: g.maxzoom,
          tiles: p,
        });
      });
    }
  }
  return out;
}

export interface PackOptions {
  cache: string;
  format: TileFormat;
  /** Output path (written to `<path>.tmp` and renamed at the end). */
  out: string;
  meta: Omit<PmtilesMeta, 'bounds' | 'minzoom' | 'maxzoom'>;
}

/** Write one group to a PMTiles archive. Every tile must be stored or known missing. */
export function packGroup(group: Group, o: PackOptions): ArchiveInfo {
  const ext = EXT[o.format];
  const present = group.tiles
    .filter((t) => {
      const s = tileState(o.cache, t, o.format);
      if (s === 'todo') throw new Error(`tile ${t.z}/${t.x}/${t.y} not fetched yet`);
      return s === 'stored';
    })
    .map((t) => ({ ...t, tileId: zxyToTileId(t.z, t.x, t.y), path: tilePath(o.cache, t, ext) }))
    .sort((a, b) => a.tileId - b.tileId);
  if (present.length === 0) throw new Error(`group ${group.name} has no tiles`);

  // Pass 1: layout.
  const entries: Entry[] = [];
  const unique: string[] = [];
  const seen = new Map<string, { offset: number; length: number }>();
  let dataLength = 0;
  for (const t of present) {
    const hash = createHash('sha256').update(readFileSync(t.path)).digest('hex');
    let loc = seen.get(hash);
    if (!loc) {
      loc = { offset: dataLength, length: statSync(t.path).size };
      seen.set(hash, loc);
      unique.push(t.path);
      dataLength += loc.length;
    }
    const last = entries[entries.length - 1];
    if (last && last.offset === loc.offset && last.tileId + last.runLength === t.tileId) {
      last.runLength++;
    } else {
      entries.push({ tileId: t.tileId, offset: loc.offset, length: loc.length, runLength: 1 });
    }
  }

  const bounds: Bbox = boundsOf(present);
  const preamble = pmtilesPreamble(
    entries,
    { ...o.meta, bounds, minzoom: group.minzoom, maxzoom: group.maxzoom },
    {
      addressed: present.length,
      contents: unique.length,
      dataLength,
      tileType: o.format,
      layerType: 'baselayer',
    },
  );

  // Pass 2: write, hashing the archive as it goes.
  const tmp = `${o.out}.tmp`;
  const fd = openSync(tmp, 'w');
  const sha = createHash('sha256');
  let bytes = 0;
  const put = (b: Buffer) => {
    writeSync(fd, b);
    sha.update(b);
    bytes += b.length;
  };
  try {
    put(preamble);
    for (const p of unique) put(readFileSync(p));
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, o.out);

  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    file: o.out.split('/').pop() ?? o.out,
    minzoom: group.minzoom,
    maxzoom: group.maxzoom,
    bounds: [r(bounds.west), r(bounds.south), r(bounds.east), r(bounds.north)],
    tiles: present.length,
    bytes,
    sha256: sha.digest('hex'),
  };
}
