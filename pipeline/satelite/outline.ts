// Outline of Galicia for clipping the satellite mosaic: the autonomous
// community from the IGN INSPIRE administrative units WFS (CC BY 4.0,
// "AccessConstraints: CC BY 4.0 ign.es", checked 2026-11-01), simplified to
// ~10 m (z13 pixels are ~14 m) and kept in the repository (galicia-ign.geojson) so the monthly job
// depends on no other service. Regenerate with:
//
//   npx tsx pipeline/satelite/outline.ts
//
// An IGN outline (instead of the IET concello polygons, CC BY-SA) keeps the
// two satellite layers in the ODbL collection.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchWithRetry } from '../lib/http.ts';

export const OUTLINE_URL =
  'https://www.ign.es/wfs-inspire/unidades-administrativas?service=WFS&version=2.0.0' +
  '&request=GetFeature&typeNames=au:AdministrativeUnit' +
  '&resourceId=AU_ADMINISTRATIVEUNIT_34120000000&srsName=urn:ogc:def:crs:EPSG::4326';

export const OUTLINE_FILE = join(import.meta.dirname, 'galicia-ign.geojson');

type Ring = number[][];

/**
 * Polygons of a GML MultiSurface in EPSG:4326 (urn axis order: lat, lon),
 * as GeoJSON rings ([lon, lat]). Interior rings are kept as holes.
 */
export function parseGmlPolygons(xml: string): Ring[][] {
  const polygons: Ring[][] = [];
  for (const m of xml.matchAll(/<gml:Polygon\b[^>]*>([\s\S]*?)<\/gml:Polygon>/g)) {
    const rings: Ring[] = [];
    const body = m[1] ?? '';
    for (const r of body.matchAll(
      /<gml:(exterior|interior)>[\s\S]*?<gml:posList[^>]*>([^<]*)<\/gml:posList>/g,
    )) {
      const n = (r[2] ?? '').trim().split(/\s+/).map(Number);
      const ring: Ring = [];
      for (let i = 0; i + 1 < n.length; i += 2) ring.push([n[i + 1] as number, n[i] as number]);
      if (r[1] === 'exterior') rings.unshift(ring);
      else rings.push(ring);
    }
    if (rings.length) polygons.push(rings);
  }
  return polygons;
}

/** Douglas–Peucker on a closed ring (tolerance in degrees); keeps the closing point. */
export function simplifyRing(ring: Ring, tol: number): Ring {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  // Split at the point farthest from the first, so a closed ring has a real chord.
  let far = 1;
  let best = -1;
  const [x0, y0] = ring[0] as number[];
  for (let i = 1; i < ring.length - 1; i++) {
    const [x, y] = ring[i] as number[];
    const d = ((x as number) - (x0 as number)) ** 2 + ((y as number) - (y0 as number)) ** 2;
    if (d > best) [best, far] = [d, i];
  }
  keep[far] = 1;
  const stack: Array<[number, number]> = [
    [0, far],
    [far, ring.length - 1],
  ];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = ring[a] as [number, number];
    const [bx, by] = ring[b] as [number, number];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let idx = -1;
    let max = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i] as [number, number];
      const d =
        len === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > max) [max, idx] = [d, i];
    }
    if (idx >= 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

/** Simplify every ring; rings left with fewer than 4 points (tiny islets) are dropped. */
export function simplifyPolygons(polygons: Ring[][], tol: number): Ring[][] {
  const out: Ring[][] = [];
  for (const [outer, ...holes] of polygons) {
    const ext = outer ? simplifyRing(outer, tol) : [];
    if (ext.length < 4) continue;
    out.push([ext, ...holes.map((r) => simplifyRing(r, tol)).filter((r) => r.length >= 4)]);
  }
  return out;
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** Read the committed outline (MultiPolygon). */
export async function loadOutline(file = OUTLINE_FILE): Promise<Ring[][]> {
  const fc = JSON.parse(await readFile(file, 'utf8')) as {
    features: Array<{ geometry: { type: string; coordinates: Ring[][] } }>;
  };
  const g = fc.features[0]?.geometry;
  if (g?.type !== 'MultiPolygon' || g.coordinates.length === 0) {
    throw new Error(`${file}: no MultiPolygon`);
  }
  return g.coordinates;
}

async function main() {
  const res = await fetchWithRetry(OUTLINE_URL, { timeoutMs: 180_000 });
  const polygons = simplifyPolygons(parseGmlPolygons(res.body.toString('utf8')), 0.0001);
  if (polygons.length < 100) throw new Error(`only ${polygons.length} polygons: unexpected answer`);
  const fc = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          nome: 'Galicia',
          fonte: 'IGN, WFS INSPIRE unidades administrativas (AU_ADMINISTRATIVEUNIT_34120000000)',
          licenza: 'CC BY 4.0 ign.es',
          url: OUTLINE_URL,
          descargado: new Date().toISOString().slice(0, 10),
          simplificado: 'Douglas–Peucker 0,0001° (~10 m)',
        },
        geometry: {
          type: 'MultiPolygon',
          coordinates: polygons.map((p) =>
            p.map((r) => r.map(([x, y]) => [round(x as number), round(y as number)])),
          ),
        },
      },
    ],
  };
  await writeFile(OUTLINE_FILE, `${JSON.stringify(fc)}\n`);
  const points = polygons.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
  console.log(`${OUTLINE_FILE}: ${polygons.length} polygons, ${points} points`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
