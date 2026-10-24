import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareWithGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { INDICATORS, parseIgeCsv, type Raw, REQUESTS, type TableKey } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const keys = Object.keys(REQUESTS) as TableKey[];

// Route on the "/<table>/" segment of each request.
const routes = keys.map((k) => ({
  match: `/datos/${REQUESTS[k].split('/')[0]}/`,
  file: fx(`${k}.csv`),
}));

function rawFromFixtures(): Raw {
  const dec = new TextDecoder('latin1');
  return Object.fromEntries(keys.map((k) => [k, dec.decode(readFileSync(fx(`${k}.csv`)))])) as Raw;
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
    expect(ctx.requested).toHaveLength(11);
    for (const u of ctx.requested) {
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
    // A table without the expected indicator label.
    const bad = raw.t723.replaceAll('Índice de envellecemento', 'Outro');
    await expect(async () =>
      adapter.normalize({ ...raw, t723: bad }, fixtureContext(layer, [])),
    ).rejects.toThrow(/Índice de envellecemento/);
  });
});
