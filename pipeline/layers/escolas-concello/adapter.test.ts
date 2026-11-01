import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real rows of IGE table 1653, recorded on 1/11/2026: the Total for Galicia and the merged
// concellos (Cesuras, Oza dos Ríos, Oza-Cesuras, Cerdedo, Cotobade, Cerdedo-Cotobade), and
// every teaching type for A Pobra do Caramiñal (15067).
async function run() {
  const c = fixtureContext(
    layer,
    [{ match: 'datos/1653', file: join(dir, 'fixtures', 'ige-1653.csv') }],
    { env: { EXPECT_CONCELLOS: '3' } },
  );
  const { collection } = await adapter.normalize(await adapter.fetch(c), c);
  return new Map(
    collection.features.map((f) => [String(f.id), f.properties as Record<string, unknown>]),
  );
}
const at = (p: Record<string, unknown> | undefined, k: string, y: number) =>
  (p?.[k] as Array<number | null>)[y - 2005];

describe('escolas-concello adapter', () => {
  it('counts the Total of centres on today’s concellos', async () => {
    const m = await run();
    expect([...m.keys()]).toEqual(['15067', '15902', '36902']);
    for (const p of m.values()) expect(validateWithSchema(schema, p)).toEqual([]);
    expect(m.get('15902')?.nome).toBe('Oza-Cesuras');
    expect([2005, 2013, 2015, 2025].map((y) => at(m.get('15902'), 'centros', y))).toEqual([
      2, 2, 2, 2,
    ]);
    expect([2005, 2016, 2025].map((y) => at(m.get('36902'), 'centros', y))).toEqual([4, 4, 4]);
  });

  it('uses only the Total and gives the change since 2005', async () => {
    const pobra = (await run()).get('15067');
    expect(pobra?.nome).toBe('A Pobra do Caramiñal');
    expect([2005, 2012, 2025].map((y) => at(pobra, 'centros', y))).toEqual([10, 9, 9]);
    expect(at(pobra, 'valor', 2025)).toBe(-1);
    expect((pobra?.periodos as string[])[0]).toBe('2005');
  });
});
