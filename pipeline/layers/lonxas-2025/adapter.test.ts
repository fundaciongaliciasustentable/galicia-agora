import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { dayOfYear, PLACES } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
type Props = {
  importe_total: number;
  kg_total: number;
  dias_venda: number;
  importe_dia: Record<'peixes' | 'bivalvos' | 'cefalopodos' | 'crustaceos', number[]>;
  especie_dia: Array<string | null>;
};
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real rows of pescafresca2025.csv, recorded on 1/11/2026: Burela and Cedeira on 1–10 January
// and 1–10 August, and four Baldaio rows (a lonxa without a point). Expected values are sums
// of the same rows done apart in Python.
async function run() {
  const c = fixtureContext(layer, [
    { match: 'pescafresca2025.csv', file: join(dir, 'fixtures', 'pescafresca2025.csv') },
  ]);
  return (await adapter.normalize(await adapter.fetch(c), c)).collection.features;
}

describe('lonxas-2025 adapter', () => {
  it('adds up euros by group and kg per lonxa and day', async () => {
    const features = await run();
    expect(features.map((f) => f.id)).toEqual(['Burela', 'Cedeira', 'Baldaio', 'galicia']);
    for (const f of features) expect(validateWithSchema(schema, f.properties)).toEqual([]);
    const burela = features[0]?.properties as unknown as Props;
    expect(burela.importe_total).toBe(3_314_664);
    expect(burela.kg_total).toBe(561_483);
    expect(burela.dias_venda).toBe(13);
    const aug5 = dayOfYear('05/08/2025');
    expect(burela.importe_dia.peixes[aug5]).toBe(119_101);
    expect(burela.importe_dia.crustaceos[aug5]).toBe(2_179);
    expect(burela.importe_dia.cefalopodos[aug5]).toBe(170);
    expect(burela.importe_dia.bivalvos[aug5]).toBe(0);
    expect(features[0]?.geometry).toEqual({ type: 'Point', coordinates: [-7.3548, 43.65747] });
  });

  it('keeps a lonxa without a point, without geometry', async () => {
    const baldaio = (await run()).find((f) => f.id === 'Baldaio');
    expect(baldaio?.geometry).toBeNull();
    expect(baldaio?.properties.importe_total).toBe(1_749);
  });

  it('gives Galicia the totals and the top species of each day', async () => {
    const g = (await run()).find((f) => f.id === 'galicia')?.properties as unknown as Props;
    expect(g.importe_total).toBe(3_314_664 + 324_351 + 1_749);
    expect(g.especie_dia[dayOfYear('05/08/2025')]).toBe('Bonito do norte');
    expect(g.especie_dia[dayOfYear('25/12/2025')]).toBeNull();
  });

  it('stops on a lonxa it cannot place', async () => {
    const raw = {
      csv: '01/01/2025;Peixes;HKE;Pescada;A Coruña;Zona X;Nova;1,0;5,0;5,00\n',
      lastModified: null,
    };
    expect(() => adapter.normalize(raw, {} as never)).toThrow(/Nova/);
  });

  it('reads day/month/year dates', () => {
    expect(dayOfYear('01/01/2025')).toBe(0);
    expect(dayOfYear('31/12/2025')).toBe(364);
    expect(dayOfYear('01/01/2024')).toBe(-1);
  });

  it('has one place per lonxa of 2025', () => {
    expect(PLACES).toHaveLength(60);
    expect(PLACES.filter((p) => !p.lonlat).map((p) => p.lonxa)).toEqual([
      'Baldaio',
      'Coop. Ría de Arosa',
    ]);
  });
});
