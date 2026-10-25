import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { concellosFromIge, countVut, INDICATORS } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  { match: 'reat_directorio-alojamientos_esp.csv', file: fx('aloxamentos-vut.csv') },
  { match: 'igeapi/csv/datos/1558/', file: fx('t1558.csv') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

const GALICIA_POP = 2714741;

describe('vut-concello adapter', () => {
  it('makes two requests and returns one row per concello', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toEqual([
      'https://descargascdn.xunta.gal/interno/smarxa/reat_directorio-alojamientos_esp.csv',
      'https://www.ige.gal/igebdt/igeapi/csv/datos/1558/T%5B1:a%5D',
    ]);
    const fs = out.collection.features;
    expect(fs).toHaveLength(313);
    for (const f of fs) {
      expect(f.geometry).toBeNull();
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    // Extinct IGE codes of the merged concellos are not rows.
    const ids = new Set(fs.map((f) => f.id));
    for (const c of ['15026', '15063', '36011', '36012']) expect(ids.has(c)).toBe(false);
    expect(out.publishedAt).toBe('2026-09-30T22:00:00.000Z');
  });

  it('matches upper-case REAT names to INE codes, merged concellos included', async () => {
    const { out } = await run();
    const p = (cod: string) => out.collection.features.find((f) => f.id === cod)?.properties;
    // Fixture: 73 VUT, 528 declared places, one VUT in Taboadela without places.
    expect(p('36902')).toMatchObject({ nome: 'Cerdedo Cotobade', vut: 39, prazas_vut: 309 });
    expect(p('15902')).toMatchObject({ nome: 'Oza Cesuras', vut: 19, prazas_vut: 141 });
    expect(p('32003')).toMatchObject({ nome: 'Arnoia, A', vut: 7, prazas_vut: 41 });
    expect(p('15036')).toMatchObject({ vut: 1, prazas_vut: 4 });
    expect(p('32080')).toMatchObject({ vut: 0, prazas_vut: 0 });
    const taboadela = out.collection.features.find((f) => f.properties.nome === 'Taboadela');
    expect(taboadela?.properties).toMatchObject({ vut: 5, prazas_vut: 23, vut_sen_prazas: 1 });
  });

  it('computes rates per 1,000 inhabitants and the difference with Galicia', async () => {
    const { out } = await run();
    const cerdedo = out.collection.features.find((f) => f.id === '36902')?.properties;
    const galVut = Math.round((73 / GALICIA_POP) * 1000 * 100) / 100;
    expect(cerdedo).toMatchObject({
      poboacion: 5656,
      poboacion_ano: '2025',
      data_referencia: '2026-10-01',
      vut_1000hab: 6.9,
      vut_1000hab_galicia: galVut,
      vut_1000hab_rel: Math.round((6.9 - galVut) * 100) / 100,
      vut_1000hab_periodo: '2026-10-01 (poboación 2025)',
      prazas_vut_1000hab: 54.63,
      prazas_vut_1000hab_galicia: Math.round((528 / GALICIA_POP) * 1000 * 100) / 100,
    });
    // A concello with no VUT still gets a comparison (a difference, not an index).
    const sarreaus = out.collection.features.find((f) => f.id === '32078')?.properties;
    expect(sarreaus).toMatchObject({ vut: 0, vut_1000hab: 0, vut_1000hab_rel: -galVut });
    expect(INDICATORS.every((i) => i.comparison === 'points')).toBe(true);
  });

  it('fails when a REAT concello name has no INE code', async () => {
    const ige = concellosFromIge(await readFile(fx('t1558.csv'), 'latin1'));
    expect(ige.concellos).toHaveLength(313);
    const reat = (await readFile(fx('aloxamentos-vut.csv'), 'utf8')).replaceAll(
      '"TABOADELA";"OURENSE"',
      '"TABOADELLA";"OURENSE"',
    );
    expect(() => countVut(reat, ige.concellos)).toThrow(/without INE code: TABOADELLA/);
  });
});
