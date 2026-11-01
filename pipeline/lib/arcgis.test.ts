import { describe, expect, it } from 'vitest';
import type { LayerDef } from './adapter.ts';
import {
  cleanGeometry,
  esriToGeoJSON,
  fetchLayer,
  mergeLineParts,
  num,
  queryUrl,
  simplifyLine,
  str,
  tidyLines,
} from './arcgis.ts';

const layer = { id: 'x' } as unknown as LayerDef;

function ctxWith(pages: unknown[]) {
  const requested: string[] = [];
  return {
    requested,
    ctx: {
      layer,
      now: new Date(),
      env: {},
      async get(url: string) {
        requested.push(url);
        const body = Buffer.from(JSON.stringify(pages[requested.length - 1]));
        return {
          url,
          status: 200,
          notModified: false,
          body,
          headers: {},
          etag: null,
          lastModified: null,
          attempts: 1,
        };
      },
    },
  };
}

describe('arcgis helpers', () => {
  it('builds a GeoJSON query in EPSG:4326 with optional generalisation', () => {
    const u = queryUrl('https://h/MapServer/3', 2000, {
      maxAllowableOffset: 0.0005,
      pageSize: 500,
    });
    expect(u).toContain('MapServer/3/query?resultOffset=2000&resultRecordCount=500');
    expect(u).toContain('outSR=4326');
    expect(u).toContain('maxAllowableOffset=0.0005');
    expect(u).toContain('f=geojson');
    expect(queryUrl('https://h/MapServer/3', 0)).not.toContain('maxAllowableOffset');
  });

  it('follows exceededTransferLimit and stops on the last page', async () => {
    const f = { type: 'Feature', geometry: null, properties: {} };
    const { ctx, requested } = ctxWith([
      { type: 'FeatureCollection', features: [f, f], exceededTransferLimit: true },
      { type: 'FeatureCollection', features: [f] },
    ]);
    const pages = await fetchLayer(ctx, 'https://h/MapServer/0');
    expect(pages).toHaveLength(2);
    expect(requested[1]).toContain('resultOffset=2&');
  });

  it('throws on service errors and on empty pages that promise more', async () => {
    await expect(fetchLayer(ctxWith([{ error: { message: 'boom' } }]).ctx, 'u')).rejects.toThrow(
      /boom/,
    );
    await expect(
      fetchLayer(
        ctxWith([{ type: 'FeatureCollection', features: [], exceededTransferLimit: true }]).ctx,
        'u',
      ),
    ).rejects.toThrow(/empty page/);
  });

  it('cuts geometry to 2D, rounds it and drops repeated vertices', () => {
    expect(cleanGeometry({ type: 'Point', coordinates: [-8.123456, 42.987654, 0, null] })).toEqual({
      type: 'Point',
      coordinates: [-8.12346, 42.98765],
    });
    expect(
      cleanGeometry({
        type: 'LineString',
        coordinates: [
          [1.000001, 2],
          [1.000002, 2],
          [3, 4],
        ],
      }),
    ).toEqual({
      type: 'LineString',
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(cleanGeometry(null)).toBeNull();
  });

  it('cleans strings and numbers', () => {
    expect(str('  a   b ')).toBe('a b');
    expect(str('-')).toBeNull();
    expect(num('1,256', 1)).toBe(1.3);
    expect(num(null)).toBeNull();
  });
});

describe('esriToGeoJSON', () => {
  it('turns clockwise outer rings and counter-clockwise holes into a GeoJSON polygon', () => {
    const outer = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ];
    const hole = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
      [2, 2],
    ];
    const g = esriToGeoJSON({ rings: [outer, hole] });
    expect(g?.type).toBe('Polygon');
    const rings = g?.coordinates as number[][][];
    expect(rings).toHaveLength(2);
    expect(rings[0]).toEqual([...outer].reverse());
  });

  it('makes a MultiPolygon from two outer rings and handles paths and points', () => {
    const sq = (o: number) => [
      [o, 0],
      [o, 1],
      [o + 1, 1],
      [o + 1, 0],
      [o, 0],
    ];
    expect(esriToGeoJSON({ rings: [sq(0), sq(5)] })?.type).toBe('MultiPolygon');
    expect(
      esriToGeoJSON({
        paths: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      })?.type,
    ).toBe('LineString');
    expect(esriToGeoJSON({ x: 1, y: 2 })).toEqual({ type: 'Point', coordinates: [1, 2] });
    expect(esriToGeoJSON(null)).toBeNull();
  });
});

describe('line clean-up', () => {
  it('chains two-point parts in any order and simplifies straight runs', () => {
    const parts = [
      [
        [1, 0],
        [2, 0],
      ],
      [
        [0, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [3, 1],
      ],
    ];
    expect(mergeLineParts(parts)).toEqual([
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 1],
      ],
    ]);
    expect(tidyLines({ type: 'MultiLineString', coordinates: parts }, 0.1)).toEqual({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [2, 0],
        [3, 1],
      ],
    });
  });

  it('keeps separate chains apart', () => {
    const g = tidyLines(
      {
        type: 'MultiLineString',
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
          [
            [5, 5],
            [6, 6],
          ],
        ],
      },
      0.1,
    );
    expect(g?.type).toBe('MultiLineString');
    expect(simplifyLine([[0, 0]], 1)).toEqual([[0, 0]]);
  });
});
