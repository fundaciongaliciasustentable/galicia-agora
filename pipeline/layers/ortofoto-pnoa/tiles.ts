// Which Web Mercator tiles to fetch: those that touch Galicia, not its whole
// bounding box (the box is ~60 % larger, mostly sea, Asturias, León and
// Portugal). The land mask is the union of the concello polygons; a tile is
// kept when its centre falls inside a polygon or a polygon edge crosses it,
// plus a margin of `buffer` tiles around every edge so simplified coastlines
// and islets are not cut. Computed at the deepest zoom; a parent is kept
// when any of its children is (exactly the tiles that touch the mask).

import type { Bbox, Tile } from '../../lib/raster.ts';

/** A polygon as rings of [lon, lat]: the first is the outer ring, the rest holes. */
export type Rings = number[][][];

interface GeoJsonLike {
  features: Array<{
    properties?: Record<string, unknown> | null;
    geometry: { type: string; coordinates: unknown } | null;
  }>;
}

/** Polygons of a FeatureCollection, optionally only features matching a property value. */
export function polygonsOf(fc: GeoJsonLike, where?: [string, unknown]): Rings[] {
  const out: Rings[] = [];
  for (const f of fc.features) {
    if (where && f.properties?.[where[0]] !== where[1]) continue;
    const g = f.geometry;
    if (g?.type === 'Polygon') out.push(g.coordinates as Rings);
    else if (g?.type === 'MultiPolygon') out.push(...(g.coordinates as Rings[]));
  }
  return out;
}

/** Fractional tile coordinates of a lon/lat at zoom z (no clamping). */
export function project(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [
    ((lon + 180) / 360) * n,
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n,
  ];
}

/** Lon/lat bounds of a tile. */
export function tileBounds(t: Tile): Bbox {
  const n = 2 ** t.z;
  const lon = (x: number) => (x / n) * 360 - 180;
  const lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { west: lon(t.x), east: lon(t.x + 1), north: lat(t.y), south: lat(t.y + 1) };
}

const key = (x: number, y: number) => x * 2 ** 26 + y;

/** Tiles at zoom z that touch any of the polygons (see the file comment). */
export function coverAtZoom(polygons: Rings[], z: number, buffer = 1): Array<[number, number]> {
  const n = 2 ** z;
  const seen = new Set<number>();
  const add = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < n && y < n) seen.add(key(x, y));
  };
  for (const poly of polygons) {
    const rings = poly.map((ring) => ring.map(([lon, lat]) => project(lon ?? 0, lat ?? 0, z)));
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    // Edges: sample every quarter tile so no crossed tile is skipped.
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i] as [number, number];
        const [x2, y2] = ring[(i + 1) % ring.length] as [number, number];
        minY = Math.min(minY, y1);
        maxY = Math.max(maxY, y1);
        const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 4));
        for (let s = 0; s <= steps; s++) {
          const tx = Math.floor(x1 + ((x2 - x1) * s) / steps);
          const ty = Math.floor(y1 + ((y2 - y1) * s) / steps);
          for (let dx = -buffer; dx <= buffer; dx++) {
            for (let dy = -buffer; dy <= buffer; dy++) add(tx + dx, ty + dy);
          }
        }
      }
    }
    // Interior: even-odd scanline through each tile row's centre, per polygon
    // (holes included), so shared borders between concellos never cancel out.
    for (let row = Math.max(0, Math.floor(minY)); row <= Math.min(n - 1, Math.floor(maxY)); row++) {
      const cy = row + 0.5;
      const xs: number[] = [];
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const [x1, y1] = ring[i] as [number, number];
          const [x2, y2] = ring[(i + 1) % ring.length] as [number, number];
          if (y1 > cy !== y2 > cy) xs.push(x1 + ((cy - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const from = Math.ceil((xs[i] as number) - 0.5);
        const to = Math.floor((xs[i + 1] as number) - 0.5);
        for (let col = from; col <= to; col++) add(col, row);
      }
    }
  }
  return [...seen]
    .map((k): [number, number] => [Math.floor(k / 2 ** 26), k % 2 ** 26])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/**
 * Tiles touching the polygons for every zoom in [minzoom, maxzoom], lowest
 * zoom first (the fetch order: a partial run still completes whole zooms).
 */
export function coverTiles(
  polygons: Rings[],
  minzoom: number,
  maxzoom: number,
  buffer = 1,
): Tile[] {
  const byZoom = new Map<number, Array<[number, number]>>();
  byZoom.set(maxzoom, coverAtZoom(polygons, maxzoom, buffer));
  for (let z = maxzoom - 1; z >= minzoom; z--) {
    const parents = new Set<number>();
    for (const [x, y] of byZoom.get(z + 1) ?? []) parents.add(key(x >> 1, y >> 1));
    byZoom.set(
      z,
      [...parents]
        .map((k): [number, number] => [Math.floor(k / 2 ** 26), k % 2 ** 26])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    );
  }
  const out: Tile[] = [];
  for (let z = minzoom; z <= maxzoom; z++) {
    for (const [x, y] of byZoom.get(z) ?? []) out.push({ z, x, y });
  }
  return out;
}

/** Union of the bounds of a set of tiles. */
export function boundsOf(tiles: Tile[]): Bbox {
  const b = { west: 180, south: 90, east: -180, north: -90 };
  for (const t of tiles) {
    const tb = tileBounds(t);
    b.west = Math.min(b.west, tb.west);
    b.south = Math.min(b.south, tb.south);
    b.east = Math.max(b.east, tb.east);
    b.north = Math.max(b.north, tb.north);
  }
  return b;
}
