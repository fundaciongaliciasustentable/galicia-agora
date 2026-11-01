import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real rows of REAT_Serie_Mensual.csv (all types) for Sanxenxo, Vigo and Xunqueira de Ambía
// in 2017M01, 2017M06, 2020M01 and 2026M10, recorded on 1/11/2026; their 2021 census from the
// published poboacion-seculo layer.
async function run() {
  const c = fixtureContext(layer, [
    { match: 'REAT_Serie_Mensual.csv', file: fx('REAT_Serie_Mensual.csv') },
  ]);
  c.readLayer = async (id) => {
    expect(id).toBe('poboacion-seculo');
    return {
      collection: JSON.parse(await readFile(fx('poboacion-seculo.geojson'), 'utf8')),
      meta: JSON.parse(await readFile(fx('poboacion-seculo.meta.json'), 'utf8')),
    };
  };
  const { collection } = await adapter.normalize(await adapter.fetch(c), c);
  return new Map(
    collection.features.map((f) => [String(f.id), f.properties as Record<string, unknown>]),
  );
}

describe('vut-mensual adapter', () => {
  it('counts tourist flats per month from the first month with any', async () => {
    const m = await run();
    expect([...m.keys()]).toEqual(['32036', '36051', '36057']);
    for (const p of m.values()) expect(validateWithSchema(schema, p)).toEqual([]);
    const sanxenxo = m.get('36051');
    expect(sanxenxo?.periodos).toEqual(['2017M06', '2020M01', '2026M10']);
    expect(sanxenxo?.vut).toEqual([60, 1728, 3304]);
    expect(sanxenxo?.prazas).toEqual([281, 8674, 17557]);
    expect(m.get('36057')?.vut).toEqual([15, 379, 1962]);
  });

  it('reads a month without a row as zero', async () => {
    expect((await run()).get('32036')?.vut).toEqual([0, 4, 5]);
  });

  it('gives flats per 1,000 residents of the 2021 census', async () => {
    const sanxenxo = (await run()).get('36051');
    expect(sanxenxo?.poboacion_2021).toBe(17622);
    expect((sanxenxo?.valor as number[] | undefined)?.at(-1)).toBe(187.5);
  });
});
