import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  buildFeatures,
  concellosFromRows,
  FALLBACK_XLSX_URL,
  findXlsxUrl,
  galiciaFromCcaa,
  INFO_URL,
  parseSharedStrings,
  parseSheet,
  parseWorkbookSheets,
  RowScanner,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const xml = (f: string) => readFileSync(fx(`xlsx/${f}`), 'utf8');
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

const strings = parseSharedStrings(xml('xl/sharedStrings.xml'));
const sheet2 = xml('xl/worksheets/sheet2.xml');
const sheet4 = xml('xl/worksheets/sheet4.xml');

function features() {
  return buildFeatures(concellosFromRows(parseSheet(sheet2, strings)), () =>
    parseSheet(sheet4, strings),
  );
}
const byId = (cod: string) => features().find((f) => f.id === cod)?.properties ?? {};

let hasZip = true;
try {
  execFileSync('zip', ['-v'], { stdio: 'ignore' });
} catch {
  hasZip = false;
}
const tmp = mkdtempSync(join(tmpdir(), 'cobertura-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('cobertura-banda-larga XML parsing', () => {
  it('resolves sheet names to ZIP members', () => {
    const sheets = parseWorkbookSheets(xml('xl/workbook.xml'), xml('xl/_rels/workbook.xml.rels'));
    expect(sheets.get('Municipio_%hogar')).toBe('xl/worksheets/sheet2.xml');
    expect(sheets.get('CCAA_%hogar')).toBe('xl/worksheets/sheet4.xml');
  });

  it('keeps shared string indices', () => {
    expect(strings).toHaveLength(16365);
    expect(strings[2]).toBe('CMUN');
    expect(strings[16345]).toBe('Hogares');
  });

  it('builds one valid row per Galician concello, skipping other regions', () => {
    const fs = features();
    expect(fs).toHaveLength(15);
    for (const f of fs) {
      expect(f.geometry).toBeNull();
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      expect(f.properties.codigo_ine).toMatch(/^(15|27|32|36)\d{3}$/);
    }
  });

  it('reads the latest year of each indicator as a percentage', () => {
    const p = byId('15001');
    expect(p.nome).toBe('Abegondo');
    // FTTH (junio 2025) = 0.70766319772942288 in the sheet.
    expect(p.ftth).toBe(70.77);
    expect(p.cobertura_5g).toBe(99.98);
    expect(p.ftth_periodo).toBe('30/06/2025');
    expect(p.ftth_rel).toBeCloseTo((p.ftth as number) - (p.ftth_galicia as number), 2);
    expect(byId('27034').nome).toBe('Navia de Suarna');
    expect(byId('36902').nome).toBe('Cerdedo-Cotobade');
  });

  it('falls back to the CCAA sheet when households are missing', () => {
    const parsed = concellosFromRows(parseSheet(sheet2, strings));
    for (const c of parsed.concellos) c.hogares = null;
    const ccaa = galiciaFromCcaa(parseSheet(sheet4, strings));
    // Official Galicia row (junio 2025): FTTH 88.05 %.
    expect(ccaa?.ftth).toBe(88.05);
    const fs = buildFeatures(parsed, () => parseSheet(sheet4, strings));
    expect(fs[0]?.properties.ftth_galicia).toBe(88.05);
  });

  it('scans rows split across chunks', () => {
    const scanner = new RowScanner(strings);
    const rows = [];
    for (let i = 0; i < sheet2.length; i += 777)
      rows.push(...scanner.push(sheet2.slice(i, i + 777)));
    expect(rows).toHaveLength(18);
  });

  it('finds the newest municipal XLSX link', () => {
    const html = readFileSync(fx('informacion-cobertura.html'), 'utf8');
    expect(findXlsxUrl(html)).toBe(FALLBACK_XLSX_URL);
    expect(findXlsxUrl('<p>nada</p>')).toBeNull();
  });

  it('throws on malformed input', () => {
    expect(() => parseSharedStrings('<html/>')).toThrow();
    expect(() => parseSheet('<html/>', strings)).toThrow();
    expect(() => concellosFromRows([])).toThrow();
    const noHeaders = sheet2.replace(/<row r="1"[\s\S]*?<\/row>/, '');
    expect(() => concellosFromRows(parseSheet(noHeaders, strings))).toThrow();
    expect(() =>
      buildFeatures({ ...concellosFromRows(parseSheet(sheet2, strings)), concellos: [] }, () => []),
    ).toThrow();
  });
});

describe.skipIf(!hasZip)('cobertura-banda-larga adapter (fetch + normalize on a test ZIP)', () => {
  const xlsx = join(tmp, 'test.xlsx');
  execFileSync('zip', ['-q', '-r', xlsx, '.'], { cwd: fx('xlsx') });

  it('downloads the linked XLSX and normalizes it', async () => {
    const ctx = fixtureContext(layer, [
      { match: INFO_URL, file: fx('informacion-cobertura.html') },
      { match: '.xlsx', file: xlsx },
    ]);
    const raw = await adapter.fetch(ctx);
    expect(ctx.requested).toEqual([INFO_URL, FALLBACK_XLSX_URL]);
    const out = await adapter.normalize(raw, ctx);
    expect(out.collection.features).toHaveLength(15);
    // No Last-Modified in fixtures: falls back to docProps/core.xml.
    expect(out.publishedAt).toBe('2026-03-19T11:22:23.000Z');
    for (const f of out.collection.features) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
  });

  it('rejects a download that is not a ZIP', async () => {
    const ctx = fixtureContext(layer, [
      { match: INFO_URL, file: fx('informacion-cobertura.html') },
      { match: '.xlsx', file: fx('informacion-cobertura.html') },
    ]);
    await expect(adapter.fetch(ctx)).rejects.toThrow(/not an XLSX/);
  });
});
