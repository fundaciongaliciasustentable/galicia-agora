import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PMTiles, type RangeResponse, type Source } from 'pmtiles';
import { describe, expect, it } from 'vitest';
import type { Tile } from '../../lib/raster.ts';
import { tilePath } from './fetch.ts';
import { type Group, packGroup, planGroups, splitGroups } from './pack.ts';

class FileSource implements Source {
  private buf: Buffer;
  constructor(path: string) {
    this.buf = readFileSync(path);
  }
  getKey() {
    return 'file';
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const b = this.buf.subarray(offset, offset + length);
    return { data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
  }
}

async function put(cache: string, t: Tile, ext: string, body: string | Buffer) {
  const p = tilePath(cache, t, ext);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body);
}

const meta = { name: 'proba', attribution: '© Proba' };

describe('packGroup', () => {
  it('streams cached tiles into a readable, deduplicated, deterministic archive', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'orto-'));
    const tiles: Tile[] = [
      { z: 14, x: 7802, y: 6027 },
      { z: 14, x: 7803, y: 6027 },
      { z: 14, x: 7804, y: 6027 },
      { z: 13, x: 3901, y: 3013 },
    ];
    await put(cache, tiles[0] as Tile, 'webp', 'RIFF-sea');
    await put(cache, tiles[1] as Tile, 'webp', 'RIFF-sea'); // identical: stored once
    await put(cache, tiles[2] as Tile, 'none', ''); // service had no tile
    await put(cache, tiles[3] as Tile, 'webp', 'RIFF-land');
    const group: Group = { name: 'z13-14', minzoom: 13, maxzoom: 14, tiles };
    const out = join(cache, 'a.pmtiles');
    const info = packGroup(group, { cache, format: 'webp', out, meta });
    expect(info).toMatchObject({ file: 'a.pmtiles', minzoom: 13, maxzoom: 14, tiles: 3 });
    expect(info.bytes).toBe(readFileSync(out).length);

    const p = new PMTiles(new FileSource(out));
    const h = await p.getHeader();
    expect(h.tileType).toBe(4); // webp
    expect([h.minZoom, h.maxZoom, h.numAddressedTiles, h.numTileContents]).toEqual([13, 14, 3, 2]);
    const got = await p.getZxy(14, 7803, 6027);
    expect(Buffer.from(got?.data ?? new ArrayBuffer(0)).toString()).toBe('RIFF-sea');
    expect(await p.getZxy(14, 7804, 6027)).toBeUndefined();
    expect(await p.getMetadata()).toMatchObject({
      format: 'webp',
      type: 'baselayer',
      attribution: '© Proba',
    });

    const again = packGroup(group, { cache, format: 'webp', out: join(cache, 'b.pmtiles'), meta });
    expect(again.sha256).toBe(info.sha256);
  });

  it('refuses a group with tiles still to fetch', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'orto-'));
    const group: Group = { name: 'z16', minzoom: 16, maxzoom: 16, tiles: [{ z: 16, x: 1, y: 1 }] };
    expect(() =>
      packGroup(group, { cache, format: 'webp', out: join(cache, 'x.pmtiles'), meta }),
    ).toThrow(/not fetched yet/);
  });
});

describe('planGroups and splitGroups', () => {
  const tiles: Tile[] = [];
  for (let z = 14; z <= 16; z++) {
    const n = 2 ** (z - 14) * 4;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) tiles.push({ z, x, y });
  }
  const groups = planGroups(tiles, [
    [6, 14],
    [15, 16],
  ]);

  it('keeps groups under the limit as they are', () => {
    expect(groups.map((g) => [g.name, g.tiles.length])).toEqual([
      ['z6-14', 16],
      ['z15-16', 64 + 256],
    ]);
    expect(splitGroups(groups, () => 1, 1000).map((g) => g.name)).toEqual(['z6-14', 'z15-16']);
  });

  it('splits by zoom first, then a single zoom by whole columns', () => {
    // z15 = 64 bytes, z16 = 256 bytes: the limit of 150 splits z16 in two.
    const out = splitGroups(groups, () => 1, 150);
    expect(out.map((g) => [g.name, g.tiles.length])).toEqual([
      ['z6-14', 16],
      ['z15', 64],
      ['z16-a', 128],
      ['z16-b', 128],
    ]);
    const a = new Set(out[2]?.tiles.map((t) => t.x));
    expect(out[3]?.tiles.some((t) => a.has(t.x))).toBe(false);
  });
});
