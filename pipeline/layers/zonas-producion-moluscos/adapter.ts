// Shellfish production zones and mussel-raft polygons (polígonos de bateas) in the Augas de
// Galicia hydrological plan 2021–2027 (protected zones, European level), on IDEG:
// IDE_DHGC/PHGC2021_2027_ZProtex_NEuropeo/MapServer/2 (84 zones) and /1 (71 raft polygons).
// Both sublayers answer `query` without geometry, so shapes come through `find`, checked
// against the query count (lib/arcgis.ts). Zones are generalised to 0.0003° (≈ 30 m), the
// smaller raft polygons to 0.0001° (≈ 10 m).
//
// The A/B/C class is the one recorded in the plan, not the current official classification
// or the daily open/closed state, which the Consellería do Mar and Intecmar publish.

import { type Adapter, type Feature, round } from '../../lib/adapter.ts';
import { cleanGeometry, esriToGeoJSON, fetchByFind, IDEG, num, str } from '../../lib/arcgis.ts';
import { titleCase } from '../zonas-bano/adapter.ts';

export const MAPSERVER = `${IDEG}/IDE_DHGC/PHGC2021_2027_ZProtex_NEuropeo/MapServer`;
export const ZONAS = { layer: 2, offset: 0.0003 } as const;
export const BATEAS = { layer: 1, offset: 0.0001 } as const;

export interface Raw {
  zonas: Awaited<ReturnType<typeof fetchByFind>>;
  bateas: Awaited<ReturnType<typeof fetchByFind>>;
}

export function clase(v: unknown): 'A' | 'B' | 'C' | null {
  const s = str(v)?.toUpperCase();
  return s === 'A' || s === 'B' || s === 'C' ? s : null;
}

/**
 * COMENTARIO → state and seasonal note: "ESTABLE" → estable; "ESTACIONAL (CAMBIA C novembro a
 * xuño)" → estacional + "Clase C de novembro a xuño". Unknown wording is kept as the note.
 */
export function estado(v: unknown): { estado: string | null; nota: string | null } {
  const s = str(v);
  if (!s) return { estado: null, nota: null };
  const word = s.split(/[\s(]/)[0]?.toLowerCase() ?? '';
  if (word === 'estable' || word === 'provisional') return { estado: word, nota: null };
  if (word === 'estacional') {
    const m = /CAMBIA\s+([ABC])\s+(.+?)\)?$/i.exec(s);
    return {
      estado: 'estacional',
      nota: m ? `Clase ${m[1]?.toUpperCase()} de ${m[2]?.trim()}` : s,
    };
  }
  return { estado: null, nota: s };
}

function nameCase(v: unknown): string | null {
  const s = str(v);
  return s ? titleCase(s) : null;
}

/** "GAL 03/07" → itself; the bare "GAL" some raft polygons carry → null. */
export function codigo(v: unknown): string | null {
  const s = str(v);
  return s && /\d/.test(s) ? s : null;
}

const adapter = {
  async fetch(ctx) {
    return {
      zonas: await fetchByFind(ctx, MAPSERVER, ZONAS.layer, 'EUZPROTCOD', 'ES', ZONAS.offset),
      bateas: await fetchByFind(ctx, MAPSERVER, BATEAS.layer, 'EUZPROTCOD', 'ES', BATEAS.offset),
    };
  },

  normalize(raw, _ctx) {
    const features: Feature[] = [];
    for (const r of raw.zonas.results) {
      const a = r.attributes;
      const cod = codigo(a.COD_ZPROT);
      if (!cod) throw new Error(`moluscos: zone ${String(a.OBJECTID)} without COD_ZPROT`);
      const geometry = cleanGeometry(esriToGeoJSON(r.geometry));
      if (!geometry) continue;
      const km2 = num(a.AREA_KM2, 3);
      features.push({
        type: 'Feature',
        id: `zona-${cod}`,
        geometry,
        properties: {
          id: `zona-${cod}`,
          tipo: 'zona',
          codigo: cod,
          // "GAL 03/07 RIA DE FERROL (INT)" → the name after the code.
          nome: nameCase(str(a.NOM_ZPROT)?.replace(cod, '').trim()) ?? cod,
          clase: clase(a.CLASE),
          ...estado(a.COMENTARIO),
          limites: str(a.LIMITES),
          ria: null,
          superficie_km2: km2 === null ? null : round(km2, 3),
        },
      });
    }
    for (const r of raw.bateas.results) {
      const a = r.attributes;
      const distrito = nameCase(a.DISTRITO);
      const poligono = str(a.POLIGONO);
      if (!distrito || !poligono) {
        throw new Error(`moluscos: raft polygon ${String(a.OBJECTID)} without name`);
      }
      const geometry = cleanGeometry(esriToGeoJSON(r.geometry));
      if (!geometry) continue;
      const id = `bateas-${String(a.OBJECTID)}`;
      const km2 = num(a.AREA_KM2, 3);
      features.push({
        type: 'Feature',
        id,
        geometry,
        properties: {
          id,
          tipo: 'poligono_bateas',
          codigo: codigo(a.COD_ZPROT),
          nome: `${distrito} ${poligono}`,
          clase: clase(a.CLASE),
          ...estado(a.COMENTARIO),
          limites: null,
          ria: nameCase(a.RIA),
          superficie_km2: km2 === null ? null : round(km2, 3),
        },
      });
    }
    // The plan layers have no edition date of their own.
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
