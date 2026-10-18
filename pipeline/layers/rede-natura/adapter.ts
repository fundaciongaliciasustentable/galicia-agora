// Natura 2000 sites (ZEC/LIC and ZEPA) in Galicia from the MITECO / IEPNB
// GeoServer WFS. The newest dated typename (RN2000:rn2000_YYYY) is picked from
// GetCapabilities, filtered server-side to sites whose ids_ccaa_filtro list
// contains Galicia (CCAA 11), and re-checked in normalize. Species and habitat
// lists are not requested. Coordinates are rounded to 5 decimals.

import { type Adapter, type Feature, type FeatureCollection, round } from '../../lib/adapter.ts';

export const OWS = 'https://geoserver.iepnb.es/geoserver/RN2000/ows';
export const GALICIA_CCAA = '11';
const PROPERTIES = ['id_ref', 'nombre', 'ids_ccaa_filtro', 'desc_figura', 'superficie_ha', 'geom'];

export interface Raw {
  typeName: string;
  edicion: number;
  body: string;
}

interface WfsFeature {
  id?: string;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

interface WfsCollection {
  type?: string;
  numberMatched?: number;
  numberReturned?: number;
  features?: WfsFeature[];
}

export const capabilitiesUrl = `${OWS}?service=WFS&version=2.0.0&request=GetCapabilities`;

/** Newest dated typename in the capabilities document, e.g. RN2000:rn2000_2024. */
export function latestTypeName(xml: string): { typeName: string; edicion: number } {
  const years = [...xml.matchAll(/<Name>RN2000:rn2000_(\d{4})<\/Name>/g)].map((m) => Number(m[1]));
  if (years.length === 0) throw new Error('IEPNB WFS: no RN2000:rn2000_YYYY feature type');
  const edicion = Math.max(...years);
  return { typeName: `RN2000:rn2000_${edicion}`, edicion };
}

export function getFeatureUrl(typeName: string): string {
  const q = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: typeName,
    outputFormat: 'application/json',
    // "EPSG:4326" (not the URN) makes GeoServer emit lon/lat order.
    srsName: 'EPSG:4326',
    propertyName: PROPERTIES.join(','),
    CQL_FILTER: `ids_ccaa_filtro LIKE '%${GALICIA_CCAA}%'`,
  });
  return `${OWS}?${q}`;
}

/** ids_ccaa_filtro is a comma list ("11", "11,90", "11,12"). */
export function includesGalicia(v: unknown): boolean {
  return String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .includes(GALICIA_CCAA);
}

type Ring = Array<[number, number]>;

/** Round, drop consecutive duplicates; null if the ring collapses. */
function ringOut(ring: unknown, swap: boolean): Ring | null {
  if (!Array.isArray(ring)) throw new Error('IEPNB WFS: bad ring');
  const out: Ring = [];
  for (const p of ring as Array<[number, number]>) {
    const [a, b] = swap ? [p[1], p[0]] : [p[0], p[1]];
    const q: [number, number] = [round(a), round(b)];
    const last = out.at(-1);
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  return out.length >= 4 ? out : null;
}

function polygonOut(poly: unknown, swap: boolean): Ring[] | null {
  if (!Array.isArray(poly)) throw new Error('IEPNB WFS: bad polygon');
  const [outer, ...holes] = poly.map((r) => ringOut(r, swap));
  if (!outer) return null;
  return [outer, ...holes.filter((r): r is Ring => r !== null)];
}

function firstPosition(c: unknown): [number, number] | null {
  let x: unknown = c;
  while (Array.isArray(x) && Array.isArray(x[0])) x = x[0];
  return Array.isArray(x) && typeof x[0] === 'number' ? (x as [number, number]) : null;
}

/** Defensive check for lat/lon axis order (Spain: lat 27–44, lon -19–5). */
export function looksLatLon(c: unknown): boolean {
  const p = firstPosition(c);
  return !!p && p[0] > 26 && p[0] < 45 && p[1] > -20 && p[1] < 6;
}

export function geometryOut(g: WfsFeature['geometry']): Feature['geometry'] {
  if (!g) return null;
  const swap = looksLatLon(g.coordinates);
  if (g.type === 'Polygon') {
    const p = polygonOut(g.coordinates, swap);
    return p ? { type: 'Polygon', coordinates: p } : null;
  }
  if (g.type === 'MultiPolygon') {
    if (!Array.isArray(g.coordinates)) throw new Error('IEPNB WFS: bad multipolygon');
    const ps = g.coordinates.map((p) => polygonOut(p, swap)).filter((p) => p !== null);
    return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null;
  }
  throw new Error(`IEPNB WFS: unexpected geometry ${g.type}`);
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export default {
  async fetch(ctx) {
    const caps = (await ctx.get(capabilitiesUrl)).body.toString('utf8');
    const { typeName, edicion } = latestTypeName(caps);
    const body = (await ctx.get(getFeatureUrl(typeName))).body.toString('utf8');
    return { typeName, edicion, body };
  },

  normalize(raw, _ctx) {
    let fc: WfsCollection;
    try {
      fc = JSON.parse(raw.body) as WfsCollection;
    } catch {
      // GeoServer answers errors as XML ExceptionReport.
      throw new Error(`IEPNB WFS: response is not JSON: ${raw.body.slice(0, 200)}`);
    }
    if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
      throw new Error('IEPNB WFS: unexpected response (no FeatureCollection)');
    }
    if (typeof fc.numberMatched === 'number' && fc.numberMatched !== fc.features.length) {
      throw new Error(`IEPNB WFS: got ${fc.features.length} of ${fc.numberMatched} features`);
    }

    const features: Feature[] = [];
    for (const f of fc.features) {
      const p = f.properties ?? {};
      if (!includesGalicia(p.ids_ccaa_filtro)) continue;
      const codigo = String(p.id_ref ?? '').trim();
      if (!/^ES[0-9A-Z]{7}$/.test(codigo)) throw new Error(`IEPNB WFS: bad id_ref ${codigo}`);
      const geometry = geometryOut(f.geometry);
      if (!geometry) continue;
      features.push({
        type: 'Feature',
        id: codigo,
        geometry,
        properties: {
          codigo,
          nome: String(p.nombre ?? '').trim(),
          figura: String(p.desc_figura ?? '').trim(),
          superficie_ha: num(p.superficie_ha),
          edicion: raw.edicion,
        },
      });
    }
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    // The WFS gives only the response timeStamp (download time), not a publication date.
    return { collection, publishedAt: null };
  },
} satisfies Adapter<Raw>;
