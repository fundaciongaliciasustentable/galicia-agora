// CSV helpers for the abertos.xunta.gal files: they mix separators (`,` and `;`),
// encodings (UTF-8 with or without BOM, Latin-1) and coordinate layouts (two columns, or
// "lat,lon" in a single column).

import { inGalicia } from './adapter.ts';

/** Decode as UTF-8 when the bytes are valid UTF-8, otherwise as Latin-1. BOM removed. */
export function decodeText(buf: Buffer): string {
  let s: string;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    s = new TextDecoder('latin1').decode(buf);
  }
  return s.replace(/^﻿/, '');
}

/** Parse delimited text (RFC 4180 quoting, CRLF or LF). Blank lines are skipped. */
export function parseDelimited(text: string, sep = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
    field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += c;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

/**
 * Rows as objects keyed by the trimmed header. Throws if a required column is missing, so a
 * changed file fails loudly instead of publishing empty fields.
 */
export function records(
  text: string,
  sep: string,
  required: string[] = [],
): Array<Record<string, string>> {
  const [header, ...rows] = parseDelimited(text, sep);
  if (!header) throw new Error('CSV without header');
  const keys = header.map((h) => h.trim());
  const missing = required.filter((k) => !keys.includes(k));
  if (missing.length) {
    throw new Error(`CSV columns missing: ${missing.join(', ')}; got: ${keys.join(', ')}`);
  }
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** One column "43.32, -8.52" (lat, lon) → { lat, lon } inside Galicia, or null. */
export function latLonPair(s: string, pad = 0.05): { lat: number; lon: number } | null {
  const parts = s.split(',').map((x) => Number(x.trim()));
  if (parts.length !== 2) return null;
  return checked(parts[0] as number, parts[1] as number, pad);
}

/** Two numeric columns (decimal point or comma) → { lat, lon } inside Galicia, or null. */
export function latLon(lat: string, lon: string, pad = 0.05): { lat: number; lon: number } | null {
  return checked(Number(lat.replace(',', '.')), Number(lon.replace(',', '.')), pad);
}

function checked(lat: number, lon: number, pad: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return inGalicia(lon, lat, pad) ? { lat, lon } : null;
}
