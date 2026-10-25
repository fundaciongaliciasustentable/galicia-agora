// Shops and everyday services in Galicia from OpenStreetMap (Geofabrik daily extract, ~112 MB PBF).
//
// The PBF is written to a temporary directory and processed with the osmium CLI (osmium-tool):
//   osmium fileinfo -g header.option.osmosis_replication_timestamp galicia.osm.pbf
//   osmium tags-filter galicia.osm.pbf nwr/shop nwr/amenity=<AMENITIES> -o filtered.osm.pbf
//   osmium export filtered.osm.pbf -c export-config.json -f geojsonseq --add-unique-id=type_id
//     -o pois.geojsonseq
// Nodes become points; closed ways and multipolygon relations become polygons and are reduced to
// their area-weighted centroid here; the few open ways use the mean of their vertices.
//
// The extract has a margin outside Galicia (Asturias, León, Zamora, northern Portugal), so each
// point is kept only if it falls inside, or within TOLERANCE_M of, a concello polygon of the
// published concellos-parroquias layer (<DATA_OUT_DIR>/concellos-parroquias/data.geojson).
// Without that file, the adapter falls back to the Galicia bounding box, which lets a few border
// features through (49 more points on 2026-10-25, most of them Galician piers and lonxas).
//
// Only business data is kept: name, category, brand, opening hours and website. Phones, emails,
// addresses and every other tag are dropped.

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  type Adapter,
  type AdapterContext,
  type Feature,
  inGalicia,
  point,
} from '../../lib/adapter.ts';

export const URL = 'https://download.geofabrik.de/europe/spain/galicia-latest.osm.pbf';

const DOWNLOAD_TIMEOUT_MS = 600_000;
/** Record separator that GeoJSON text sequences (RFC 8142) may put before each feature. */
const RS = String.fromCharCode(0x1e);
const execFileP = promisify(execFile);

export type Categoria = 'alimentación' | 'hostalaría' | 'servizos' | 'outros comercios';

/** amenity=* values kept, by category. */
export const AMENITY: Record<string, Categoria> = {
  restaurant: 'hostalaría',
  cafe: 'hostalaría',
  bar: 'hostalaría',
  pub: 'hostalaría',
  fast_food: 'hostalaría',
  ice_cream: 'hostalaría',
  biergarten: 'hostalaría',
  bank: 'servizos',
  atm: 'servizos',
  post_office: 'servizos',
  fuel: 'servizos',
  pharmacy: 'servizos',
  marketplace: 'servizos',
};

/** shop=* values with their own category; any other shop value is «outros comercios». */
export const SHOP: Record<string, Categoria> = {
  supermarket: 'alimentación',
  convenience: 'alimentación',
  general: 'alimentación',
  bakery: 'alimentación',
  pastry: 'alimentación',
  confectionery: 'alimentación',
  chocolate: 'alimentación',
  butcher: 'alimentación',
  greengrocer: 'alimentación',
  seafood: 'alimentación',
  deli: 'alimentación',
  cheese: 'alimentación',
  dairy: 'alimentación',
  farm: 'alimentación',
  frozen_food: 'alimentación',
  health_food: 'alimentación',
  coffee: 'alimentación',
  tea: 'alimentación',
  beverages: 'alimentación',
  wine: 'alimentación',
  alcohol: 'alimentación',
  hairdresser: 'servizos',
  car_repair: 'servizos',
};

/** shop values that mean there is no shop. */
export const NO_SHOP = new Set(['vacant', 'no', 'none', 'disused', 'closed', 'empty', 'abandoned']);

/** Arguments of `osmium tags-filter` after the input file. */
export const TAGS_FILTER = ['nwr/shop', `nwr/amenity=${Object.keys(AMENITY).join(',')}`];

/** `osmium export` config: no metadata, closed ways as areas, open ways as lines. */
export const EXPORT_CONFIG = {
  attributes: { type: false, id: false, version: false, changeset: false, timestamp: false },
  format_options: { print_record_separator: false },
  linear_tags: false,
  area_tags: true,
};

export interface Raw {
  /** GeoJSON text sequence written by osmium export (one Feature per line). */
  geojsonseq: string;
  /** osmosis_replication_timestamp from the PBF header, or null. */
  replicationTimestamp: string | null;
  /** Last-Modified header of the PBF (HTTP date), or null. */
  lastModified: string | null;
  /** Concello polygons of concellos-parroquias, or null if not available locally. */
  concellos: ConcelloPolygon[] | null;
  /** Bytes of the PBF and peak bytes in the temporary directory (for logs and reports). */
  pbfBytes: number;
  tmpBytes: number;
}

type Ring = number[][];
type Poly = Ring[];

export interface ConcelloPolygon {
  nome: string;
  codigo_ine: string;
  polygons: Poly[];
  bbox: [number, number, number, number];
}

async function osmium(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileP('osmium', args, { maxBuffer: 64 << 20 });
    return stdout;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('osmium CLI not found: install osmium-tool (apt or brew)');
    }
    throw err;
  }
}

export function osmiumAvailable(): Promise<boolean> {
  return osmium(['--version']).then(
    () => true,
    () => false,
  );
}

/** Run osmium over a PBF on disk and return the exported GeoJSON sequence. */
export async function extractPois(
  pbfPath: string,
  workDir: string,
): Promise<{ geojsonseq: string; replicationTimestamp: string | null; tmpBytes: number }> {
  const header = (
    await osmium(['fileinfo', '-g', 'header.option.osmosis_replication_timestamp', pbfPath])
  ).trim();
  const filtered = join(workDir, 'filtered.osm.pbf');
  const config = join(workDir, 'export-config.json');
  const out = join(workDir, 'pois.geojsonseq');
  await osmium(['tags-filter', pbfPath, ...TAGS_FILTER, '-o', filtered, '--overwrite']);
  await writeFile(config, JSON.stringify(EXPORT_CONFIG));
  await osmium([
    'export',
    filtered,
    '-c',
    config,
    '-f',
    'geojsonseq',
    '--add-unique-id=type_id',
    '-o',
    out,
    '--overwrite',
  ]);
  let tmpBytes = 0;
  for (const f of [pbfPath, filtered, out]) tmpBytes += (await stat(f)).size;
  return {
    geojsonseq: await readFile(out, 'utf8'),
    replicationTimestamp: /^\d{4}-\d{2}-\d{2}T[\d:]+Z$/.test(header) ? header : null,
    tmpBytes,
  };
}

/** Concello polygons from a concellos-parroquias GeoJSON (nivel = concello only). */
export function concelloPolygons(fc: unknown): ConcelloPolygon[] {
  const features = (fc as { features?: Feature[] })?.features;
  if (!Array.isArray(features)) throw new Error('concellos-parroquias: not a FeatureCollection');
  const out: ConcelloPolygon[] = [];
  for (const f of features) {
    if (f.properties?.nivel !== 'concello' || !f.geometry) continue;
    const g = f.geometry;
    const polygons: Poly[] =
      g.type === 'Polygon'
        ? [g.coordinates as Poly]
        : g.type === 'MultiPolygon'
          ? (g.coordinates as Poly[])
          : [];
    if (!polygons.length) continue;
    const bbox: [number, number, number, number] = [180, 90, -180, -90];
    for (const p of polygons) {
      for (const [x, y] of p[0] ?? []) {
        bbox[0] = Math.min(bbox[0], x as number);
        bbox[1] = Math.min(bbox[1], y as number);
        bbox[2] = Math.max(bbox[2], x as number);
        bbox[3] = Math.max(bbox[3], y as number);
      }
    }
    out.push({
      nome: String(f.properties.nome ?? ''),
      codigo_ine: String(f.properties.codigo_ine ?? ''),
      polygons,
      bbox,
    });
  }
  return out;
}

async function loadConcellos(ctx: AdapterContext): Promise<ConcelloPolygon[] | null> {
  const dir = ctx.env.DATA_OUT_DIR ?? 'data-out';
  try {
    const text = await readFile(join(dir, 'concellos-parroquias', 'data.geojson'), 'utf8');
    const polys = concelloPolygons(JSON.parse(text));
    return polys.length ? polys : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Even-odd ray casting over all rings (outer ring and holes). */
function inPolygon(x: number, y: number, poly: Poly): boolean {
  let inside = false;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Distance in metres from a point to the boundary of a polygon (equirectangular, short range). */
function distanceToBoundary(lon: number, lat: number, poly: Poly): number {
  const kx = Math.cos((lat * Math.PI) / 180) * 111_320;
  const ky = 110_540;
  let best = Number.POSITIVE_INFINITY;
  for (const ring of poly) {
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1] as [number, number];
      const [bx, by] = ring[i] as [number, number];
      const px = (lon - ax) * kx;
      const py = (lat - ay) * ky;
      const vx = (bx - ax) * kx;
      const vy = (by - ay) * ky;
      const len2 = vx * vx + vy * vy;
      const t = len2 ? Math.max(0, Math.min(1, (px * vx + py * vy) / len2)) : 0;
      best = Math.min(best, Math.hypot(px - t * vx, py - t * vy));
    }
  }
  return best;
}

/**
 * Concello containing the point or, failing that, the nearest one within TOLERANCE_M. The
 * concello polygons follow the coastline loosely, so piers, fish markets (lonxas) and marinas
 * fall a few tens of metres outside; points across the Miño or the Asturian border lie further.
 */
export const TOLERANCE_M = 100;

export function findConcello(
  lon: number,
  lat: number,
  concellos: ConcelloPolygon[],
  toleranceM = TOLERANCE_M,
): ConcelloPolygon | null {
  for (const c of concellos) {
    const [w, s, e, n] = c.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    if (c.polygons.some((p) => inPolygon(lon, lat, p))) return c;
  }
  // 0.002° is more than 100 m in latitude and longitude at Galician latitudes.
  const pad = (toleranceM / 100) * 0.002;
  let nearest: ConcelloPolygon | null = null;
  let best = toleranceM;
  for (const c of concellos) {
    const [w, s, e, n] = c.bbox;
    if (lon < w - pad || lon > e + pad || lat < s - pad || lat > n + pad) continue;
    for (const p of c.polygons) {
      const d = distanceToBoundary(lon, lat, p);
      if (d <= best) {
        best = d;
        nearest = c;
      }
    }
  }
  return nearest;
}

/** Signed area and centroid of a ring (shoelace). */
function ringCentroid(ring: Ring): { a: number; x: number; y: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j] as [number, number];
    const [x1, y1] = ring[i] as [number, number];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a /= 2;
  return a === 0 ? { a: 0, x: 0, y: 0 } : { a, x: cx / (6 * a), y: cy / (6 * a) };
}

function meanOf(coords: number[][]): [number, number] | null {
  if (!coords.length) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of coords) {
    sx += x as number;
    sy += y as number;
  }
  return [sx / coords.length, sy / coords.length];
}

/** Representative point: the point itself, the area-weighted centroid of areas, or a line mean. */
export function representativePoint(g: Feature['geometry']): [number, number] | null {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates as [number, number];
  if (g.type === 'LineString') return meanOf(g.coordinates as number[][]);
  const polys: Poly[] =
    g.type === 'Polygon'
      ? [g.coordinates as Poly]
      : g.type === 'MultiPolygon'
        ? (g.coordinates as Poly[])
        : [];
  let area = 0;
  let x = 0;
  let y = 0;
  for (const p of polys) {
    for (const [i, ring] of p.entries()) {
      const c = ringCentroid(ring);
      // Outer rings add, holes subtract, whatever their winding.
      const w = i === 0 ? Math.abs(c.a) : -Math.abs(c.a);
      area += w;
      x += c.x * w;
      y += c.y * w;
    }
  }
  if (area > 0) return [x / area, y / area];
  return meanOf(polys[0]?.[0] ?? []);
}

/** First value of a possibly multi-valued tag ("supermarket;convenience" -> "supermarket"). */
function firstValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.split(';')[0]?.trim().toLowerCase() ?? '';
  return t || null;
}

/** Category and source tag ("amenity=cafe", "shop=bakery"), or null if not kept. */
export function categorize(
  tags: Record<string, unknown>,
): { categoria: Categoria; tag: string } | null {
  const amenity = firstValue(tags.amenity);
  if (amenity && AMENITY[amenity]) {
    return { categoria: AMENITY[amenity], tag: `amenity=${amenity}` };
  }
  const shop = firstValue(tags.shop);
  if (!shop || NO_SHOP.has(shop)) return null;
  return { categoria: SHOP[shop] ?? 'outros comercios', tag: `shop=${shop}` };
}

function text(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Website if it is an http(s) URL; bare domains get https://. */
export function website(tags: Record<string, unknown>): string | null {
  const raw = text(tags.website, 500) ?? text(tags['contact:website'], 500) ?? text(tags.url, 500);
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw)
    ? raw
    : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(raw)
      ? `https://${raw}`
      : null;
  if (!candidate || /\s/.test(candidate)) return null;
  try {
    const u = new globalThis.URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

/** osmium unique ids: n<id>, w<id>, a<2·way id> or a<2·relation id + 1> -> n/w/r ids. */
export function osmId(uid: unknown): string | null {
  if (typeof uid !== 'string') return null;
  const m = /^([nwra])(\d+)$/.exec(uid);
  if (!m) return null;
  const [, t, n] = m;
  if (t !== 'a') return `${t}${n}`;
  const v = BigInt(n as string);
  return v % 2n === 0n ? `w${v / 2n}` : `r${(v - 1n) / 2n}`;
}

/** HTTP date -> ISO, or null. */
export function httpDateToIso(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const adapter = {
  async fetch(ctx) {
    const res = await ctx.get(URL, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
    const dir = await mkdtemp(join(tmpdir(), 'comercio-osm-'));
    try {
      const pbf = join(dir, 'galicia.osm.pbf');
      await writeFile(pbf, res.body);
      const pbfBytes = res.body.length;
      const out = await extractPois(pbf, dir);
      return {
        ...out,
        lastModified: res.lastModified,
        concellos: await loadConcellos(ctx),
        pbfBytes,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },

  normalize(raw, _ctx) {
    const byId = new Map<string, Feature>();
    for (const line of raw.geojsonseq.split('\n')) {
      // osmium may still emit an RS (0x1e) prefix depending on version.
      const l = (line.startsWith(RS) ? line.slice(1) : line).trim();
      if (!l) continue;
      const f = JSON.parse(l) as Feature;
      const tags = f.properties ?? {};
      const cat = categorize(tags);
      if (!cat) continue; // referenced nodes and vacant shops
      const id = osmId(f.id);
      if (!id) throw new Error(`Unexpected osmium id: ${String(f.id)}`);
      const p = representativePoint(f.geometry);
      if (!p) continue;
      const [lon, lat] = p;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      // The concello is used only to filter: its name is not published, so no CC BY-SA data
      // from concellos-parroquias ends up in this ODbL file (ADR 0005).
      if (raw.concellos ? !findConcello(lon, lat, raw.concellos) : !inGalicia(lon, lat)) continue;

      byId.set(id, {
        type: 'Feature',
        id,
        geometry: point(lon, lat),
        properties: {
          osm_id: id,
          nome: text(tags.name) ?? text(tags.brand),
          categoria: cat.categoria,
          tag: cat.tag,
          marca: text(tags.brand),
          horario: text(tags.opening_hours, 300),
          web: website(tags),
        },
      });
    }

    const order = (id: string) => `${id[0]}${id.slice(1).padStart(20, '0')}`;
    const features = [...byId.values()].sort((a, b) =>
      order(String(a.id)) < order(String(b.id)) ? -1 : 1,
    );
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: raw.replicationTimestamp ?? httpDateToIso(raw.lastModified),
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
