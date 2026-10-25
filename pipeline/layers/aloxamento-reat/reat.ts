// Parser for the REAT accommodation directory published by Turismo de Galicia
// (reat_directorio-alojamientos_esp.csv). Shared by aloxamento-reat (points, without
// tourist-use dwellings) and vut-concello (counts of tourist-use dwellings per concello).
//
// File layout (checked 2026-10-24/25): UTF-8, a five-line preamble ("Directorio de
// alojamientos del REAT", "Fecha de referencia: YYYY-MM-DD", the producing unit and two
// blank lines), then a ';'-separated header and rows. Text fields are double-quoted,
// numbers bare, coordinates as quoted strings with a decimal comma.

import { madridToIso } from '../../lib/adapter.ts';

/** Plain <a href> on https://aei.turismo.gal/es/rexistro-de-empresas-e-actividades-turisticas; stable path. */
export const ALOXAMENTOS_URL =
  'https://descargascdn.xunta.gal/interno/smarxa/reat_directorio-alojamientos_esp.csv';

export const REQUIRED_COLUMNS = [
  'signatura',
  'denominacion',
  'tipo',
  'categoria',
  'especialidad',
  'habitaciones',
  'plazas',
  'longitud',
  'latitud',
  'parroquia',
  'lugar',
  'municipio',
] as const;

export type ReatRow = Record<string, string>;

export interface ReatFile {
  /** "Fecha de referencia" from the preamble (YYYY-MM-DD). */
  reference: string;
  rows: ReatRow[];
}

/** VUT (vivendas de uso turístico) are private homes: never published as points. */
export const VUT_TIPO = 'VIVIENDAS USO TURÍSTICO';

export function isVut(r: ReatRow): boolean {
  return r.tipo === VUT_TIPO || (r.signatura ?? '').toUpperCase().startsWith('VUT-');
}

/** Split one ';'-separated line with double-quoted fields ("" escapes a quote). */
export function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseReat(text: string): ReatFile {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const ref = /Fecha de referencia:\s*(\d{4}-\d{2}-\d{2})/.exec(lines.slice(0, 10).join('\n'));
  if (!ref) throw new Error('REAT: no "Fecha de referencia" in the preamble');
  const h = lines.findIndex((l) => l.startsWith('"signatura";'));
  if (h < 0) throw new Error(`REAT: header row not found: ${lines.slice(0, 7).join(' | ')}`);
  const header = parseLine(lines[h] as string).map((x) => x.trim());
  for (const c of REQUIRED_COLUMNS) {
    if (!header.includes(c)) throw new Error(`REAT: missing column "${c}"`);
  }
  const rows: ReatRow[] = [];
  for (let n = h + 1; n < lines.length; n++) {
    const line = lines[n] as string;
    if (line.trim() === '') continue;
    const v = parseLine(line);
    if (v.length !== header.length) {
      throw new Error(`REAT: line ${n + 1} has ${v.length} fields, expected ${header.length}`);
    }
    const row: ReatRow = {};
    header.forEach((k, i) => {
      row[k] = (v[i] ?? '').trim();
    });
    rows.push(row);
  }
  if (rows.length === 0) throw new Error('REAT: no data rows');
  return { reference: ref[1] as string, rows };
}

/** Reference date (a calendar day in Galicia) as ISO UTC: midnight Europe/Madrid. */
export function referenceToIso(reference: string): string {
  return madridToIso(`${reference} 00:00`);
}

/** "-8,07089" → -8.07089; empty → null. */
export function decimal(s: string | undefined): number | null {
  const t = (s ?? '').trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Non-negative integer field; empty → null. */
export function integer(s: string | undefined): number | null {
  const t = (s ?? '').trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

/** Text field: trimmed, inner whitespace collapsed; empty → null. */
export function text(s: string | undefined): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

/**
 * Comparable form of a concello name: upper case, no diacritics, hyphens and dots as
 * spaces, and a trailing article moved to the front ("Coruña, A" → "A CORUNA"). Used to
 * match REAT names ("CERDEDO COTOBADE") with IGE names ("Cerdedo Cotobade").
 */
export function normName(s: string): string {
  let t = s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toUpperCase()
    .replace(/[-'’.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(.*), (A|O|AS|OS)$/.exec(t);
  if (m) t = `${m[2]} ${m[1]}`;
  return t;
}
