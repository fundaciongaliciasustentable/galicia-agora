// Copernicus EFFIS burnt areas (MODIS, current fire season) via WFS GeoJSON.
// The Galicia bbox also returns Portugal, Asturias and Castilla y León, so
// features are kept only when PROVINCE is one of the four Galician provinces.

import { type Adapter, type Feature, round } from '../../lib/adapter.ts';

// WFS 2.0 with urn:ogc:def:crs:EPSG::4326 uses lat,lon axis order in the bbox;
// checked against a real call (longitudes in the response stay within -9.35…-6.6).
export const WFS_URL =
  'https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=GetFeature&version=2.0.0' +
  '&typeNames=ms:modis.ba.poly.season&outputFormat=geojson' +
  '&bbox=41.8,-9.35,43.8,-6.7,urn:ogc:def:crs:EPSG::4326';

// Spellings seen in the EFFIS data are the first of each list; the rest are
// defensive aliases in case the source switches to Spanish exonyms.
const PROVINCES: Record<string, string> = {
  'a coruña': 'A Coruña',
  'la coruña': 'A Coruña',
  'coruña, a': 'A Coruña',
  lugo: 'Lugo',
  ourense: 'Ourense',
  orense: 'Ourense',
  pontevedra: 'Pontevedra',
};

export function galicianProvince(province: unknown, country: unknown): string | null {
  if (country !== undefined && country !== 'ES') return null;
  if (typeof province !== 'string') return null;
  return PROVINCES[province.trim().toLowerCase()] ?? null;
}

/**
 * EFFIS timestamps ("2026-09-24 07:47:07.789512") carry no offset; they are
 * treated as UTC (not documented by the source).
 */
export function effisTime(value: unknown): string {
  const m =
    typeof value === 'string'
      ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?$/.exec(value.trim())
      : null;
  const ms = m ? Date.parse(`${m[1]}T${m[2]}${(m[3] ?? '').slice(0, 4)}Z`) : Number.NaN;
  if (Number.isNaN(ms)) throw new Error(`Unrecognised EFFIS time: ${String(value)}`);
  return new Date(ms).toISOString();
}

type Position = [number, number];
type Ring = Position[];

/** Round to 5 decimals, drop repeated vertices, keep the ring closed; null if degenerate. */
export function simplifyRing(ring: unknown): Ring | null {
  if (!Array.isArray(ring)) throw new Error('EFFIS: ring is not an array');
  const out: Ring = [];
  for (const p of ring) {
    if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') {
      throw new Error('EFFIS: bad coordinate');
    }
    const q: Position = [round(p[0]), round(p[1])];
    const prev = out.at(-1);
    if (!prev || prev[0] !== q[0] || prev[1] !== q[1]) out.push(q);
  }
  const first = out[0];
  const last = out.at(-1);
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first]);
  return out.length >= 4 ? out : null;
}

function simplifyPolygon(rings: unknown): Ring[] | null {
  if (!Array.isArray(rings) || rings.length === 0) throw new Error('EFFIS: bad polygon');
  const outer = simplifyRing(rings[0]);
  if (!outer) return null;
  const holes = rings
    .slice(1)
    .map(simplifyRing)
    .filter((r): r is Ring => r !== null);
  return [outer, ...holes];
}

export function simplifyGeometry(g: unknown): Feature['geometry'] {
  const geom = g as { type?: string; coordinates?: unknown } | null;
  if (geom?.type === 'Polygon') {
    const poly = simplifyPolygon(geom.coordinates);
    return poly ? { type: 'Polygon', coordinates: poly } : null;
  }
  if (geom?.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
    const polys = geom.coordinates.map(simplifyPolygon).filter((p): p is Ring[] => p !== null);
    if (polys.length === 0) return null;
    return polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys };
  }
  throw new Error(`EFFIS: unexpected geometry ${geom?.type ?? 'null'}`);
}

// Land-cover shares (% of the burnt area) as published by EFFIS.
const LAND_COVER: Record<string, string> = {
  BROADLEA: 'pct_frondosas',
  CONIFER: 'pct_coniferas',
  MIXED: 'pct_mixto',
  SCLEROPH: 'pct_esclerofilas',
  TRANSIT: 'pct_transicion',
  OTHERNATLC: 'pct_outra_natural',
  AGRIAREAS: 'pct_agricola',
  ARTIFSURF: 'pct_artificial',
  OTHERLC: 'pct_outra',
  PERCNA2K: 'pct_natura2000',
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface Raw {
  type?: unknown;
  features?: Array<{ properties?: Record<string, unknown>; geometry?: unknown }>;
}

export default {
  async fetch(ctx) {
    const res = await ctx.get(WFS_URL);
    const text = res.body.toString('utf8');
    try {
      return JSON.parse(text) as Raw;
    } catch {
      throw new Error(`EFFIS: response is not JSON: ${text.slice(0, 80)}`);
    }
  },

  normalize(raw) {
    if (raw?.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
      throw new Error('EFFIS: response is not a GeoJSON FeatureCollection');
    }
    const features: Feature[] = [];
    let publishedAt: string | null = null;
    for (const f of raw.features) {
      const p = f.properties ?? {};
      const provincia = galicianProvince(p.PROVINCE, p.COUNTRY);
      if (!provincia) continue;
      const geometry = simplifyGeometry(f.geometry);
      if (!geometry) continue;
      const actualizado = effisTime(p.LASTUPDATE);
      if (!publishedAt || actualizado > publishedAt) publishedAt = actualizado;
      const area = num(p.AREA_HA);
      if (area === null) throw new Error(`EFFIS: bad AREA_HA for ${String(p.id)}`);
      const props: Record<string, unknown> = {
        id: String(p.id),
        data_lume: effisTime(p.FIREDATE),
        actualizado,
        provincia,
        concello: typeof p.COMMUNE === 'string' ? p.COMMUNE.trim() : null,
        area_ha: area,
      };
      for (const [src, dst] of Object.entries(LAND_COVER)) {
        if (src in p) {
          const v = num(p[src]);
          props[dst] = v === null ? null : Math.round(v * 10) / 10;
        }
      }
      features.push({ type: 'Feature', id: String(p.id), geometry, properties: props });
    }
    return { collection: { type: 'FeatureCollection', features }, publishedAt };
  },
} satisfies Adapter<Raw>;
