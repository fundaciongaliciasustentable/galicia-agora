// Broadband coverage by concello (% of households) from the Ministry for Digital
// Transformation annual XLSX (situation at 30 June). One row per Galician concello with
// geometry null; the client joins rows to concellos-parroquias by codigo_ine.
//
// The XLSX (~6.5 MB, sheets of ~12 and ~18 MB uncompressed) is a ZIP: it is written to a
// temporary file and members are read with the system `unzip -p`. The municipal sheet is
// streamed and scanned row by row with a small regex scanner (no XML library). Parsing
// functions take XML strings so tests can feed them real, trimmed sheet XML.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { type Adapter, compareWithGalicia, type Feature, round } from '../../lib/adapter.ts';

/** Page that links the current XLSX (its file name changes with each edition). */
export const INFO_URL =
  'https://digital.gob.es/telecomunicaciones-infraestructuras-digitales/areas-interes/banda-ancha/informacion-cobertura';
/** Edition verified on 2026-10-24, used if the page cannot be read. */
export const FALLBACK_XLSX_URL =
  'https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/banda-ancha/cobertura/documents/Cobertura_BA_Espa%C3%B1a_2021-2025_MUN_PROV_CCAA_Nacional_datosgob_DEF.xlsx';

export const MUNICIPAL_SHEET = 'Municipio_%hogar';
export const CCAA_SHEET = 'CCAA_%hogar';
const DOWNLOAD_TIMEOUT_MS = 180_000;

/** Galician INE province prefixes. */
export const GALICIAN_CODE = /^(15|27|32|36)\d{3}$/;

/** Indicators and the exact header (whitespace collapsed) of their columns; YYYY = year. */
export const INDICATORS = [
  { id: 'ftth', header: /^FTTH \(junio (\d{4})\)$/ },
  {
    id: 'velocidade_100mbps',
    header: /^Cob\. 100Mbps condiciones máxima demanda \(junio (\d{4})\)$/,
  },
  {
    id: 'velocidade_1gbps',
    header: /^Cob\. 1Gbps descarga condiciones máxima demanda \(junio (\d{4})\)$/,
  },
  { id: 'cobertura_5g', header: /^5G \(junio (\d{4})\)$/ },
] as const;

export type IndicatorId = (typeof INDICATORS)[number]['id'];

export interface Raw {
  /** Temporary directory holding the XLSX; removed by normalize. */
  dir: string;
  xlsxPath: string;
  /** Last-Modified header of the XLSX download, if any. */
  lastModified: string | null;
}

// ─── XML helpers ───────────────────────────────────────────────────────────

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    return String.fromCodePoint(
      k.startsWith('#x') ? Number.parseInt(k.slice(2), 16) : Number(k.slice(1)),
    );
  });
}

function textRuns(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

/** Shared strings table, in order (rich-text runs concatenated; `<si/>` is ''). */
export function parseSharedStrings(xml: string): string[] {
  if (!/<sst\b/.test(xml)) throw new Error('sharedStrings.xml: no <sst> element');
  const out: string[] = [];
  for (const m of xml.matchAll(/<si\s*\/>|<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
    out.push(m[1] === undefined ? '' : textRuns(m[1]));
  }
  return out;
}

/** Sheet name → member path inside the ZIP (e.g. "xl/worksheets/sheet2.xml"). */
export function parseWorkbookSheets(workbookXml: string, relsXml: string): Map<string, string> {
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? '';
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) {
      targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    }
  }
  const sheets = new Map<string, string>();
  for (const m of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? '';
    const name = /\bname="([^"]+)"/.exec(attrs)?.[1];
    const rid = /\br:id="([^"]+)"/.exec(attrs)?.[1];
    const path = rid ? targets.get(rid) : undefined;
    if (name && path) sheets.set(decodeXml(name), path);
  }
  if (sheets.size === 0) throw new Error('workbook.xml: no sheets found');
  return sheets;
}

/** One sheet row: cell values by column letters ("A", "AB"); strings resolved. */
export type SheetRow = Map<string, string>;

/** Parse the cells of one `<row>…</row>` element. */
export function parseRow(rowXml: string, strings: string[]): SheetRow {
  const cells: SheetRow = new Map();
  for (const m of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1] ?? '';
    const body = m[2];
    const col = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
    if (!col || body === undefined) continue;
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
    let value: string | undefined;
    if (type === 'inlineStr') value = textRuns(body);
    else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (v === undefined) continue;
      if (type === 's') {
        const s = strings[Number(v)];
        if (s === undefined) throw new Error(`shared string ${v} out of range`);
        value = s;
      } else value = decodeXml(v);
    }
    cells.set(col, value);
  }
  return cells;
}

/** Incremental scanner: feed XML text chunks, get every complete row. */
export class RowScanner {
  private buf = '';
  constructor(private readonly strings: string[]) {}

  push(chunk: string): SheetRow[] {
    this.buf += chunk;
    const end = this.buf.lastIndexOf('</row>');
    if (end < 0) {
      // Keep the buffer bounded while skipping the sheet preamble.
      const start = this.buf.lastIndexOf('<row');
      if (start < 0 && this.buf.length > 1_000_000) this.buf = this.buf.slice(-100);
      return [];
    }
    const complete = this.buf.slice(0, end + 6);
    this.buf = this.buf.slice(end + 6);
    const rows: SheetRow[] = [];
    for (const m of complete.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      rows.push(parseRow(m[1] ?? '', this.strings));
    }
    return rows;
  }
}

/** All rows of a sheet XML string (for small sheets and tests). */
export function parseSheet(xml: string, strings: string[]): SheetRow[] {
  if (!/<sheetData\b/.test(xml)) throw new Error('sheet XML: no <sheetData>');
  return new RowScanner(strings).push(xml);
}

// ─── Coverage table ────────────────────────────────────────────────────────

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface Columns {
  cmun: string;
  municipio: string;
  hogares: string;
  indicators: Record<IndicatorId, { col: string; year: number; header: string }>;
}

/** Locate the needed columns in the header row (latest year for each indicator). */
export function findColumns(header: SheetRow): Columns {
  const byName = new Map<string, string>();
  for (const [col, v] of header) byName.set(norm(v), col);
  const need = (name: string) => {
    const col = byName.get(name);
    if (!col) throw new Error(`coverage sheet: no "${name}" column`);
    return col;
  };
  const indicators = {} as Columns['indicators'];
  for (const { id, header: re } of INDICATORS) {
    let best: { col: string; year: number; header: string } | null = null;
    for (const [name, col] of byName) {
      const m = re.exec(name);
      if (m && (!best || Number(m[1]) > best.year))
        best = { col, year: Number(m[1]), header: name };
    }
    if (!best) throw new Error(`coverage sheet: no column for ${id} (${re})`);
    indicators[id] = best;
  }
  return { cmun: need('CMUN'), municipio: need('Municipio'), hogares: need('Hogares'), indicators };
}

/** Fraction (0–1) → percentage with 2 decimals; float noise just above 1 is clamped. */
export function pct(v: string | undefined): number | null {
  const n = fraction(v);
  return n === null ? null : round(n * 100, 2);
}

/** Cell value as a fraction clamped to [0, 1], or null when empty. */
export function fraction(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`coverage sheet: non-numeric value "${v}"`);
  return Math.min(Math.max(n, 0), 1);
}

export interface Concello {
  cod: string;
  nome: string;
  hogares: number | null;
  /** Percentages rounded to 2 decimals (published). */
  values: Record<IndicatorId, number | null>;
  /** Unrounded fractions, used to weight the Galicia value. */
  exact: Record<IndicatorId, number | null>;
}

export function concelloFromRow(row: SheetRow, cols: Columns): Concello | null {
  const cod = (row.get(cols.cmun) ?? '').trim().padStart(5, '0');
  if (!GALICIAN_CODE.test(cod)) return null;
  const h = Number(row.get(cols.hogares));
  const values = {} as Concello['values'];
  const exact = {} as Concello['exact'];
  for (const { id } of INDICATORS) {
    exact[id] = fraction(row.get(cols.indicators[id].col));
    values[id] = exact[id] === null ? null : round((exact[id] as number) * 100, 2);
  }
  return {
    cod,
    nome: norm(row.get(cols.municipio) ?? ''),
    hogares: Number.isFinite(h) && h > 0 ? h : null,
    values,
    exact,
  };
}

/** Household-weighted Galicia value; null if any concello lacks households or the value. */
export function weightedGalicia(concellos: Concello[], id: IndicatorId): number | null {
  let num = 0;
  let den = 0;
  for (const c of concellos) {
    const v = c.exact[id];
    if (c.hogares === null || v === null) return null;
    num += v * c.hogares;
    den += c.hogares;
  }
  return den > 0 ? round((num / den) * 100, 2) : null;
}

/** Galicia row of the CCAA sheet (same column headers), for the fallback. */
export function galiciaFromCcaa(rows: SheetRow[]): Record<IndicatorId, number | null> | null {
  const header = rows[0];
  if (!header) return null;
  const byName = new Map<string, string>();
  for (const [col, v] of header) byName.set(norm(v), col);
  const row = rows.find((r) => norm(r.get('A') ?? '').toUpperCase() === 'GALICIA');
  if (!row) return null;
  const out = {} as Record<IndicatorId, number | null>;
  for (const { id, header: re } of INDICATORS) {
    let best: { col: string; year: number } | null = null;
    for (const [name, col] of byName) {
      const m = re.exec(name);
      if (m && (!best || Number(m[1]) > best.year)) best = { col, year: Number(m[1]) };
    }
    out[id] = best ? pct(row.get(best.col)) : null;
  }
  return out;
}

export interface Parsed {
  concellos: Concello[];
  cols: Columns;
}

/** Build features from the parsed municipal rows (and CCAA rows for the fallback). */
export function buildFeatures(parsed: Parsed, ccaaRows: () => SheetRow[]): Feature[] {
  const { concellos, cols } = parsed;
  if (concellos.length === 0) throw new Error('coverage sheet: no Galician concellos');
  const galicia = {} as Record<IndicatorId, number | null>;
  let ccaa: Record<IndicatorId, number | null> | null | undefined;
  for (const { id } of INDICATORS) {
    let g = weightedGalicia(concellos, id);
    if (g === null) {
      if (ccaa === undefined) ccaa = galiciaFromCcaa(ccaaRows());
      g = ccaa?.[id] ?? null;
    }
    galicia[id] = g;
  }
  return concellos
    .sort((a, b) => a.cod.localeCompare(b.cod))
    .map((c) => {
      const properties: Record<string, unknown> = { codigo_ine: c.cod, nome: c.nome };
      for (const { id } of INDICATORS) {
        properties[id] = c.values[id];
        properties[`${id}_galicia`] = galicia[id];
        properties[`${id}_rel`] = compareWithGalicia(c.values[id], galicia[id], 'points');
        properties[`${id}_periodo`] = `30/06/${cols.indicators[id].year}`;
      }
      return { type: 'Feature', id: c.cod, geometry: null, properties } satisfies Feature;
    });
}

/** Rows → concellos (first row is the header). */
export function concellosFromRows(rows: Iterable<SheetRow>): Parsed {
  let cols: Columns | null = null;
  const concellos: Concello[] = [];
  for (const row of rows) {
    if (!cols) {
      cols = findColumns(row);
      continue;
    }
    const c = concelloFromRow(row, cols);
    if (c) concellos.push(c);
  }
  if (!cols) throw new Error('coverage sheet: empty');
  return { concellos, cols };
}

// ─── Page and ZIP access ───────────────────────────────────────────────────

/** Latest municipal XLSX linked from the information page (highest end year), or null. */
export function findXlsxUrl(html: string, pageUrl = INFO_URL): string | null {
  let best: { url: string; year: number } | null = null;
  for (const m of html.matchAll(/href="([^"]*Cobertura_BA_[^"]*_MUN_[^"]*\.xlsx)"/gi)) {
    const href = decodeXml(m[1] as string);
    const year = Math.max(...[...href.matchAll(/(?:19|20)\d{2}/g)].map((y) => Number(y[0])));
    if (!best || year > best.year) best = { url: new URL(href, pageUrl).href, year };
  }
  return best?.url ?? null;
}

/** `unzip -p` one member into a string (small members only). */
export async function readMember(zipPath: string, member: string): Promise<string> {
  let text = '';
  await streamMember(zipPath, member, (chunk) => {
    text += chunk;
  });
  return text;
}

/** Stream one member of the ZIP as UTF-8 text chunks. */
export async function streamMember(
  zipPath: string,
  member: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const child = spawn('unzip', ['-p', zipPath, member], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => {
    if (stderr.length < 2000) stderr += d.toString('utf8');
  });
  const exit = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? -1));
  });
  exit.catch(() => {}); // awaited below
  const decoder = new StringDecoder('utf8');
  try {
    for await (const chunk of child.stdout) onChunk(decoder.write(chunk as Buffer));
    const rest = decoder.end();
    if (rest) onChunk(rest);
  } finally {
    if (child.exitCode === null) child.kill();
  }
  const code = await exit;
  if (code !== 0) {
    throw new Error(`unzip -p ${member} exited with ${code}: ${stderr.trim().slice(0, 300)}`);
  }
}

function httpDateToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** dcterms:modified from docProps/core.xml, as ISO UTC. */
export function coreModified(coreXml: string): string | null {
  const v = /<dcterms:modified\b[^>]*>([^<]+)<\/dcterms:modified>/.exec(coreXml)?.[1];
  return v && /Z$|[+-]\d{2}:\d{2}$/.test(v.trim()) ? httpDateToIso(v.trim()) : null;
}

const adapter = {
  async fetch(ctx) {
    let url = FALLBACK_XLSX_URL;
    try {
      const page = await ctx.get(INFO_URL, { timeoutMs: 60_000, retries: 1 });
      url = findXlsxUrl(page.body.toString('utf8')) ?? FALLBACK_XLSX_URL;
    } catch {
      url = FALLBACK_XLSX_URL;
    }
    const res = await ctx.get(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
    const body = res.body;
    // ZIP local file header "PK\x03\x04".
    if (body.length < 4 || body.readUInt32LE(0) !== 0x04034b50) {
      const head = body.subarray(0, 100).toString('utf8').replace(/\s+/g, ' ');
      throw new Error(`Coverage download is not an XLSX (${body.length} bytes): ${head}`);
    }
    const dir = await mkdtemp(join(tmpdir(), 'cobertura-banda-larga-'));
    const xlsxPath = join(dir, 'cobertura.xlsx');
    try {
      await writeFile(xlsxPath, body);
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw err;
    }
    const lastModified =
      res.lastModified ??
      Object.entries(res.headers).find(([k]) => k.toLowerCase() === 'last-modified')?.[1] ??
      null;
    return { dir, xlsxPath, lastModified };
  },

  async normalize(raw, _ctx) {
    try {
      const { xlsxPath } = raw;
      const sheets = parseWorkbookSheets(
        await readMember(xlsxPath, 'xl/workbook.xml'),
        await readMember(xlsxPath, 'xl/_rels/workbook.xml.rels'),
      );
      const municipal = sheets.get(MUNICIPAL_SHEET);
      if (!municipal) {
        throw new Error(
          `XLSX has no "${MUNICIPAL_SHEET}" sheet (${[...sheets.keys()].join(', ')})`,
        );
      }
      const strings = parseSharedStrings(await readMember(xlsxPath, 'xl/sharedStrings.xml'));

      // Stream the municipal sheet; keep only the header and Galician rows.
      const scanner = new RowScanner(strings);
      const state: { cols: Columns | null } = { cols: null };
      const concellos: Concello[] = [];
      await streamMember(xlsxPath, municipal, (chunk) => {
        for (const row of scanner.push(chunk)) {
          if (!state.cols) state.cols = findColumns(row);
          else {
            const c = concelloFromRow(row, state.cols);
            if (c) concellos.push(c);
          }
        }
      });
      const cols = state.cols;
      if (!cols) throw new Error(`${MUNICIPAL_SHEET}: no rows`);

      // The CCAA sheet is only read if the Galicia value cannot be weighted by households.
      let ccaa: SheetRow[] = [];
      const ccaaPath = sheets.get(CCAA_SHEET);
      if (ccaaPath) {
        const needed = INDICATORS.some(({ id }) => weightedGalicia(concellos, id) === null);
        if (needed) ccaa = parseSheet(await readMember(xlsxPath, ccaaPath), strings);
      }
      const features = buildFeatures({ concellos, cols }, () => ccaa);

      let publishedAt = httpDateToIso(raw.lastModified);
      if (!publishedAt) {
        try {
          publishedAt = coreModified(await readMember(xlsxPath, 'docProps/core.xml'));
        } catch {
          publishedAt = null;
        }
      }
      return { collection: { type: 'FeatureCollection', features }, publishedAt };
    } finally {
      await rm(raw.dir, { recursive: true, force: true });
    }
  },
} satisfies Adapter<Raw>;

export default adapter;
