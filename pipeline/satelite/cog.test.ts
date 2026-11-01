import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { levelFor, mergeRanges, openCog, readWindow, unpredict } from './cog.ts';

/**
 * Build a small little-endian tiled GeoTIFF (16-bit, Deflate, predictor 2):
 * a full-resolution level and one 2× overview, as GDAL lays out a COG.
 */
function tinyCog(full: number[][], tile: number, pixel: number, origin: [number, number]) {
  const levels = [
    full,
    full.filter((_, y) => y % 2 === 0).map((r) => r.filter((_, x) => x % 2 === 0)),
  ];
  const tilesOf = (img: number[][]) => {
    const h = img.length;
    const w = img[0]?.length ?? 0;
    const out: Buffer[] = [];
    for (let ty = 0; ty < Math.ceil(h / tile); ty++)
      for (let tx = 0; tx < Math.ceil(w / tile); tx++) {
        const px = new Uint16Array(tile * tile);
        for (let y = 0; y < tile; y++)
          for (let x = 0; x < tile; x++)
            px[y * tile + x] = img[ty * tile + y]?.[tx * tile + x] ?? 0;
        // Predictor 2: store differences along each row.
        for (let y = 0; y < tile; y++)
          for (let x = tile - 1; x > 0; x--)
            px[y * tile + x] =
              ((px[y * tile + x] as number) - (px[y * tile + x - 1] as number)) & 0xffff;
        out.push(deflateSync(Buffer.from(px.buffer)));
      }
    return out;
  };
  const tileData = levels.map(tilesOf);
  // Layout: header (8) | IFDs | extra arrays | tile data.
  type Entry = [number, number, number[]];
  const ifdEntries = (lvl: number, offsets: number[], counts: number[]): Entry[] => {
    const img = levels[lvl] as number[][];
    const e: Entry[] = [
      [254, 4, [lvl === 0 ? 0 : 1]],
      [256, 3, [img[0]?.length ?? 0]],
      [257, 3, [img.length]],
      [258, 3, [16]],
      [259, 3, [8]],
      [277, 3, [1]],
      [317, 3, [2]],
      [322, 3, [tile]],
      [323, 3, [tile]],
      [324, 4, offsets],
      [325, 4, counts],
      [339, 3, [1]],
    ];
    if (lvl === 0) {
      e.push([33550, 12, [pixel, pixel, 0]]);
      e.push([33922, 12, [0, 0, 0, origin[0], origin[1], 0]]);
    }
    return e;
  };
  const size: Record<number, number> = { 3: 2, 4: 4, 12: 8 };
  // First pass to know sizes, second to fill offsets.
  const build = (dataStart: number) => {
    const parts: Buffer[] = [];
    const header = Buffer.alloc(8);
    header.write('II', 0, 'latin1');
    header.writeUInt16LE(42, 2);
    header.writeUInt32LE(8, 4);
    parts.push(header);
    let pos = 8;
    const extras: Buffer[] = [];
    let dataPos = dataStart;
    const ifdBufs: Buffer[] = [];
    const entriesPerLevel = levels.map((_, lvl) => {
      const tiles = tileData[lvl] as Buffer[];
      const offsets: number[] = [];
      for (const t of tiles) {
        offsets.push(dataPos);
        dataPos += t.length;
      }
      return ifdEntries(
        lvl,
        offsets,
        tiles.map((t) => t.length),
      );
    });
    const ifdSizes = entriesPerLevel.map((e) => 2 + e.length * 12 + 4);
    let extraPos = 8 + ifdSizes.reduce((a, b) => a + b, 0);
    entriesPerLevel.forEach((entries, lvl) => {
      const b = Buffer.alloc(ifdSizes[lvl] as number);
      b.writeUInt16LE(entries.length, 0);
      entries.forEach(([tag, type, values], i) => {
        const o = 2 + i * 12;
        b.writeUInt16LE(tag, o);
        b.writeUInt16LE(type, o + 2);
        b.writeUInt32LE(values.length, o + 4);
        const bytes = (size[type] as number) * values.length;
        const vb = Buffer.alloc(bytes);
        values.forEach((v, k) => {
          if (type === 3) vb.writeUInt16LE(v, k * 2);
          else if (type === 4) vb.writeUInt32LE(v, k * 4);
          else vb.writeDoubleLE(v, k * 8);
        });
        if (bytes <= 4) vb.copy(b, o + 8);
        else {
          b.writeUInt32LE(extraPos, o + 8);
          extras.push(vb);
          extraPos += bytes;
        }
      });
      pos += b.length;
      b.writeUInt32LE(lvl + 1 < levels.length ? pos : 0, b.length - 4);
      ifdBufs.push(b);
    });
    return { buf: Buffer.concat([...parts, ...ifdBufs, ...extras]), dataPos };
  };
  const first = build(0);
  const { buf } = build(first.buf.length);
  return Buffer.concat([buf, ...tileData.flat()]);
}

const FULL = Array.from({ length: 8 }, (_, y) =>
  Array.from({ length: 8 }, (_, x) => 100 * y + x + 1),
);

function getter(file: Buffer, log: string[] = []) {
  return async (_url: string, start: number, end: number) => {
    log.push(`${start}-${end}`);
    return file.subarray(start, end + 1);
  };
}

describe('cog reader', () => {
  const file = tinyCog(FULL, 4, 10, [500000, 4800000]);

  it('reads the levels and the georeferencing', async () => {
    const cog = await openCog('mem', getter(file), 64);
    expect(cog.levels.map((l) => l.width)).toEqual([8, 4]);
    expect(cog.pixelSize).toBe(10);
    expect([cog.originX, cog.originY]).toEqual([500000, 4800000]);
    expect(levelFor(cog, 20)).toBe(1);
    expect(levelFor(cog, 10)).toBe(0);
    expect(levelFor(cog, 5)).toBe(0);
  });

  it('reads a window across tiles, with Deflate and the predictor undone', async () => {
    const cog = await openCog('mem', getter(file));
    const w = await readWindow(cog, 0, 2, 3, 4, 2, getter(file));
    expect([...w]).toEqual([303, 304, 305, 306, 403, 404, 405, 406]);
    const ov = await readWindow(cog, 1, 0, 0, 4, 4, getter(file));
    expect([...ov.subarray(0, 4)]).toEqual([1, 3, 5, 7]);
    expect(ov[4]).toBe(201);
  });

  it('leaves pixels outside the image at 0 (nodata)', async () => {
    const cog = await openCog('mem', getter(file));
    const w = await readWindow(cog, 0, 6, 6, 4, 4, getter(file));
    expect([...w.subarray(0, 4)]).toEqual([607, 608, 0, 0]);
    expect(w[15]).toBe(0);
  });

  it('merges close byte ranges into one request', () => {
    expect(
      mergeRanges(
        [
          { offset: 100, length: 50 },
          { offset: 0, length: 100 },
          { offset: 1000, length: 10 },
          { offset: 200, length: 0 },
        ],
        100,
      ),
    ).toEqual([
      { start: 0, end: 149 },
      { start: 1000, end: 1009 },
    ]);
  });

  it('undoes horizontal differencing with wrap-around', () => {
    const a = new Uint16Array([10, 65535, 2, 5, 1, 1]);
    unpredict(a, 3, 2);
    expect([...a]).toEqual([10, 9, 11, 5, 6, 7]);
  });
});
