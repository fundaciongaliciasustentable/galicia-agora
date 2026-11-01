// One month of Sentinel-2 over Galicia → two tile sets (true colour, NDVI).
//
//  1. STAC search of the month; per MGRS tile, the clearest scenes (stac.ts).
//  2. Per tile, block by block (512 px at 20 m), read the scene classes (SCL)
//     and only then the bands of the scenes that add clear pixels; median
//     composite (composite.ts). Bands come from the 20 m overview of the COGs.
//  3. Resample each tile's composite into a Web Mercator canvas at z13, inside
//     the Galicia mask (mosaic.ts); halve for z12…z8; cut and encode WebP.
//
// Missing or broken scenes are skipped; pixels without any usable observation
// stay transparent and are counted as gaps.

import sharp from 'sharp';
import type { Bbox, Tile } from '../lib/raster.ts';
import { utmToLonLat } from '../lib/utm.ts';
import { type Cog, levelFor, openCog, type RangeGet, readWindow } from './cog.ts';
import {
  compositeBlock,
  countObservation,
  type Observation,
  stretch,
  toReflectance,
  worthReading,
} from './composite.ts';
import {
  boundsOf,
  type Canvas,
  canvasForBounds,
  canvasTiles,
  cutTile,
  halve,
  latToPx,
  lonToPx,
  rasterizeMask,
  splat,
  type UtmImage,
} from './mosaic.ts';
import { NDVI_LUT } from './ndvi.ts';
import { BANDS, type Scene, searchScenes, selectScenes } from './stac.ts';

export const RESOLUTION_M = 20;

export interface BuildOptions {
  month: string;
  /** Galicia outline ([lon, lat] rings, outline.ts): the mosaic is clipped to it. */
  galicia: number[][][][];
  /** Search box (Galicia). */
  bbox: Bbox;
  get: RangeGet;
  getJson: (url: string) => Promise<unknown>;
  /** Only these MGRS tiles (tests and partial runs). */
  tiles?: string[];
  maxScenes?: number;
  minzoom?: number;
  maxzoom?: number;
  /** Blocks processed at once (each fetches its bands in parallel). */
  concurrency?: number;
  quality?: { truecolour: number; ndvi: number };
  log?: (msg: string) => void;
}

export interface TileStats {
  tile: string;
  scenes: string[];
  /** Scenes that could not be opened or read (skipped). */
  failed: string[];
  blocks: number;
  /** Scene blocks whose bands were downloaded. */
  reads: number;
}

export interface MonthBuild {
  truecolour: Array<Tile & { data: Buffer }>;
  ndvi: Array<Tile & { data: Buffer }>;
  /** Mask pixels (z13) with no usable observation, 0–1. */
  gapShare: number;
  /** First and last acquisition used. */
  firstDate: string | null;
  lastDate: string | null;
  tiles: TileStats[];
}

/** Run async jobs with at most `n` in flight. */
export async function pool<T>(items: T[], n: number, job: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) await job(items[i] as T, i);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
}

/** Coarse "any" mask: cell (i, j) is 1 when any mask pixel falls in its f × f square. */
export function coarseMask(mask: Uint8Array, width: number, height: number, f: number) {
  const cw = Math.ceil(width / f);
  const ch = Math.ceil(height / f);
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const crow = Math.floor(y / f) * cw;
    for (let x = 0; x < width; x++) if (mask[row + x]) out[crow + Math.floor(x / f)] = 1;
  }
  return { cells: out, cw, ch, f };
}

interface SceneCogs {
  scene: Scene;
  scl: Cog;
  bands: Record<(typeof BANDS)[number], { cog: Cog; level: number }>;
}

async function openScene(scene: Scene, get: RangeGet): Promise<SceneCogs> {
  const scl = await openCog(scene.hrefs.scl, get);
  const bands = {} as SceneCogs['bands'];
  for (const b of BANDS) {
    const cog = await openCog(scene.hrefs[b], get);
    bands[b] = { cog, level: levelFor(cog, RESOLUTION_M) };
  }
  return { scene, scl, bands };
}

/** Composite of one MGRS tile at 20 m (only blocks that touch Galicia). */
async function compositeTile(
  tile: string,
  scenes: Scene[],
  canvas: Canvas,
  coarse: ReturnType<typeof coarseMask>,
  opts: BuildOptions,
  stats: TileStats,
): Promise<UtmImage | null> {
  const log = opts.log ?? (() => {});
  const opened: SceneCogs[] = [];
  for (const s of scenes) {
    try {
      opened.push(await openScene(s, opts.get));
    } catch (err) {
      stats.failed.push(s.id);
      log(`  ${s.id}: skipped (${err instanceof Error ? err.message : err})`);
    }
  }
  const ref = opened[0];
  if (!ref) return null;
  const grid = ref.scl;
  const lv0 = grid.levels[0];
  if (!lv0 || Math.abs(grid.pixelSize - RESOLUTION_M) > 0.01) {
    throw new Error(`${tile}: unexpected SCL grid (${grid.pixelSize} m)`);
  }
  const zone = Number(tile.slice(0, 2));
  const W = lv0.width;
  const H = lv0.height;
  const B = lv0.tileWidth;
  const img: UtmImage = {
    zone,
    originX: grid.originX,
    originY: grid.originY,
    pixelSize: RESOLUTION_M,
    width: W,
    height: H,
    rgb: new Uint8Array(W * H * 3),
    ndvi: new Uint8Array(W * H),
    alpha: new Uint8Array(W * H),
  };

  // Blocks that touch Galicia: project the block outline into the canvas and
  // look for mask cells under it.
  const blocks: Array<{ bx: number; by: number }> = [];
  for (let by = 0; by * B < H; by++) {
    for (let bx = 0; bx * B < W; bx++) {
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const fx of [0, 0.5, 1])
        for (const fy of [0, 0.5, 1]) {
          const e = grid.originX + (bx + fx) * B * RESOLUTION_M;
          const n = grid.originY - (by + fy) * B * RESOLUTION_M;
          const [lon, lat] = utmToLonLat(e, n, zone);
          const px = lonToPx(lon, canvas.z) - canvas.x0;
          const py = latToPx(lat, canvas.z) - canvas.y0;
          [minX, maxX, minY, maxY] = [
            Math.min(minX, px),
            Math.max(maxX, px),
            Math.min(minY, py),
            Math.max(maxY, py),
          ];
        }
      const c0 = Math.max(0, Math.floor(minX / coarse.f) - 1);
      const c1 = Math.min(coarse.cw - 1, Math.floor(maxX / coarse.f) + 1);
      const r0 = Math.max(0, Math.floor(minY / coarse.f) - 1);
      const r1 = Math.min(coarse.ch - 1, Math.floor(maxY / coarse.f) + 1);
      let hit = false;
      for (let r = r0; r <= r1 && !hit; r++)
        for (let c = c0; c <= c1 && !hit; c++) hit = coarse.cells[r * coarse.cw + c] === 1;
      if (hit) blocks.push({ bx, by });
    }
  }
  stats.blocks = blocks.length;

  const broken = new Set<string>();
  await pool(blocks, opts.concurrency ?? 6, async ({ bx, by }) => {
    const x0 = bx * B;
    const y0 = by * B;
    const w = Math.min(B, W - x0);
    const h = Math.min(B, H - y0);
    const clear = new Uint8Array(w * h);
    const fallback = new Uint8Array(w * h);
    const obs: Observation[] = [];
    for (const sc of opened) {
      if (broken.has(sc.scene.id)) continue;
      try {
        const scl = (await readWindow(sc.scl, 0, x0, y0, w, h, opts.get)) as Uint8Array;
        if (!worthReading(scl, clear, fallback)) continue;
        const raw = await Promise.all(
          BANDS.map((b) => {
            const { cog, level } = sc.bands[b];
            // Band level and SCL share the 20 m grid when the overview is exactly 2×.
            const f = (cog.levels[0]?.width ?? 0) / (cog.levels[level]?.width ?? 1);
            if (Math.abs(cog.pixelSize * f - RESOLUTION_M) > 0.01) {
              throw new Error(`${b}: no ${RESOLUTION_M} m level`);
            }
            return readWindow(cog, level, x0, y0, w, h, opts.get);
          }),
        );
        const s = sc.scene;
        const [red, green, blue, nir] = BANDS.map((b, k) =>
          toReflectance(raw[k] as Uint16Array, s.scale[b], s.offset[b]),
        ) as [Int16Array, Int16Array, Int16Array, Int16Array];
        obs.push({ scl, bands: { red, green, blue, nir } });
        countObservation(scl, clear, fallback);
        stats.reads++;
      } catch (err) {
        // One bad scene must not sink the month: drop it for the rest of the tile.
        if (!broken.has(sc.scene.id)) {
          broken.add(sc.scene.id);
          stats.failed.push(sc.scene.id);
          log(`  ${sc.scene.id}: dropped (${err instanceof Error ? err.message : err})`);
        }
      }
    }
    if (obs.length === 0) return;
    const comp = compositeBlock(obs, w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!comp.valid[i]) continue;
        const o = (y0 + y) * W + (x0 + x);
        img.rgb[o * 3] = stretch(comp.red[i] as number);
        img.rgb[o * 3 + 1] = stretch(comp.green[i] as number);
        img.rgb[o * 3 + 2] = stretch(comp.blue[i] as number);
        img.ndvi[o] = comp.ndvi[i] as number;
        img.alpha[o] = 255;
      }
    }
  });
  stats.scenes = opened.map((o) => o.scene.id).filter((id) => !broken.has(id));
  return img;
}

async function encode(rgba: Uint8Array, quality: number): Promise<Buffer> {
  return sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width: 256, height: 256, channels: 4 },
  })
    .webp({ quality, alphaQuality: 90, effort: 4, smartSubsample: true })
    .toBuffer();
}

export async function buildMonth(opts: BuildOptions): Promise<MonthBuild> {
  const log = opts.log ?? (() => {});
  const minzoom = opts.minzoom ?? 8;
  const maxzoom = opts.maxzoom ?? 13;
  const quality = opts.quality ?? { truecolour: 78, ndvi: 82 };

  const all = await searchScenes(opts.month, opts.bbox, opts.getJson);
  const selected = selectScenes(all, { maxScenes: opts.maxScenes ?? 8, minClear: 0.03 });
  log(
    `${opts.month}: ${all.length} scenes found, ${[...selected.values()].flat().length} selected in ${selected.size} MGRS tiles`,
  );

  let canvas = canvasForBounds(boundsOf(opts.galicia), maxzoom);
  const mask = rasterizeMask(opts.galicia, canvas);
  const coarse = coarseMask(mask, canvas.width, canvas.height, 32);
  log(`canvas z${maxzoom}: ${canvas.width} × ${canvas.height} px`);

  const tiles: TileStats[] = [];
  const used: string[] = [];
  for (const [tile, scenes] of selected) {
    if (opts.tiles && !opts.tiles.includes(tile)) continue;
    const stats: TileStats = { tile, scenes: [], failed: [], blocks: 0, reads: 0 };
    const t0 = Date.now();
    const img = await compositeTile(tile, scenes, canvas, coarse, opts, stats);
    const written = img ? splat(canvas, mask, img) : 0;
    tiles.push(stats);
    for (const id of stats.scenes) {
      const s = scenes.find((x) => x.id === id);
      if (s) used.push(s.datetime);
    }
    log(
      `${tile}: ${stats.scenes.length} scenes, ${stats.blocks} blocks, ${stats.reads} block reads, ${written} px, ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    );
  }

  let inside = 0;
  let filled = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    inside++;
    if (canvas.rgba[i * 4 + 3]) filled++;
  }
  const gapShare = inside ? 1 - filled / inside : 1;

  const truecolour: MonthBuild['truecolour'] = [];
  const ndvi: MonthBuild['ndvi'] = [];
  for (let z = maxzoom; z >= minzoom; z--) {
    if (z < maxzoom) canvas = halve(canvas);
    const c = canvas;
    await pool(canvasTiles(c), 8, async ({ x, y }) => {
      const tc = cutTile(c, x, y);
      if (!tc) return;
      truecolour.push({ z, x, y, data: await encode(tc, quality.truecolour) });
      const nd = cutTile(c, x, y, NDVI_LUT);
      if (nd) ndvi.push({ z, x, y, data: await encode(nd, quality.ndvi) });
    });
    log(`z${z}: ${truecolour.length} tiles so far`);
  }
  used.sort();
  return {
    truecolour,
    ndvi,
    gapShare,
    firstDate: used[0] ?? null,
    lastDate: used[used.length - 1] ?? null,
    tiles,
  };
}
