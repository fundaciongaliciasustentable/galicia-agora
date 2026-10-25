import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PMTiles, type RangeResponse, type Source } from 'pmtiles';
import { describe, expect, it } from 'vitest';
import { GALICIA_BBOX } from './adapter.ts';
import { HttpError } from './http.ts';
import { runLayer } from './ingest.ts';
import {
  isTransparentPng,
  modalModified,
  type RasterAdapter,
  tilesInBbox,
  wmtsRasterAdapter,
  writePmtiles,
} from './raster.ts';
import { fixtureContext } from './testing.ts';

const FX = join(import.meta.dirname, '../layers/inundacion-perigo-t100/fixtures');
const blank = await readFile(join(FX, 'tile-blank.png'));
const tile = await readFile(join(FX, 'tile-t100-z12-x1958-y1515.png'));

class BufferSource implements Source {
  constructor(private buf: Buffer) {}
  getKey() {
    return 'mem';
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const b = this.buf.subarray(offset, offset + length);
    return { data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
  }
}

/** Minimal PNG (filter 0 rows) for edge cases the real fixtures do not cover. */
function png(width: number, colorType: number, depth: number, rows: number[][], extra = {}) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(rows.length, 4);
  ihdr[8] = depth;
  ihdr[9] = colorType;
  const raw = Buffer.from(rows.flatMap((r) => [0, ...r]));
  const { plte, trns } = extra as { plte?: number[]; trns?: number[] };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(plte ? [chunk('PLTE', Buffer.from(plte))] : []),
    ...(trns ? [chunk('tRNS', Buffer.from(trns))] : []),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('isTransparentPng', () => {
  it('detects the real blank SNCZI tile and keeps a real flood tile', () => {
    expect(isTransparentPng(blank)).toBe(true);
    expect(isTransparentPng(tile)).toBe(false);
  });

  it('handles palette PNGs with tRNS and is conservative otherwise', () => {
    const plte = [0, 0, 0, 0, 0, 255];
    // 2 px, 8-bit indices: both index 0 (transparent).
    expect(isTransparentPng(png(2, 3, 8, [[0, 0]], { plte, trns: [0, 255] }))).toBe(true);
    expect(isTransparentPng(png(2, 3, 8, [[0, 1]], { plte, trns: [0, 255] }))).toBe(false);
    // 1-bit indices packed in one byte: 0b01000000 → second pixel is index 1.
    expect(isTransparentPng(png(2, 3, 1, [[0x40]], { plte, trns: [0] }))).toBe(false);
    // Missing tRNS entries are opaque.
    expect(isTransparentPng(png(1, 3, 8, [[1]], { plte, trns: [0] }))).toBe(false);
    // Palette without tRNS, RGB without alpha and non-PNG data are never "empty".
    expect(isTransparentPng(png(1, 3, 8, [[0]], { plte }))).toBe(false);
    expect(isTransparentPng(png(1, 2, 8, [[0, 0, 0]]))).toBe(false);
    expect(isTransparentPng(Buffer.from('<ServiceException/>'))).toBe(false);
  });
});

describe('tilesInBbox', () => {
  it('covers the Galicia bbox with one tile at z6 and the expected grid at z12', () => {
    expect(tilesInBbox(GALICIA_BBOX, 6, 6)).toEqual([{ z: 6, x: 30, y: 23 }]);
    const z12 = tilesInBbox(GALICIA_BBOX, 12, 12);
    // The real Ourense tile (x 1958, y 1515) is inside.
    expect(z12.some((t) => t.x === 1958 && t.y === 1515)).toBe(true);
    expect(z12.length).toBe(992);
  });
});

describe('writePmtiles', () => {
  const meta = {
    name: 'proba',
    attribution: '© Proba',
    bounds: GALICIA_BBOX,
    minzoom: 6,
    maxzoom: 13,
  };

  it('writes an archive the pmtiles reader understands, deduplicating tiles', async () => {
    const tiles = [
      { z: 12, x: 1958, y: 1515, data: tile },
      { z: 12, x: 1959, y: 1515, data: tile },
      { z: 6, x: 30, y: 23, data: blank },
    ];
    const buf = writePmtiles(tiles, meta);
    const p = new PMTiles(new BufferSource(buf));
    const h = await p.getHeader();
    expect(h.specVersion).toBe(3);
    expect(h.tileType).toBe(2); // png
    expect([h.minZoom, h.maxZoom]).toEqual([6, 13]);
    expect(h.numAddressedTiles).toBe(3);
    expect(h.numTileContents).toBe(2);
    expect(h.minLon).toBeCloseTo(-9.35, 5);
    const t = await p.getZxy(12, 1959, 1515);
    expect(Buffer.from(t?.data ?? new ArrayBuffer(0)).equals(tile)).toBe(true);
    expect(await p.getZxy(12, 1960, 1515)).toBeUndefined();
    expect(await p.getMetadata()).toMatchObject({ attribution: '© Proba', format: 'png' });
    // Deterministic: same input, same bytes.
    expect(writePmtiles([...tiles].reverse(), meta).equals(buf)).toBe(true);
  });

  it('spills into leaf directories when the root would not fit in 16 KiB', async () => {
    // ~60,000 z15 tiles with varied sizes, so the directory cannot compress below 16 KiB.
    const tiles = tilesInBbox(GALICIA_BBOX, 15, 15).map((t, i) => ({
      ...t,
      data: Buffer.from(
        `tile-${i}`.padEnd(12 + (createHash('md5').update(`${i}`).digest()[0] ?? 0)),
      ),
    }));
    const buf = writePmtiles(tiles, { ...meta, maxzoom: 15 });
    const p = new PMTiles(new BufferSource(buf));
    const h = await p.getHeader();
    expect(h.leafDirectoryLength).toBeGreaterThan(0);
    expect(h.rootDirectoryOffset + h.rootDirectoryLength).toBeLessThanOrEqual(16_384);
    for (const i of [0, 30_000, tiles.length - 1]) {
      const t = tiles[i];
      if (!t) throw new Error('missing tile');
      const got = await p.getZxy(t.z, t.x, t.y);
      expect(
        Buffer.from(got?.data ?? new ArrayBuffer(0))
          .toString()
          .trimEnd(),
      ).toBe(`tile-${i}`);
    }
  });
});

describe('modalModified', () => {
  it('dates the layer by the day most tiles share, not by later re-renders', () => {
    expect(
      modalModified([
        'Wed, 11 Mar 2026 09:54:03 GMT',
        'Wed, 11 Mar 2026 09:56:46 GMT',
        'Wed, 29 Jul 2026 15:32:56 GMT',
        'x',
      ]),
    ).toBe('2026-03-11T09:56:46.000Z');
    // A tie goes to the later day (a reseed in progress).
    expect(modalModified(['Wed, 11 Mar 2026 09:54:03 GMT', 'Wed, 29 Jul 2026 15:32:56 GMT'])).toBe(
      '2026-07-29T15:32:56.000Z',
    );
    expect(modalModified([])).toBeNull();
  });
});

describe('wmtsRasterAdapter', () => {
  const layer = { id: 'proba', attribution: '© Proba' } as never;
  const opts = {
    tileUrl: 'https://example.org/wmts?z={z}&x={x}&y={y}',
    bbox: GALICIA_BBOX,
    minzoom: 6,
    maxzoom: 7,
    name: 'proba',
    delayMs: 0,
  };

  it('treats 404 as empty, fails the whole run on other errors, and dates from cache hits', async () => {
    const ctx = fixtureContext(layer, []);
    let calls = 0;
    ctx.get = async (url) => {
      calls++;
      if (url.includes('z=7&x=61&y=46')) throw new HttpError('HTTP 404', 404, 1);
      const hit = url.includes('z=6');
      return {
        url,
        status: 200,
        notModified: false,
        body: url.includes('z=7&x=61&y=47') ? blank : tile,
        headers: { 'geowebcache-cache-result': hit ? 'HIT' : 'MISS' },
        etag: null,
        lastModified: hit ? 'Wed, 11 Mar 2026 09:54:03 GMT' : 'Sun, 25 Oct 2026 09:00:00 GMT',
        attempts: 1,
      };
    };
    const a = wmtsRasterAdapter(opts);
    const raw = await a.fetch(ctx);
    expect(calls).toBe(5);
    expect(raw.tiles.length).toBe(3);
    const out = await a.normalize(raw, ctx);
    // Tiles rendered on a cache miss say "now"; they do not date the data.
    expect(out.publishedAt).toBe('2026-03-11T09:54:03.000Z');

    ctx.get = async () => {
      throw new HttpError('HTTP 503', 503, 4);
    };
    await expect(a.fetch(ctx)).rejects.toThrow('503');
  });
});

describe('runLayer with a raster adapter', () => {
  it('publishes data.pmtiles with the tile count, and keeps it on failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ga-raster-'));
    const layersDir = join(root, 'layers');
    await mkdir(join(layersDir, 'proba'), { recursive: true });
    await writeFile(
      join(layersDir, 'proba', 'layer.yaml'),
      'id: proba\ntitle: { gl: P, es: P }\nsource_url: https://example.org\ngeometry: raster\n' +
        'licence: { text_url: https://example.org/l, collection: odbl }\nattribution: © P\n',
    );
    const outDir = join(root, 'out');
    const archive = writePmtiles([{ z: 6, x: 30, y: 23, data: tile }], {
      name: 'proba',
      attribution: '© P',
      bounds: GALICIA_BBOX,
      minzoom: 6,
      maxzoom: 6,
    });
    const ok: RasterAdapter<null> = {
      kind: 'raster',
      fetch: async () => null,
      normalize: () => ({ archive, tileCount: 1, publishedAt: '2026-03-11T09:54:03.000Z' }),
    };
    const r = await runLayer('proba', { layersDir, outDir, adapter: ok });
    expect(r.skipped).toBe(false);
    expect((await readFile(join(outDir, 'proba', 'data.pmtiles'))).equals(archive)).toBe(true);
    const meta = JSON.parse(await readFile(join(outDir, 'proba', 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({ status: 'fresh', feature_count: 1 });

    const failing: RasterAdapter<null> = {
      ...ok,
      fetch: async () => {
        throw new Error('HTTP 503');
      },
    };
    await runLayer('proba', { layersDir, outDir, adapter: failing });
    const meta2 = JSON.parse(await readFile(join(outDir, 'proba', 'meta.json'), 'utf8'));
    expect(meta2).toMatchObject({ status: 'stale', last_error: 'HTTP 503' });
    expect((await readFile(join(outDir, 'proba', 'data.pmtiles'))).equals(archive)).toBe(true);
  });
});
