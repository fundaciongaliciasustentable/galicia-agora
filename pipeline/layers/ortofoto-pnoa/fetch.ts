// Resumable, rate-limited tile download into a disk cache.
//
// Layout: <cache>/<z>/<x>/<y>.<ext> for a stored tile and <y>.none for a tile
// the service does not have (404). A tile with either file is never requested
// again, so a run that stops (time budget, cancelled job) continues where it
// left off once the cache is restored. Files appear atomically (temp + rename):
// a half-written tile is never mistaken for a finished one.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { FetchOptions, FetchResult } from '../../lib/http.ts';
import { HttpError } from '../../lib/http.ts';
import type { Tile } from '../../lib/raster.ts';

const run = promisify(execFile);

export type TileFormat = 'webp' | 'jpeg';

export const EXT: Record<TileFormat, string> = { webp: 'webp', jpeg: 'jpg' };

export function tilePath(cache: string, t: Tile, ext: string): string {
  return join(cache, String(t.z), String(t.x), `${t.y}.${ext}`);
}

export type TileState = 'stored' | 'none' | 'todo';

export function tileState(cache: string, t: Tile, format: TileFormat): TileState {
  if (existsSync(tilePath(cache, t, EXT[format]))) return 'stored';
  if (existsSync(tilePath(cache, t, 'none'))) return 'none';
  return 'todo';
}

/** Re-encode a JPEG to WebP with cwebp (libwebp, BSD-3-Clause; apt/Homebrew package `webp`). */
export async function cwebp(jpeg: Buffer, quality: number, tmpBase: string): Promise<Buffer> {
  const src = `${tmpBase}.src.jpg`;
  const dst = `${tmpBase}.out.webp`;
  await writeFile(src, jpeg);
  try {
    await run('cwebp', ['-quiet', '-q', String(quality), '-m', '4', src, '-o', dst]);
    return await readFile(dst);
  } finally {
    await rm(src, { force: true });
    await rm(dst, { force: true });
  }
}

/** Spaces request starts so that no more than `perSecond` begin in any second. */
export class RateLimiter {
  private next = 0;
  constructor(
    private perSecond: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}
  async take(): Promise<void> {
    const t = this.now();
    const slot = Math.max(t, this.next);
    this.next = slot + 1000 / this.perSecond;
    if (slot > t) await this.sleep(slot - t);
  }
}

export interface FetchTilesOptions {
  tiles: Tile[];
  cache: string;
  /** GetTile URL with {z}, {x} and {y}. */
  tileUrl: string;
  get(url: string, opts?: FetchOptions): Promise<FetchResult>;
  format: TileFormat;
  /** WebP quality (cwebp -q). */
  quality?: number;
  /** Requests started per second, across all workers (be polite: ≤ 10). */
  perSecond?: number;
  concurrency?: number;
  /** Stop taking new tiles after this instant (ms since epoch); the cache keeps what was done. */
  deadline?: number;
  /** Give up after this many failures in a row (the service is down or refusing us). */
  maxConsecutiveFailures?: number;
  encode?: (jpeg: Buffer, quality: number, tmpBase: string) => Promise<Buffer>;
  limiter?: RateLimiter;
  now?: () => number;
  log?: (line: string) => void;
  logEvery?: number;
}

export interface FetchStats {
  total: number;
  /** Already in the cache before this run (stored or known missing). */
  cached: number;
  fetched: number;
  /** 404 from the service, recorded as .none. */
  missing: number;
  failed: number;
  /** Tiles not attempted (deadline or too many failures). */
  remaining: number;
  bytesIn: number;
  bytesOut: number;
  /** Per zoom, tiles fetched in this run and their bytes in (JPEG) and out. */
  byZoom: Record<number, { tiles: number; bytesIn: number; bytesOut: number }>;
  complete: boolean;
  aborted: string | null;
}

function isJpeg(b: Buffer): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

export async function fetchTiles(o: FetchTilesOptions): Promise<FetchStats> {
  const now = o.now ?? Date.now;
  const limiter = o.limiter ?? new RateLimiter(Math.min(10, o.perSecond ?? 8), now);
  const quality = o.quality ?? 75;
  const encode = o.encode ?? cwebp;
  const maxFails = o.maxConsecutiveFailures ?? 50;
  const log = o.log ?? (() => {});
  const ext = EXT[o.format];
  const stats: FetchStats = {
    total: o.tiles.length,
    cached: 0,
    fetched: 0,
    missing: 0,
    failed: 0,
    remaining: 0,
    bytesIn: 0,
    bytesOut: 0,
    byZoom: {},
    complete: false,
    aborted: null,
  };

  const todo = o.tiles.filter((t) => tileState(o.cache, t, o.format) === 'todo');
  stats.cached = o.tiles.length - todo.length;
  log(`${stats.total} tiles, ${stats.cached} already cached, ${todo.length} to fetch`);

  let next = 0;
  let streak = 0;
  let done = 0;
  const worker = async (w: number) => {
    while (stats.aborted === null) {
      if (o.deadline !== undefined && now() >= o.deadline) {
        stats.aborted ??= 'time budget used';
        return;
      }
      const i = next++;
      const t = todo[i];
      if (!t) return;
      const url = o.tileUrl
        .replace('{z}', String(t.z))
        .replace('{x}', String(t.x))
        .replace('{y}', String(t.y));
      const out = tilePath(o.cache, t, ext);
      await mkdir(dirname(out), { recursive: true });
      await limiter.take();
      try {
        const res = await o.get(url, { timeoutMs: 60_000 });
        // A service error page served with 200 must never be cached as a tile.
        if (!isJpeg(res.body))
          throw new Error(`not a JPEG (${res.headers['content-type'] ?? '?'})`);
        const body =
          o.format === 'webp'
            ? await encode(res.body, quality, `${out}.${process.pid}.${w}`)
            : res.body;
        const tmp = `${out}.${process.pid}.${w}.tmp`;
        await writeFile(tmp, body);
        await rename(tmp, out);
        stats.fetched++;
        stats.bytesIn += res.body.length;
        stats.bytesOut += body.length;
        const zs = stats.byZoom[t.z] ?? { tiles: 0, bytesIn: 0, bytesOut: 0 };
        stats.byZoom[t.z] = zs;
        zs.tiles++;
        zs.bytesIn += res.body.length;
        zs.bytesOut += body.length;
        streak = 0;
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) {
          await writeFile(tilePath(o.cache, t, 'none'), '');
          stats.missing++;
          streak = 0;
        } else {
          stats.failed++;
          streak++;
          log(`  ${t.z}/${t.x}/${t.y}: ${err instanceof Error ? err.message : String(err)}`);
          if (streak >= maxFails) stats.aborted ??= `${streak} failures in a row`;
        }
      }
      done++;
      if (o.logEvery && done % o.logEvery === 0) {
        log(
          `  ${done}/${todo.length} · ${stats.fetched} stored, ${stats.missing} missing, ${stats.failed} failed · ` +
            `${(stats.bytesOut / Math.max(1, stats.fetched) / 1024).toFixed(1)} KB/tile`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 6) }, (_, w) => worker(w)));
  stats.remaining = todo.length - done;
  stats.complete = stats.remaining === 0 && stats.failed === 0;
  return stats;
}
