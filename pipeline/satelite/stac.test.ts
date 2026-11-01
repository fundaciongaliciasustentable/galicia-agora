import { describe, expect, it } from 'vitest';
import {
  clearShare,
  monthInterval,
  previousMonth,
  type Scene,
  searchScenes,
  searchUrl,
  selectScenes,
  toScene,
} from './stac.ts';

const BBOX = { west: -9.35, south: 41.8, east: -6.7, north: 43.8 };

function item(id: string, tile: string, datetime: string, cloud: number, nodata = 0, seq = 0) {
  const asset = (name: string) => ({
    href: `https://sentinel-cogs.s3.us-west-2.amazonaws.com/x/${id}/${name}.tif`,
    'raster:bands': [{ scale: 0.0001, offset: -0.1 }],
  });
  return {
    id,
    properties: {
      'grid:code': `MGRS-${tile}`,
      'proj:epsg': 32629,
      datetime,
      'eo:cloud_cover': cloud,
      's2:nodata_pixel_percentage': nodata,
      's2:sequence': String(seq),
      'earthsearch:boa_offset_applied': true,
    },
    assets: {
      red: asset('B04'),
      green: asset('B03'),
      blue: asset('B02'),
      nir: asset('B08'),
      scl: asset('SCL'),
    },
  };
}

function scene(id: string, tile: string, day: number, cloud: number, nodata = 0, seq = 0): Scene {
  const s = toScene(
    item(id, tile, `2026-09-${String(day).padStart(2, '0')}T11:39:40Z`, cloud, nodata, seq),
  );
  if (!s) throw new Error('bad fixture');
  return s;
}

describe('month handling', () => {
  it('builds the month interval, leap years included', () => {
    expect(monthInterval('2026-09')).toBe('2026-09-01T00:00:00Z/2026-09-30T23:59:59Z');
    expect(monthInterval('2028-02')).toBe('2028-02-01T00:00:00Z/2028-02-29T23:59:59Z');
    expect(() => monthInterval('2026-13')).toThrow();
  });

  it('defaults to the month just ended', () => {
    expect(previousMonth(new Date('2026-11-03T03:00:00Z'))).toBe('2026-10');
    expect(previousMonth(new Date('2027-01-03T03:00:00Z'))).toBe('2026-12');
  });

  it('queries Earth Search with the bbox and month', () => {
    const u = new URL(searchUrl('2026-09', BBOX));
    expect(u.origin + u.pathname).toBe('https://earth-search.aws.element84.com/v1/search');
    expect(u.searchParams.get('collections')).toBe('sentinel-2-l2a');
    expect(u.searchParams.get('bbox')).toBe('-9.35,41.8,-6.7,43.8');
  });
});

describe('toScene', () => {
  it('reads tile and scale, and drops the offset Earth Search already applied', () => {
    const s = scene('S2A_29TNH_20260930_1_L2A', '29TNH', 30, 10);
    expect(s.tile).toBe('29TNH');
    expect(s.scale.red).toBe(0.0001);
    expect(s.offset.red).toBe(0);
    expect(s.hrefs.scl).toMatch(/SCL\.tif$/);
  });

  it('keeps the listed offset when the catalogue did not apply it', () => {
    const it = item('x', '29TNH', '2026-09-01T00:00:00Z', 0);
    it.properties['earthsearch:boa_offset_applied'] = false;
    expect(toScene(it)?.offset.red).toBe(-0.1);
  });

  it('drops items without an https asset', () => {
    const it = item('x', '29TNH', '2026-09-01T00:00:00Z', 0);
    (it.assets as Record<string, unknown>).scl = { href: 's3://bucket/SCL.jp2' };
    expect(toScene(it)).toBeNull();
  });
});

describe('searchScenes', () => {
  it('follows next links until a page is empty', async () => {
    const pages: Record<string, unknown> = {
      first: {
        features: [item('a', '29TNH', '2026-09-01T00:00:00Z', 5)],
        links: [{ rel: 'next', href: 'second', method: 'GET' }],
      },
      second: {
        features: [item('b', '29TNG', '2026-09-02T00:00:00Z', 5)],
        links: [{ rel: 'next', href: 'third' }],
      },
      third: { features: [], links: [{ rel: 'next', href: 'fourth' }] },
    };
    const seen: string[] = [];
    const out = await searchScenes('2026-09', BBOX, async (url) => {
      const key = url.startsWith('https://') ? 'first' : url;
      seen.push(key);
      return pages[key];
    });
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
    expect(seen).toEqual(['first', 'second', 'third']);
  });
});

describe('selectScenes', () => {
  it('keeps the clearest scenes per tile, and the latest reprocessing of each', () => {
    const scenes = [
      scene('n-clear', '29TNH', 3, 2),
      scene('n-cloudy', '29TNH', 8, 95),
      scene('n-edge', '29TNH', 13, 0, 80),
      scene('n-mid', '29TNH', 18, 40),
      scene('n-mid-v1', '29TNH', 18, 30, 0, 1),
      scene('g-only', '29TNG', 5, 70),
    ];
    const sel = selectScenes(scenes, { maxScenes: 2, minClear: 0.1 });
    expect([...sel.keys()]).toEqual(['29TNG', '29TNH']);
    expect(sel.get('29TNH')?.map((s) => s.id)).toEqual(['n-clear', 'n-mid-v1']);
    expect(sel.get('29TNG')?.map((s) => s.id)).toEqual(['g-only']);
  });

  it('weights cloud by the share of the tile with data', () => {
    expect(clearShare({ cloud: 50, nodata: 50 })).toBeCloseTo(0.25);
    expect(clearShare({ cloud: 100, nodata: 0 })).toBe(0);
  });

  it('breaks ties towards the later date', () => {
    const sel = selectScenes([scene('early', '29TNH', 2, 10), scene('late', '29TNH', 20, 10)], {
      maxScenes: 1,
      minClear: 0,
    });
    expect(sel.get('29TNH')?.[0]?.id).toBe('late');
  });
});
