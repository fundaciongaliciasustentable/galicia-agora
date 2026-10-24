import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareWithGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  INDICATORS,
  parseIgeCsv,
  parseIneVivendas,
  type Raw,
  REQUESTS,
  type TableKey,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const keys = Object.keys(REQUESTS) as TableKey[];

// Route on the "/<table>/" segment of each request.
const routes = [
  ...keys.map((k) => ({
    match: `/datos/${REQUESTS[k].split('/')[0]}/`,
    file: fx(`${k}.csv`),
  })),
  { match: 'servicios.ine.es/wstempus/js/ES/DATOS_TABLA/59531', file: fx('ine59531.json') },
];

function rawFromFixtures(): Raw {
  const dec = new TextDecoder('latin1');
  return {
    ...Object.fromEntries(keys.map((k) => [k, dec.decode(readFileSync(fx(`${k}.csv`)))])),
    ine59531: readFileSync(fx('ine59531.json'), 'utf-8'),
  } as Raw;
}

async function run() {
  const ctx = fixtureContext(layer, routes, { env: { IGE_PAUSE_MS: '0' } });
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

const props = (out: Awaited<ReturnType<typeof run>>['out'], cod: string) =>
  out.collection.features.find((f) => f.id === cod)?.properties as Record<string, unknown>;

describe('indicadores-concellos adapter', () => {
  it('makes one filtered request per table, with encoded brackets', async () => {
    const { ctx } = await run();
    // 12 IGE tables + 1 INE table; well under the 18-request budget.
    expect(ctx.requested).toHaveLength(13);
    expect(ctx.requested.length).toBeLessThanOrEqual(18);
    const ige = ctx.requested.filter((u) => u.includes('ige.gal'));
    expect(ige).toHaveLength(12);
    expect(ctx.requested.at(-1)).toBe(
      'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/59531?nult=1',
    );
    for (const u of ige) {
      expect(u.startsWith('https://www.ige.gal/igebdt/igeapi/csv/datos/')).toBe(true);
      expect(u).not.toMatch(/[[\]]/);
      expect(u.split('/datos/')[1]).toMatch(/^\d+\/.+/);
    }
  });

  it('outputs one row per current concello with null geometry and valid properties', async () => {
    const { out } = await run();
    const ids = out.collection.features.map((f) => f.id);
    expect(ids).toHaveLength(15);
    for (const ext of ['15026', '15063', '36011', '36012', '12', '15', '1501']) {
      expect(ids).not.toContain(ext);
    }
    for (const f of out.collection.features) {
      expect(f.geometry).toBeNull();
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(out.publishedAt).toBeNull();
  });

  it('passes original values through and compares with Galicia', async () => {
    const { out } = await run();
    const p = props(out, '15001');
    expect(p.nome).toBe('Abegondo');
    expect(p.envellecemento).toBe(215);
    expect(p.envellecemento_galicia).toBe(176.27);
    expect(p.envellecemento_rel).toBe(compareWithGalicia(215, 176.27, 'index'));
    expect(p.envellecemento_periodo).toBe('2025');
    expect(p.idade_media_rel).toBe(compareWithGalicia(50.73, 48.52, 'points'));
    expect(p.afiliacion_agro_pct_periodo).toMatch(/^\d{4}\/\S+$/);
    expect(p.renda_hab_galicia).toBe(19053);
    // Each indicator id from layer.yaml has its four properties.
    const ids = (layer.indicators ?? []).map((i) => i.id);
    expect(ids).toEqual(INDICATORS.map((i) => i.id));
    for (const i of layer.indicators ?? []) {
      expect(INDICATORS.find((x) => x.id === i.id)?.comparison).toBe(i.comparison);
    }
  });

  it('computes derived indicators', async () => {
    const { out } = await run();
    const p = props(out, '15001');
    // Abegondo population 2015 and 2025 from table 1558.
    expect(p.variacion_poboacion_10a_periodo).toBe('2015–2025');
    expect(typeof p.variacion_poboacion_10a).toBe('number');
    expect(p.natalidade_3a_periodo).toBe('2023–2025');
    // Galicia 3-year birth rate is near the single-year rate (4.93‰ in 2024).
    expect(p.natalidade_3a_galicia as number).toBeGreaterThan(4);
    expect(p.natalidade_3a_galicia as number).toBeLessThan(6);
    expect(p.paro_rel_galicia as number).toBeGreaterThan(3);
    expect(p.paro_rel_galicia as number).toBeLessThan(15);
    expect(p.bovino_km2 as number).toBeGreaterThan(0);
  });

  it('computes agrarian census and empty-dwelling indicators', async () => {
    const { out } = await run();
    const p = props(out, '15001');
    // Abegondo: 209 holdings with SAU, 1,357 ha SAU (table 10331); INE 1,018 of 3,377 empty.
    expect(p.explotacions_1000hab_periodo).toBe('2020');
    expect(p.sau_pct_periodo).toBe('2020');
    expect(p.vivendas_baleiras_pct_periodo).toBe('2021');
    expect(p.vivendas_baleiras_pct).toBeCloseTo((1018 / 3377) * 100, 2);
    // Galicia: 506,351 of 1,757,739 dwellings empty.
    expect(p.vivendas_baleiras_pct_galicia).toBeCloseTo((506351 / 1757739) * 100, 2);
    expect(p.vivendas_baleiras_pct_rel).toBe(
      compareWithGalicia(
        p.vivendas_baleiras_pct as number,
        p.vivendas_baleiras_pct_galicia as number,
        'points',
      ),
    );
    // Galicia: 74,757 holdings for ~2.7 M inhabitants; 597,993 ha SAU over ~29,575 km².
    expect(p.explotacions_1000hab_galicia as number).toBeGreaterThan(25);
    expect(p.explotacions_1000hab_galicia as number).toBeLessThan(30);
    expect(p.sau_pct_galicia as number).toBeGreaterThan(19);
    expect(p.sau_pct_galicia as number).toBeLessThan(22);
    expect(p.explotacions_1000hab as number).toBeGreaterThan(0);
    expect(p.sau_pct_rel).toBe(
      compareWithGalicia(p.sau_pct as number, p.sau_pct_galicia as number, 'points'),
    );
    // Merged concello (2016) has its own census and INE figures.
    expect(props(out, '36902').vivendas_baleiras_pct).toBeCloseTo((1459 / 4075) * 100, 2);
  });

  it('publishes no empty-dwelling value for concellos INE does not list', async () => {
    const raw = rawFromFixtures();
    const ine = (JSON.parse(raw.ine59531) as Array<{ Nombre: string }>).filter(
      (s) => !s.Nombre.startsWith('27034 '),
    );
    const out = await adapter.normalize(
      { ...raw, ine59531: JSON.stringify(ine) },
      fixtureContext(layer, []),
    );
    const p = props(out, '27034');
    expect(p.vivendas_baleiras_pct).toBeNull();
    expect(p.vivendas_baleiras_pct_rel).toBeNull();
    expect(p.vivendas_baleiras_pct_galicia).not.toBeNull();
    // Secret values are null too.
    const m = parseIneVivendas(
      '[{"Nombre":"12 Galicia, Viviendas vacías","Data":[{"Valor":5,"Secreto":false}]},' +
        '{"Nombre":"15001 Abegondo, Viviendas vacías","Data":[{"Valor":3,"Secreto":true}]}]',
      ['Viviendas vacías'],
    );
    expect(m['Viviendas vacías']?.get('15001')).toBeNull();
  });

  it('rebuilds the 2015 population of Cerdedo-Cotobade from Cerdedo + Cotobade', async () => {
    const { out } = await run();
    const p = props(out, '36902');
    // 2015: 1828 + 4332 = 6160; 2025: 5656.
    expect(p.variacion_poboacion_10a).toBeCloseTo(((5656 - 6160) / 6160) * 100, 2);
    // Table 744 reports 0 unemployed for the merged concellos: treated as no data.
    expect(p.paro_rel).toBeNull();
    expect(p.paro_rel_rel).toBeNull();
    expect(props(out, '27034').nome).toBe('Navia de Suarna');
  });

  it('reads missing values as null', () => {
    const rows = parseIgeCsv(
      '"CodTempo","Tempo","CodEspazo","Espazo","DatoN","DatoT"\n' +
        '2025,"2025","12","12 Galicia",10,"10"\n2025,"2025","15001","15001 Abegondo",,"*"\n',
    );
    expect(rows[1]?.value).toBeNull();
    expect(rows[1]?.nome).toBe('Abegondo');
  });

  it('throws on malformed or empty responses', async () => {
    expect(() => parseIgeCsv('<html>Erro</html>')).toThrow();
    expect(() =>
      parseIgeCsv('"CodTempo","Tempo","CodEspazo","Espazo","DatoN","DatoT"\n'),
    ).toThrow();
    const raw = rawFromFixtures();
    await expect(async () =>
      adapter.normalize({ ...raw, t744: '' }, fixtureContext(layer, [])),
    ).rejects.toThrow();
    await expect(async () =>
      adapter.normalize({ ...raw, ine59531: '<html>Erro</html>' }, fixtureContext(layer, [])),
    ).rejects.toThrow(/ine59531/);
    await expect(async () =>
      adapter.normalize({ ...raw, ine59531: '[]' }, fixtureContext(layer, [])),
    ).rejects.toThrow(/ine59531/);
    await expect(async () =>
      adapter.normalize({ ...raw, t10331: '' }, fixtureContext(layer, [])),
    ).rejects.toThrow();
    // A table without the expected indicator label.
    const bad = raw.t723.replaceAll('Índice de envellecemento', 'Outro');
    await expect(async () =>
      adapter.normalize({ ...raw, t723: bad }, fixtureContext(layer, [])),
    ).rejects.toThrow(/Índice de envellecemento/);
  });
});
