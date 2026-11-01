import { describe, expect, it } from 'vitest';
import { latToY, lonToX } from '../lib/raster.ts';
import { lonLatToUtm, utmToLonLat } from '../lib/utm.ts';
import { addMonth, archiveName, emptyIndex } from './months.ts';
import {
  canvasForBounds,
  canvasTiles,
  createCanvas,
  cutTile,
  halve,
  latToPx,
  lonToPx,
  pxToLat,
  pxToLon,
  rasterizeMask,
  splat,
  type UtmImage,
} from './mosaic.ts';
import { NDVI_LUT } from './ndvi.ts';

describe('tile maths', () => {
  it('maps lon/lat to global pixels and back', () => {
    const [lon, lat] = [-8.5446, 42.8805]; // Santiago
    const x = lonToPx(lon, 13);
    const y = latToPx(lat, 13);
    expect(pxToLon(x, 13)).toBeCloseTo(lon, 9);
    expect(pxToLat(y, 13)).toBeCloseTo(lat, 9);
    // Same tile as the WMTS grid of lib/raster.ts.
    expect(Math.floor(x / 256)).toBe(lonToX(lon, 13));
    expect(Math.floor(y / 256)).toBe(latToY(lat, 13));
  });

  it('lists the tiles a canvas overlaps', () => {
    const c = createCanvas(10, 250, 510, 20, 10);
    expect(canvasTiles(c)).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ]);
  });
});

describe('UTM forward projection', () => {
  it('agrees with the inverse to the centimetre over Galicia', () => {
    for (const [lon, lat] of [
      [-9.3, 42.9],
      [-8.5446, 42.8805],
      [-7.0, 43.7],
      [-6.8, 41.9],
    ] as const) {
      const [e, n] = lonLatToUtm(lon, lat, 29);
      const [lon2, lat2] = utmToLonLat(e, n, 29);
      expect(lon2).toBeCloseTo(lon, 6);
      expect(lat2).toBeCloseTo(lat, 6);
    }
  });

  it('puts the central meridian on easting 500 000', () => {
    const [e] = lonLatToUtm(-9, 43, 29);
    expect(e).toBeCloseTo(500000, 3);
  });
});

describe('rasterizeMask', () => {
  it('fills pixels whose centre is inside, and leaves holes out', () => {
    const c = createCanvas(0, 0, 0, 10, 10);
    // Square from pixel 2 to 8 with a hole from 4 to 6, in pixel units of z0.
    const toLon = (x: number) => pxToLon(x, 0);
    const toLat = (y: number) => pxToLat(y, 0);
    const ring = (a: number, b: number) => [
      [toLon(a), toLat(a)],
      [toLon(b), toLat(a)],
      [toLon(b), toLat(b)],
      [toLon(a), toLat(b)],
      [toLon(a), toLat(a)],
    ];
    const mask = rasterizeMask([[ring(2, 8), ring(4, 6)]], c);
    const at = (x: number, y: number) => mask[y * 10 + x];
    expect(at(2, 2)).toBe(1);
    expect(at(7, 7)).toBe(1);
    expect(at(8, 8)).toBe(0);
    expect(at(1, 5)).toBe(0);
    expect(at(4, 4)).toBe(0);
    expect(at(5, 5)).toBe(0);
    expect(at(3, 5)).toBe(1);
  });
});

describe('splat', () => {
  it('resamples a UTM image into the canvas inside the mask, first image wins', () => {
    const canvas = canvasForBounds({ west: -8.56, south: 42.87, east: -8.53, north: 42.89 }, 13);
    const mask = new Uint8Array(canvas.width * canvas.height).fill(1);
    mask[0] = 0;
    const [e, n] = lonLatToUtm(-8.6, 42.92, 29);
    const W = 300;
    const img = (value: number): UtmImage => ({
      zone: 29,
      originX: e,
      originY: n,
      pixelSize: 20,
      width: W,
      height: W,
      rgb: new Uint8Array(W * W * 3).fill(value),
      ndvi: new Uint8Array(W * W).fill(150),
      alpha: new Uint8Array(W * W).fill(255),
    });
    const written = splat(canvas, mask, img(90));
    expect(written).toBe(canvas.width * canvas.height - 1);
    expect(canvas.rgba[3]).toBe(0);
    expect(canvas.rgba[4]).toBe(90);
    expect(canvas.ndvi[1]).toBe(150);
    expect(splat(canvas, mask, img(200))).toBe(0);
  });

  it('leaves pixels outside the image empty', () => {
    const canvas = canvasForBounds({ west: -8.56, south: 42.87, east: -8.53, north: 42.89 }, 13);
    const mask = new Uint8Array(canvas.width * canvas.height).fill(1);
    const [e, n] = lonLatToUtm(-7, 43.5, 29);
    const img: UtmImage = {
      zone: 29,
      originX: e,
      originY: n,
      pixelSize: 20,
      width: 10,
      height: 10,
      rgb: new Uint8Array(300),
      ndvi: new Uint8Array(100),
      alpha: new Uint8Array(100).fill(255),
    };
    expect(splat(canvas, mask, img)).toBe(0);
  });
});

describe('halve and cutTile', () => {
  it('averages children weighted by alpha and keeps the covered share', () => {
    const c = createCanvas(13, 2, 2, 2, 2);
    // Two opaque children (values 100 and 200), two empty.
    c.rgba.set([100, 100, 100, 255], 0);
    c.rgba.set([200, 200, 200, 255], 4);
    c.ndvi.set([100, 200]);
    const h = halve(c);
    expect([h.z, h.x0, h.y0, h.width, h.height]).toEqual([12, 1, 1, 1, 1]);
    expect([...h.rgba]).toEqual([150, 150, 150, 128]);
    expect(h.ndvi[0]).toBe(150);
  });

  it('cuts true colour and NDVI tiles and skips empty ones', () => {
    const c = createCanvas(1, 250, 0, 10, 1);
    c.rgba.set([10, 20, 30, 255], 8 * 4); // global pixel 258 → tile x 1, column 2
    c.ndvi[8] = 200;
    expect(cutTile(c, 0, 0)).toBeNull();
    const t = cutTile(c, 1, 0) as Uint8Array;
    expect([...t.subarray(8, 12)]).toEqual([10, 20, 30, 255]);
    const nd = cutTile(c, 1, 0, NDVI_LUT) as Uint8Array;
    expect([...nd.subarray(8, 12)]).toEqual([0x0e, 0x3f, 0x22, 255]);
  });
});

describe('months index', () => {
  const entry = (month: string, hash = 'a1b2c3d4e5f6a7b8') => ({
    month,
    file: archiveName(month, hash),
    minzoom: 8,
    maxzoom: 13,
    bounds: [-9.35, 41.8, -6.7, 43.8] as [number, number, number, number],
    tiles: 1,
    bytes: 1,
    sha256: hash,
    gap_share: 0,
    scenes: 1,
    first_date: null,
    last_date: null,
    built_at: '2026-11-03T03:00:00Z',
  });

  it('keeps the newest months, draws only the latest, reports what falls out', () => {
    let idx = emptyIndex('satelite-mes');
    const removed: string[] = [];
    for (const m of ['2025-10', '2025-11', '2025-12', '2026-01']) {
      const r = addMonth(idx, entry(m), 3);
      idx = r.index;
      removed.push(...r.removed);
    }
    expect(idx.months.map((m) => m.month)).toEqual(['2026-01', '2025-12', '2025-11']);
    expect(idx.archives.map((m) => m.file)).toEqual(['2026-01-a1b2c3d4e5f6.pmtiles']);
    expect(removed).toEqual(['2025-10-a1b2c3d4e5f6.pmtiles']);
  });

  it('replaces a rebuilt month (new name) and an old rebuild does not become latest', () => {
    let idx = addMonth(emptyIndex('x'), entry('2026-09'), 12).index;
    idx = addMonth(idx, entry('2026-10'), 12).index;
    const r = addMonth(idx, { ...entry('2026-09', 'ffffffffffffffff'), tiles: 9 }, 12);
    expect(r.index.months.map((m) => [m.month, m.tiles])).toEqual([
      ['2026-10', 1],
      ['2026-09', 9],
    ]);
    expect(r.index.archives[0]?.month).toBe('2026-10');
    expect(r.removed).toEqual(['2026-09-a1b2c3d4e5f6.pmtiles']);
  });

  it('rejects malformed months and hashes in file names', () => {
    expect(() => archiveName('2026-9', 'a1b2c3d4e5f6')).toThrow();
    expect(() => archiveName('2026-09', 'xyz')).toThrow();
  });
});
