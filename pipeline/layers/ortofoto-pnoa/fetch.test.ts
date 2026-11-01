import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type FetchResult, HttpError } from '../../lib/http.ts';
import type { Tile } from '../../lib/raster.ts';
import { fetchTiles, RateLimiter, tilePath, tileState } from './fetch.ts';

/** Bytes that start like a JPEG (the fetcher checks the signature, never decodes). */
const jpeg = (tag: string) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(tag)]);

const tiles: Tile[] = [
  { z: 15, x: 15605, y: 12054 },
  { z: 15, x: 15606, y: 12054 },
  { z: 15, x: 15607, y: 12054 },
  { z: 15, x: 15608, y: 12054 },
];

function server(answers: Record<string, 'ok' | 404 | 500 | 'html'>) {
  const requested: string[] = [];
  const get = async (url: string): Promise<FetchResult> => {
    const m = /TILEMATRIX=(\d+)&TILEROW=(\d+)&TILECOL=(\d+)/.exec(url);
    const id = `${m?.[1]}/${m?.[3]}/${m?.[2]}`;
    requested.push(id);
    const a = answers[id] ?? 'ok';
    if (a === 404 || a === 500) throw new HttpError(`HTTP ${a}`, a, 1);
    const body = a === 'html' ? Buffer.from('<ServiceExceptionReport/>') : jpeg(id);
    return {
      url,
      status: 200,
      notModified: false,
      body,
      headers: { 'content-type': a === 'html' ? 'text/xml' : 'image/jpeg' },
      etag: null,
      lastModified: null,
      attempts: 1,
    };
  };
  return { get, requested };
}

const URL_T = 'https://example.test/wmts?TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
/** No real waiting in tests. */
const instant = () =>
  new RateLimiter(
    1000,
    () => 0,
    async () => {},
  );
/** "Encoder" that marks its output so the test can tell it ran. */
const fakeWebp = async (b: Buffer) => Buffer.concat([Buffer.from('WEBP:'), b]);

describe('fetchTiles', () => {
  it('stores tiles, records 404s, never caches an error page, and resumes', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'orto-'));
    // A tile from an earlier run is not requested again.
    const first = tiles[0] as Tile;
    await mkdir(join(cache, '15', String(first.x)), { recursive: true });
    await writeFile(tilePath(cache, first, 'webp'), 'old');

    const s1 = server({ '15/15606/12054': 404, '15/15607/12054': 'html' });
    const r1 = await fetchTiles({
      tiles,
      cache,
      tileUrl: URL_T,
      get: s1.get,
      format: 'webp',
      encode: fakeWebp,
      limiter: instant(),
    });
    expect(s1.requested.sort()).toEqual(['15/15606/12054', '15/15607/12054', '15/15608/12054']);
    expect(r1).toMatchObject({
      cached: 1,
      fetched: 1,
      missing: 1,
      failed: 1,
      remaining: 0,
      complete: false,
    });
    expect(tiles.map((t) => tileState(cache, t, 'webp'))).toEqual([
      'stored',
      'none',
      'todo',
      'stored',
    ]);
    expect((await readFile(tilePath(cache, tiles[3] as Tile, 'webp'))).toString()).toMatch(
      /^WEBP:/,
    );
    expect(r1.byZoom[15]).toMatchObject({ tiles: 1 });

    // Next run: only the failed tile is requested, and the set is complete.
    const s2 = server({});
    const r2 = await fetchTiles({
      tiles,
      cache,
      tileUrl: URL_T,
      get: s2.get,
      format: 'webp',
      encode: fakeWebp,
      limiter: instant(),
    });
    expect(s2.requested).toEqual(['15/15607/12054']);
    expect(r2).toMatchObject({ cached: 3, fetched: 1, complete: true });
    // No temporary files left behind.
    expect(existsSync(`${tilePath(cache, tiles[2] as Tile, 'webp')}.tmp`)).toBe(false);
  });

  it('stops at the deadline and leaves the rest for the next run', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'orto-'));
    let clock = 0;
    const s = server({});
    const r = await fetchTiles({
      tiles,
      cache,
      tileUrl: URL_T,
      get: async (u) => {
        clock += 1000;
        return s.get(u);
      },
      format: 'jpeg',
      concurrency: 1,
      deadline: 2000,
      now: () => clock,
      limiter: instant(),
    });
    expect(r).toMatchObject({
      fetched: 2,
      remaining: 2,
      complete: false,
      aborted: 'time budget used',
    });
    // JPEG mode keeps the source bytes as they came.
    expect(
      (await readFile(tilePath(cache, tiles[0] as Tile, 'jpg'))).equals(jpeg('15/15605/12054')),
    ).toBe(true);
  });

  it('gives up after too many failures in a row', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'orto-'));
    const answers = Object.fromEntries(tiles.map((t) => [`${t.z}/${t.x}/${t.y}`, 500 as const]));
    const s = server(answers);
    const r = await fetchTiles({
      tiles,
      cache,
      tileUrl: URL_T,
      get: s.get,
      format: 'jpeg',
      concurrency: 1,
      maxConsecutiveFailures: 2,
      limiter: instant(),
    });
    expect(s.requested.length).toBe(2);
    expect(r).toMatchObject({
      failed: 2,
      remaining: 2,
      complete: false,
      aborted: '2 failures in a row',
    });
  });
});

describe('RateLimiter', () => {
  it('spaces request starts to the given rate', async () => {
    let clock = 0;
    const starts: number[] = [];
    const limiter = new RateLimiter(
      10,
      () => clock,
      async (ms) => {
        clock += ms;
      },
    );
    for (let i = 0; i < 5; i++) {
      await limiter.take();
      starts.push(clock);
    }
    expect(starts).toEqual([0, 100, 200, 300, 400]);
  });
});
