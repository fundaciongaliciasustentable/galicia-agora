import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LayerDef, PublishedLayer } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { riverNames } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const read = async (id: string): Promise<PublishedLayer> => ({
  collection: JSON.parse(await readFile(fx(`${id}.geojson`), 'utf8')),
  meta: JSON.parse(await readFile(fx(`${id}.meta.json`), 'utf8')),
});

const before = process.env.DATA_OUT_DIR;
let features: Array<{ geometry: unknown; properties: Record<string, unknown> }> = [];
beforeAll(async () => {
  process.env.DATA_OUT_DIR = join(dir, 'fixtures');
  const ctx = {
    ...fixtureContext(layer, [{ match: 'datosDiarios', file: fx('choiva.json') }]),
    readLayer: read,
  };
  const out = await adapter.normalize(await adapter.fetch(ctx));
  features = out.collection.features;
});
afterAll(() => {
  process.env.DATA_OUT_DIR = before;
});

describe('crecida-episodios', () => {
  it('matches river names both ways', () => {
    expect(riverNames('Río Eume')).toEqual(['eume']);
    expect(riverNames('Eume - Monfero')).toEqual(['eume', 'monfero']);
    expect(riverNames('Río de Seixedo Ou Rego Buzarillo')).toEqual(['seixedo', 'buzarillo']);
  });

  it('builds hourly flows, lit rivers and daily rain from the real episode', () => {
    for (const f of features) expect(validateWithSchema(schema, f.properties)).toEqual([]);
    const monfero = features.find((f) => f.properties.nome === 'Eume - Monfero')?.properties;
    expect(monfero?.caudal as unknown[]).toHaveLength(144);
    // The Eume rose about tenfold on 7 October.
    expect(monfero?.caudal_pico as number).toBeGreaterThan(5 * (monfero?.caudal_base as number));
    expect(String(monfero?.hora_pico)).toMatch(/^2026-10-07/);
    const padron = features.find((f) => f.properties.nome === 'Ulla - Padrón')?.properties;
    expect(padron?.marea).toBe(true);
    // Eume and Xallas water bodies get a station; the Ulla only has the tidal one, so none.
    const rivers = features.filter((f) => f.properties.tipo === 'rio');
    expect(
      rivers.some(
        (f) => String(f.properties.nome) === 'Río Eume' && f.properties.estacion !== null,
      ),
    ).toBe(true);
    expect(
      rivers
        .filter((f) => f.properties.nome === 'Río Ulla')
        .every((f) => f.properties.estacion === null),
    ).toBe(true);
    const rain = features.filter((f) => f.properties.tipo === 'choiva');
    expect(rain.length).toBe(2);
    const choivaDia = rain[0]?.properties.choiva_dia as unknown[] | undefined;
    expect(choivaDia?.length).toBe(6);
  });
});
