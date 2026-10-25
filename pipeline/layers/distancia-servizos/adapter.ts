// Straight-line distance from every population entity to the nearest public service of
// each kind. Derived layer: no network. It reads the last good published output of its
// input layers (depends_on in layer.yaml) through ctx.readLayer, which throws when an input
// is missing or stale, so publish keeps the previous good file.
//
// Distance is great-circle (haversine) in km, rounded to 0.1 km. It is NOT road distance
// and NOT travel time.
//
// published_at: the inputs mostly give no publication time (SERGAS, Educación), so the layer
// uses, per input, its published_at or else its last successful download, and takes the
// latest of those: the date of the newest data the calculation used.

import type {
  Adapter,
  AdapterContext,
  Feature,
  FeatureCollection,
  PublishedLayer,
} from '../../lib/adapter.ts';
import { round } from '../../lib/adapter.ts';

export const INPUTS = [
  'entidades-poboacion',
  'centros-saude',
  'hospitais',
  'farmacias',
  'centros-educativos',
  'centros-maiores',
] as const;
export type InputId = (typeof INPUTS)[number];
export type Raw = Record<InputId, PublishedLayer>;

export const SERVICES = [
  'centro_saude',
  'pac',
  'hospital',
  'farmacia',
  'escola',
  'instituto',
  'centro_dia',
] as const;
export type Service = (typeof SERVICES)[number];

export interface Site {
  lon: number;
  lat: number;
  nome: string;
}

type Props = Record<string, unknown>;

/** Which service(s) a feature of an input layer counts as. */
export function classify(input: InputId, p: Props): Service[] {
  switch (input) {
    case 'centros-saude':
      return p.tipo === 'centro_saude' ? ['centro_saude'] : p.tipo === 'pac' ? ['pac'] : [];
    case 'hospitais':
      return ['hospital'];
    case 'farmacias':
      return ['farmacia'];
    case 'centros-educativos': {
      if (p.titularidade !== 'publica') return [];
      // CPI (primaria_secundaria) teach both primary and lower secondary: they count as both.
      const out: Service[] = [];
      if (
        p.etapa === 'infantil_primaria' ||
        p.etapa === 'primaria' ||
        p.etapa === 'primaria_secundaria'
      ) {
        out.push('escola');
      }
      if (p.etapa === 'secundaria' || p.etapa === 'primaria_secundaria') out.push('instituto');
      return out;
    }
    case 'centros-maiores':
      return p.tipo === 'Centro de día' ? ['centro_dia'] : [];
    default:
      return [];
  }
}

function lonLat(f: Feature): [number, number] | null {
  if (f.geometry?.type !== 'Point') return null;
  const [lon, lat] = f.geometry.coordinates as [number, number];
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

/** Group the service features of all input layers by service. */
export function collectSites(raw: Raw): Record<Service, Site[]> {
  const sites = Object.fromEntries(SERVICES.map((s) => [s, [] as Site[]])) as Record<
    Service,
    Site[]
  >;
  for (const input of INPUTS) {
    if (input === 'entidades-poboacion') continue;
    for (const f of raw[input].collection.features) {
      const ll = lonLat(f);
      if (!ll) continue;
      for (const s of classify(input, f.properties)) {
        sites[s].push({ lon: ll[0], lat: ll[1], nome: String(f.properties.nome ?? '') });
      }
    }
  }
  return sites;
}

const R_KM = 6371.0088;
const RAD = Math.PI / 180;

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Uniform lon/lat grid for nearest-neighbour search. Rings of cells are visited outwards
 * until no unvisited cell can hold a closer site. The bound uses the shortest km per degree
 * in the area (a degree of longitude at 44°N), so the stop is conservative.
 */
export class Grid {
  private cells = new Map<string, Site[]>();
  private readonly kmPerCell: number;

  constructor(
    private sites: Site[],
    private size = 0.05,
  ) {
    for (const s of sites) {
      const k = this.key(Math.floor(s.lon / size), Math.floor(s.lat / size));
      const cell = this.cells.get(k);
      if (cell) cell.push(s);
      else this.cells.set(k, [s]);
    }
    this.kmPerCell = size * 111.19 * Math.cos(44 * RAD);
  }

  private key(i: number, j: number): string {
    return `${i}:${j}`;
  }

  nearest(lon: number, lat: number): { site: Site; km: number } | null {
    if (this.sites.length === 0) return null;
    const ci = Math.floor(lon / this.size);
    const cj = Math.floor(lat / this.size);
    let best: Site | null = null;
    let bestKm = Number.POSITIVE_INFINITY;
    for (let r = 0; ; r++) {
      for (let i = ci - r; i <= ci + r; i++) {
        for (let j = cj - r; j <= cj + r; j++) {
          // Only the ring at Chebyshev distance r.
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          for (const s of this.cells.get(this.key(i, j)) ?? []) {
            const km = haversineKm(lon, lat, s.lon, s.lat);
            if (km < bestKm) {
              bestKm = km;
              best = s;
            }
          }
        }
      }
      // Cells in ring r + 1 and beyond are at least r cells away from the query point.
      if (best && bestKm <= r * this.kmPerCell) break;
      // Safety stop: farther than all of Galicia, scan everything.
      if (r > 200) return this.bruteForce(lon, lat);
    }
    return best ? { site: best, km: bestKm } : null;
  }

  bruteForce(lon: number, lat: number): { site: Site; km: number } | null {
    let best: { site: Site; km: number } | null = null;
    for (const s of this.sites) {
      const km = haversineKm(lon, lat, s.lon, s.lat);
      if (!best || km < best.km) best = { site: s, km };
    }
    return best;
  }
}

/** Per input: published_at if the source gives one, else the last good download; the latest wins. */
export function inputsTime(raw: Raw): string | null {
  let max: number | null = null;
  for (const input of INPUTS) {
    const m = raw[input].meta;
    const t = Date.parse(m.published_at ?? m.last_success_at ?? '');
    if (Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  return max === null ? null : new Date(max).toISOString();
}

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    if (!ctx.readLayer) throw new Error('distancia-servizos needs ctx.readLayer (derived layer)');
    const raw = {} as Raw;
    for (const id of INPUTS) raw[id] = await ctx.readLayer(id);
    return raw;
  },

  normalize(raw) {
    const sites = collectSites(raw);
    for (const s of SERVICES) {
      if (sites[s].length === 0) throw new Error(`no sites for service ${s}`);
    }
    const grids = Object.fromEntries(SERVICES.map((s) => [s, new Grid(sites[s])])) as Record<
      Service,
      Grid
    >;
    const features: Feature[] = [];
    for (const f of raw['entidades-poboacion'].collection.features) {
      const ll = lonLat(f);
      if (!ll) continue;
      const p = f.properties;
      const props: Props = {
        codigo: p.codigo ?? null,
        nome: p.nome,
        codigo_ine: p.codigo_ine,
        poboacion: p.poboacion ?? null,
      };
      let csNome: string | null = null;
      for (const s of SERVICES) {
        const hit = grids[s].nearest(ll[0], ll[1]);
        props[`dist_${s}`] = hit ? round(hit.km, 1) : null;
        if (s === 'centro_saude') csNome = hit?.site.nome ?? null;
      }
      props.centro_saude_nome = csNome;
      features.push({ type: 'Feature', geometry: f.geometry, properties: props });
    }
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    return { collection, publishedAt: inputsTime(raw) };
  },
};

export default adapter;
