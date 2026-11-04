// Every heat focus the satellites saw over Galicia in the 2025 fire season (June to October,
// with the large fires of August), pass by pass. Feeds /pulso/lume/.
//
// Source: NASA FIRMS yearly archives per country (no MAP_KEY), which exist for VIIRS S-NPP
// (375 m) and MODIS (1 km). NOAA-20 and NOAA-21 have no country archive and would need the
// area API with a key; they are left out and the page says so. Detections inside the Galicia
// bounding box are assigned to a concello with the published concellos-parroquias polygons;
// those in Asturias, León or Zamora fall outside every polygon and are dropped. Only type 0
// (presumed vegetation fire) is kept: static land sources and offshore detections are not fires.
//
// Derived from concellos-parroquias (CC BY-SA 4.0) for the concello of each detection, so it
// goes in the CC BY-SA collection (ADR 0005), like perfil-concellos.

import type { Adapter, AdapterContext, Feature, PublishedLayer } from '../../lib/adapter.ts';
import { inGalicia, point, round } from '../../lib/adapter.ts';

export const YEAR = 2025;
/** The fire season kept, inclusive (acquisition dates in UTC). */
export const SEASON = { from: '2025-06-01', to: '2025-10-31' } as const;
const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/country';
export const PRODUCTS = {
  'viirs-snpp': 'VIIRS S-NPP',
  modis: 'MODIS',
} as const;
type Product = keyof typeof PRODUCTS;

export const archiveUrl = (p: Product) => `${BASE}/${p}/${YEAR}/${p}_${YEAR}_Spain.csv`;

export interface Raw {
  csv: Record<Product, string>;
  lastModified: string | null;
  concellos: PublishedLayer;
}

type Ring = Array<[number, number]>;
interface Concello {
  code: string;
  name: string;
  box: [number, number, number, number];
  polys: Ring[][];
}

function concellos(layer: PublishedLayer): Concello[] {
  const out: Concello[] = [];
  for (const f of layer.collection.features) {
    const p = f.properties;
    if (p.nivel !== 'concello' || !f.geometry) continue;
    const polys = (
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    ) as Ring[][];
    let x0 = 180;
    let y0 = 90;
    let x1 = -180;
    let y1 = -90;
    for (const poly of polys)
      for (const [x, y] of poly[0] ?? []) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    out.push({ code: String(p.codigo_ine), name: String(p.nome), box: [x0, y0, x1, y1], polys });
  }
  return out;
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function locate(x: number, y: number, list: Concello[]): Concello | null {
  for (const c of list) {
    const [x0, y0, x1, y1] = c.box;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    for (const poly of c.polys) {
      if (inRing(x, y, poly[0] ?? []) && !poly.slice(1).some((h) => inRing(x, y, h))) return c;
    }
  }
  return null;
}

/** FIRMS acq_date + acq_time (HHMM, UTC) to ISO UTC. */
export function acquired(date: string, hhmm: string): string {
  const t = hhmm.padStart(4, '0');
  return `${date}T${t.slice(0, 2)}:${t.slice(2)}:00Z`;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = (head ?? '').split(',');
  return lines.map((l) => {
    const v = l.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
  });
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('focos-tempada-2025 needs ctx.readLayer (derived layer)');
    const csv = {} as Record<Product, string>;
    let lastModified: string | null = null;
    for (const p of Object.keys(PRODUCTS) as Product[]) {
      const res = await ctx.get(archiveUrl(p), { timeoutMs: 180_000 });
      csv[p] = res.body.toString('utf8');
      if (
        res.lastModified &&
        (!lastModified || Date.parse(res.lastModified) > Date.parse(lastModified))
      )
        lastModified = res.lastModified;
    }
    return { csv, lastModified, concellos: await ctx.readLayer('concellos-parroquias') };
  },

  normalize(raw: Raw) {
    const list = concellos(raw.concellos);
    const features: Feature[] = [];
    for (const p of Object.keys(PRODUCTS) as Product[]) {
      for (const r of parseCsv(raw.csv[p])) {
        const day = r.acq_date ?? '';
        if (day < SEASON.from || day > SEASON.to || r.type !== '0') continue;
        const x = Number(r.longitude);
        const y = Number(r.latitude);
        if (!inGalicia(x, y)) continue;
        const c = locate(x, y, list);
        if (!c) continue;
        const at = acquired(day, r.acq_time ?? '0');
        features.push({
          type: 'Feature',
          geometry: point(x, y),
          properties: {
            instante: at,
            produto: PRODUCTS[p],
            satelite: r.satellite ?? '',
            dia_noite: r.daynight === 'N' ? 'noite' : 'día',
            frp: round(Number(r.frp), 1),
            confianza: r.confidence ?? '',
            codigo_ine: c.code,
            concello: c.name,
          },
        });
      }
    }
    features.sort((a, b) =>
      String(a.properties.instante).localeCompare(String(b.properties.instante)),
    );
    features.forEach((f, i) => {
      f.id = i + 1;
    });
    const publishedAt = raw.lastModified ? new Date(raw.lastModified).toISOString() : null;
    return { collection: { type: 'FeatureCollection', features }, publishedAt };
  },
};

export default adapter;
