// Schools and other education centres in Galicia (Consellería de Educación, dataset 0257).
// One CSV per province; each abertos.xunta.gal URL answers 302 to an export of the
// edu.xunta.gal search ("busqueda.csv"). The export has no Last-Modified, so publishedAt is null.
//
// COORDENADA_X / COORDENADA_Y are WGS84 degrees but their order is inconsistent: most rows are
// (lat, lon), some are (lon, lat) and a few are 0/0 or otherwise unusable (seen 2026-10-24:
// 307 swapped, 11 unusable of 1,624). Each row is tested both ways against the Galicia bbox;
// rows that fit neither are dropped and counted.

import { type Adapter, type Feature, inGalicia, point } from '../../lib/adapter.ts';

/** Province files: 001 A Coruña, 003 Lugo, 005 Ourense, 007 Pontevedra. */
export const PROVINCES = ['001', '003', '005', '007'] as const;

export const urlFor = (p: string) =>
  `https://abertos.xunta.gal/catalogo/ensino-formacion/-/dataset/0257/centros-educativos-galicia/${p}/descarga-directa-ficheiro.csv`;

/** Centres just over a provincial border still belong to Galicia: small pad. */
export const PAD = 0.05;

const HEADER = [
  'Código',
  'Nome',
  'Enderezo',
  'Concello',
  'Provincia',
  'Cód. postal',
  'Teléfono',
  'Tipo de centro',
  'COORDENADA_X',
  'COORDENADA_Y',
  'TITULARIDADE',
  'ENSINO_CONCERTADO',
  'DEPENDENTE',
] as const;

/**
 * Stage derived from the centre type code only where the type fixes it by definition.
 * Types that can teach several stages (CPR, CPREX private centres, "Cen. Pub.") or whose
 * stage we could not confirm (EFAG, EFOG, CFEA, ESCO, IGAFA, INSTITUTO) map to null.
 */
export const ETAPA_BY_TIPO: Record<string, string> = {
  EEI: 'infantil', // Escola de Educación Infantil
  CEIP: 'infantil_primaria', // Colexio de Educación Infantil e Primaria
  CRA: 'infantil_primaria', // Colexio Rural Agrupado (infantil e primaria)
  CEP: 'primaria', // Colexio de Educación Primaria
  CPI: 'primaria_secundaria', // Centro Público Integrado (primaria e ESO)
  IES: 'secundaria', // Instituto de Educación Secundaria
  CIFP: 'formacion_profesional', // Centro Integrado de Formación Profesional
  CEE: 'educacion_especial', // Centro de Educación Especial
  CEEPR: 'educacion_especial', // Centro de Educación Especial privado
  EPAPU: 'adultos', // Educación Permanente de Adultos
  // Special-regime teaching: music, dance, arts, drama, languages, sport.
  CMUS: 'outros',
  CEMU: 'outros',
  ESMU: 'outros',
  EMUSPR: 'outros',
  CDAN: 'outros',
  CEDA: 'outros',
  EDANPR: 'outros',
  ESDA: 'outros',
  EASD: 'outros',
  ESAD: 'outros',
  'CE.ART': 'outros',
  ES: 'outros', // Escola Superior de Conservación e Restauración de Bens Culturais
  EOI: 'outros',
  CAD: 'outros',
  CADF: 'outros',
  CADFS: 'outros',
};

/** Parse a whole CSV text (RFC 4180: quoted fields, doubled quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Return [lon, lat] inside Galicia, trying (Y, X) first and then (X, Y); null if neither fits. */
export function locate(
  x: number,
  y: number,
): { lon: number; lat: number; swapped: boolean } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (inGalicia(y, x, PAD)) return { lon: y, lat: x, swapped: false };
  if (inGalicia(x, y, PAD)) return { lon: x, lat: y, swapped: true };
  return null;
}

function yesNo(s: string, field: string, code: string): boolean {
  const t = s.trim();
  if (t === 'Si' || t === 'Sí') return true;
  if (t === 'Non') return false;
  throw new Error(`Unexpected ${field} "${s}" for centre ${code}`);
}

function titularidade(s: string, code: string): 'publica' | 'privada' {
  const t = s.trim();
  if (t === 'Pública') return 'publica';
  if (t === 'Privada') return 'privada';
  throw new Error(`Unexpected TITULARIDADE "${s}" for centre ${code}`);
}

export interface ParseStats {
  rows: number;
  swapped: number;
  dropped: number;
  droppedCodes: string[];
}

/** Turn the province CSVs into features, keeping counts of swapped and dropped rows. */
export function toFeatures(csvs: string[]): { features: Feature[]; stats: ParseStats } {
  const features: Feature[] = [];
  const seen = new Set<string>();
  const stats: ParseStats = { rows: 0, swapped: 0, dropped: 0, droppedCodes: [] };

  for (const text of csvs) {
    const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
    if (!header || HEADER.some((h, i) => header[i]?.trim() !== h)) {
      throw new Error(`Unexpected CSV header: ${header?.join(',')}`);
    }
    for (const r of rows) {
      if (r.length !== HEADER.length) throw new Error(`Unexpected row length ${r.length}`);
      stats.rows++;
      const [codigo = '', nome = '', enderezo = '', concello = '', , cp = '', , tipo = ''] = r;
      const code = codigo.trim();
      if (!/^\d{8}$/.test(code)) throw new Error(`Unexpected centre code "${codigo}"`);
      const at = locate(Number(r[8]), Number(r[9]));
      if (!at) {
        stats.dropped++;
        stats.droppedCodes.push(code);
        continue;
      }
      if (at.swapped) stats.swapped++;
      if (seen.has(code)) continue;
      seen.add(code);
      const t = tipo.trim();
      features.push({
        type: 'Feature',
        id: code,
        geometry: point(at.lon, at.lat),
        properties: {
          codigo: code,
          nome: nome.trim(),
          tipo: t,
          etapa: ETAPA_BY_TIPO[t] ?? null,
          titularidade: titularidade(r[10] ?? '', code),
          concertado: yesNo(r[11] ?? '', 'ENSINO_CONCERTADO', code),
          concello: concello.trim(),
          enderezo: enderezo.trim(),
          cp: /^\d{5}$/.test(cp.trim()) ? cp.trim() : null,
        },
      });
    }
  }
  return { features, stats };
}

export type Raw = string[];

/** Stats of the last normalize call, for logging by callers and tests. */
export let lastStats: ParseStats | null = null;

const adapter = {
  async fetch(ctx) {
    const out: string[] = [];
    // Sequential: four small requests to the same host.
    for (const p of PROVINCES) {
      const res = await ctx.get(urlFor(p), { headers: { accept: 'text/csv' } });
      out.push(res.body.toString('utf8'));
    }
    return out;
  },

  normalize(raw, _ctx) {
    if (!Array.isArray(raw) || raw.length !== PROVINCES.length) {
      throw new Error('Expected one CSV per province');
    }
    const { features, stats } = toFeatures(raw);
    lastStats = stats;
    return {
      collection: { type: 'FeatureCollection', features },
      // The export carries no Last-Modified or date of its own.
      publishedAt: null,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
