import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { quarterLabel, tableUrl } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real IGE API answers of 1/11/2026 for 2024/I–2025/II (tables 9043 and 9046), trimmed to
// Galicia, Sanxenxo, Barreiros, Lugo and the extinct code of Cesuras.
const ctx = () =>
  fixtureContext(
    layer,
    [
      { match: '/9043/', file: fx('ige_9043.csv') },
      { match: '/9046/', file: fx('ige_9046.csv') },
    ],
    { env: { IGE_PAUSE_MS: '0' } },
  );

describe('poboacion-estacional adapter', () => {
  it('keeps the IGE quarters as published and compares the latest with Galicia', async () => {
    const c = ctx();
    const raw = await adapter.fetch(c);
    expect(c.requested).toEqual([tableUrl('9043'), tableUrl('9046')]);
    const { collection } = await adapter.normalize(raw, c);
    expect(collection.features.map((f) => f.properties.codigo_ine)).toEqual([
      '27005',
      '27028',
      '36051',
    ]);
    const sanxenxo = collection.features.find(
      (f) => f.properties.codigo_ine === '36051',
    )?.properties;
    expect(validateWithSchema(schema, sanxenxo)).toEqual([]);
    expect(sanxenxo?.trimestres).toEqual([
      '2024/I',
      '2024/II',
      '2024/III',
      '2024/IV',
      '2025/I',
      '2025/II',
    ]);
    // The IGE's own values, untouched.
    expect(sanxenxo?.taxa).toEqual(expect.arrayContaining([106.93, 118.07, 173.86, 110.24]));
    expect((sanxenxo?.residentes as number[] | undefined)?.[2]).toBe(17956);
    expect((sanxenxo?.turismo as number[] | undefined)?.[2]).toBe(9386);
    expect((sanxenxo?.segundas_vivendas as number[] | undefined)?.[2]).toBe(3895);
    // Latest published quarter: 2025/II (provisional).
    expect(sanxenxo?.taxa_carga_periodo).toBe('2025/II');
    expect(sanxenxo?.provisional).toEqual([false, false, false, false, true, true]);
    expect(sanxenxo?.taxa_carga_rel).toBeCloseTo(
      (sanxenxo?.taxa_carga as number) - (sanxenxo?.taxa_carga_galicia as number),
      2,
    );
  });

  it('labels quarters', () => {
    expect(quarterLabel('202415')).toBe('2024/III');
  });
});
