import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real rows of IGE tables 57 and 30 (1975–2025, both sexes), recorded on 1/11/2026, for
// A Coruña, Cesuras, Oza dos Ríos, Oza-Cesuras, Cariño and Burela.
async function run() {
  const c = fixtureContext(
    layer,
    [
      { match: 'datos/57/', file: join(dir, 'fixtures', 'ige-57.csv') },
      { match: 'datos/30/', file: join(dir, 'fixtures', 'ige-30.csv') },
    ],
    { now: new Date('2026-11-01T10:00:00Z'), env: { IGE_PAUSE_MS: '0', EXPECT_CONCELLOS: '4' } },
  );
  const { collection } = await adapter.normalize(await adapter.fetch(c), c);
  return new Map(
    collection.features.map((f) => [String(f.id), f.properties as Record<string, unknown>]),
  );
}
const at = (p: Record<string, unknown> | undefined, k: string, y: number) =>
  (p?.[k] as Array<number | null> | undefined)?.[y - 1975];

describe('nacementos-mortes adapter', () => {
  it('brings merged concellos into today’s code, exactly', async () => {
    const m = await run();
    expect([...m.keys()]).toEqual(['15030', '15901', '15902', '27902']);
    for (const p of m.values()) expect(validateWithSchema(schema, p)).toEqual([]);
    const oza = m.get('15902');
    expect(oza?.nome).toBe('Oza-Cesuras');
    expect([at(oza, 'nacementos', 1975), at(oza, 'defuncions', 1975)]).toEqual([85, 86]);
    expect([at(oza, 'nacementos', 2012), at(oza, 'defuncions', 2012)]).toEqual([21, 83]);
    expect([at(oza, 'nacementos', 2013), at(oza, 'defuncions', 2013)]).toEqual([30, 98]);
    expect(at(oza, 'valor', 1975)).toBe(98.8);
  });

  it('leaves split-off concellos empty before they existed', async () => {
    const m = await run();
    expect(at(m.get('15901'), 'nacementos', 1975)).toBeNull();
    expect(at(m.get('15901'), 'nacementos', 2012)).toBe(17);
  });

  it('gives births per 100 deaths and marks the last year provisional', async () => {
    const coruna = (await run()).get('15030');
    expect(coruna?.nome).toBe('A Coruña');
    expect(at(coruna, 'valor', 2024)).toBe(52.4);
    expect((coruna?.periodos as string[] | undefined)?.at(-1)).toBe('2025');
    expect(coruna?.provisional).toBe('2025');
  });
});
