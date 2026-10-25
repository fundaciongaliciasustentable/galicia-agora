// Registered tourist accommodation (REAT, Turismo de Galicia) as points: hotels, pensions,
// tourist apartments, rural tourism, hostels, campsites and "vivendas turísticas" (VT,
// a business category). Tourist-use dwellings (VUT) are private homes and are always
// excluded here; vut-concello publishes them only as counts per concello.
//
// Dropped fields: telefono, correo_promocional (contact data) and direccion. The file has
// no publication timestamp other than its "Fecha de referencia", used as published_at.
//
// Public Xacobeo pilgrim hostels carry no signatura; they get a deterministic id built
// from concello and name.

import { type Adapter, type Feature, inGalicia, point } from '../../lib/adapter.ts';
import {
  ALOXAMENTOS_URL,
  decimal,
  integer,
  isVut,
  parseReat,
  type ReatRow,
  referenceToIso,
  text,
} from './reat.ts';

/** REAT "tipo" → Galician label. Unknown types fail the run (they could be homes). */
export const TIPOLOXIAS: Record<string, string> = {
  HOTELES: 'Hotel',
  PENSIONES: 'Pensión',
  APARTAMENTOS: 'Apartamentos turísticos',
  'TURISMO RURAL': 'Turismo rural',
  'ALBERGUES TURÍSTICOS': 'Albergue turístico',
  'VIVIENDAS TURÍSTICAS': 'Vivenda turística',
  CAMPINGS: 'Cámping',
};

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface Stats {
  vut: number;
  noCoords: number;
  outside: number;
}

export function toFeatures(rows: ReatRow[]): { features: Feature[]; stats: Stats } {
  const stats: Stats = { vut: 0, noCoords: 0, outside: 0 };
  const features: Feature[] = [];
  const ids = new Set<string>();
  for (const r of rows) {
    if (isVut(r)) {
      stats.vut++;
      continue;
    }
    const tipoloxia = TIPOLOXIAS[r.tipo ?? ''];
    if (!tipoloxia) throw new Error(`REAT: unknown accommodation type "${r.tipo}"`);
    const lon = decimal(r.longitud);
    const lat = decimal(r.latitud);
    if (lon === null || lat === null) {
      stats.noCoords++;
      continue;
    }
    if (!inGalicia(lon, lat)) {
      stats.outside++;
      continue;
    }
    const nome = text(r.denominacion);
    if (!nome) continue;
    const signatura = text(r.signatura);
    let id = signatura ?? `sen-signatura-${slug(`${r.municipio ?? ''} ${nome}`)}`;
    for (let n = 2; ids.has(id); n++) id = `${signatura ?? id}-${n}`;
    ids.add(id);
    features.push({
      type: 'Feature',
      id,
      geometry: point(lon, lat),
      properties: {
        signatura,
        nome,
        tipoloxia,
        categoria: text(r.categoria),
        especialidade: text(r.especialidad),
        prazas: integer(r.plazas),
        habitacions: integer(r.habitaciones),
        concello: text(r.municipio),
        parroquia: text(r.parroquia),
        lugar: text(r.lugar),
      },
    });
  }
  return { features, stats };
}

const adapter = {
  async fetch(ctx) {
    // ~6 MB; the CDN is quick but allow time.
    const res = await ctx.get(ALOXAMENTOS_URL, { timeoutMs: 180_000 });
    return new TextDecoder('utf-8').decode(res.body);
  },

  normalize(raw, _ctx) {
    const { reference, rows } = parseReat(raw);
    const { features } = toFeatures(rows);
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: referenceToIso(reference),
    };
  },
} satisfies Adapter<string>;

export default adapter;
