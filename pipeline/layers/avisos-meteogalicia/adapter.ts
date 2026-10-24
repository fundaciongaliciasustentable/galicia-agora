// MeteoGalicia adverse-weather warnings by concello (today), as rows joined to the
// concello polygons of concellos-parroquias by INE code.
// At most two requests per run (MeteoGalicia blocks IPs that poll inefficiently):
// jsonConcellosNivelMax.action gives today's maximum level for all 313 concellos but no
// phenomenon or times; only when some concello is above 0 is jsonAvisosConcellos.action?dia=-1
// requested for the detail.
// idConcello is the 5-digit INE municipality code: checked on 2026-10-24 against the IGE list
// (pipeline/samples/ige-ficha-municipal/ideg-concellos-codes.json), 313 of 313 codes match and
// the names differ only in spelling ("Baña (A)" / "A Baña").

import { type Adapter, type Feature, madridToIso } from '../../lib/adapter.ts';

const BASE = 'https://servizos.meteogalicia.gal/mgrss/predicion/adversos';
export const NIVEL_URL = `${BASE}/jsonConcellosNivelMax.action`;
export const DETAIL_URL = `${BASE}/jsonAvisosConcellos.action?dia=-1`;
export const MIN_CONCELLOS = 300;

export const NIVEL_TXT = ['sen aviso', 'amarelo', 'laranxa', 'vermello'] as const;

// Annex II of JSON_Pred_AvisoConcello_gl.pdf, used when tipoalerta_gl is missing.
const TIPO_ALERTA: Record<number, string> = {
  1: 'Temperatura máxima',
  2: 'Temperatura mínima',
  3: 'Precipitación 1 hora',
  4: 'Precipitación 12 horas',
  5: 'Néboa',
  6: 'Neve',
  7: 'Tormenta',
  8: 'Refacho máximo de vento',
  9: 'Vento no mar',
  10: 'Ondas',
};

export interface Raw {
  niveis: unknown;
  /** Null when no concello is above level 0 (the detail request is skipped). */
  avisos: unknown | null;
}

interface NivelMax {
  dia?: number;
  idConcello?: number | string;
  nivelMax?: number;
  nomeConcello?: string;
}

// Field names from the documentation (JSON_Pred_AvisoConcello_gl.pdf). The real wrapper
// (listaDiaConcellos) differs from the documented one, and no warning was active during
// verification, so both "idconcello" and "idConcello" are accepted.
interface Aviso {
  idconcello?: number | string;
  idConcello?: number | string;
  idNivel?: number;
  nomeConcello?: string;
  dataAviso?: string;
  dataIni?: string;
  dataFin?: string;
  idTipoAlerta?: number;
  tipoalerta_gl?: string;
}

function dayList<T>(raw: unknown, listKey: string, dia = 0): T[] {
  const days = (raw as { listaDiaConcellos?: unknown } | null)?.listaDiaConcellos;
  if (!Array.isArray(days)) {
    throw new Error('MeteoGalicia avisos: unexpected response (no "listaDiaConcellos")');
  }
  const day = (days as Array<Record<string, unknown>>).find((d) => d?.dia === dia);
  if (!day) return [];
  const list = day[listKey];
  if (!Array.isArray(list)) {
    throw new Error(`MeteoGalicia avisos: unexpected response (no "${listKey}")`);
  }
  return list as T[];
}

export function codigoIne(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!/^(15|27|32|36)\d{3}$/.test(s)) throw new Error(`MeteoGalicia avisos: bad idConcello ${s}`);
  return s;
}

function localIso(s: unknown): string | null {
  if (typeof s !== 'string' || s.trim() === '') return null;
  return madridToIso(s);
}

function levelOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 3) {
    throw new Error(`MeteoGalicia avisos: unexpected level ${String(v)}`);
  }
  return n;
}

const adapter = {
  async fetch(ctx) {
    const niveis = JSON.parse((await ctx.get(NIVEL_URL)).body.toString('utf8'));
    const anyWarning = dayList<NivelMax>(niveis, 'listaNiveisMaximos').some(
      (c) => Number(c.nivelMax) > 0,
    );
    const avisos = anyWarning
      ? JSON.parse((await ctx.get(DETAIL_URL)).body.toString('utf8'))
      : null;
    return { niveis, avisos };
  },

  normalize(raw, _ctx) {
    const niveis = dayList<NivelMax>(raw.niveis, 'listaNiveisMaximos');
    if (niveis.length < MIN_CONCELLOS) {
      throw new Error(`MeteoGalicia avisos: only ${niveis.length} concellos in the response`);
    }

    // Today's warnings per concello (level > 0).
    const detail = new Map<string, Aviso[]>();
    let published = 0;
    if (raw.avisos !== null) {
      for (const a of dayList<Aviso>(raw.avisos, 'listaAvisosConcellos')) {
        const iso = localIso(a.dataAviso);
        if (iso) published = Math.max(published, Date.parse(iso));
        if (levelOf(a.idNivel) === 0) continue;
        const cod = codigoIne(a.idconcello ?? a.idConcello);
        detail.set(cod, [...(detail.get(cod) ?? []), a]);
      }
    }

    const features: Feature[] = niveis.map((c) => {
      const cod = codigoIne(c.idConcello);
      const avisos = detail.get(cod) ?? [];
      const nivel = Math.max(levelOf(c.nivelMax), ...avisos.map((a) => levelOf(a.idNivel)));
      const fenomenos = [
        ...new Set(
          avisos
            .map((a) => a.tipoalerta_gl?.trim() || TIPO_ALERTA[Number(a.idTipoAlerta)])
            .filter((x): x is string => !!x),
        ),
      ];
      const inicios = avisos.map((a) => localIso(a.dataIni)).filter((x): x is string => !!x);
      const fins = avisos.map((a) => localIso(a.dataFin)).filter((x): x is string => !!x);
      return {
        type: 'Feature',
        id: cod,
        geometry: null,
        properties: {
          codigo_ine: cod,
          nome: c.nomeConcello ?? '',
          nivel,
          nivel_txt: NIVEL_TXT[nivel],
          fenomenos: fenomenos.length ? fenomenos.join(', ') : null,
          inicio: inicios.length ? inicios.sort()[0] : null,
          fin: fins.length ? fins.sort()[fins.length - 1] : null,
        },
      } satisfies Feature;
    });

    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: published ? new Date(published).toISOString() : null,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
