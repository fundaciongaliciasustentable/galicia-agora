import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { evolutionUrl } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real answers of 1/11/2026: three stations with an index (Riazor 12, Santiago Campus 2 and
// Laza 6) and the evolution of the first two; Laza answers with an empty evolution.
const ctx = () =>
  fixtureContext(
    layer,
    [
      { match: 'jsonEstacionesCaire', file: fx('jsonEstacionesCaire.json') },
      { match: 'jsonICAActual', file: fx('jsonICAActual.json') },
      { match: 'idEstacion=12', file: fx('evolucion_12.json') },
      { match: 'idEstacion=2', file: fx('evolucion_2.json') },
      { match: 'idEstacion=6', file: fx('evolucion_baleira.json') },
    ],
    { env: { GA_PAUSE_MS: '0' } },
  );

describe('aire-24h adapter', () => {
  it('lays out the last 24 local hours per station, newest last', async () => {
    const c = ctx();
    const raw = await adapter.fetch(c);
    expect(c.requested).toContain(evolutionUrl(12));
    const { collection, publishedAt } = await adapter.normalize(raw, c);
    // 10:00 local on 1/11/2026 (winter time) is 09:00 UTC.
    expect(publishedAt).toBe('2026-11-01T09:00:00.000Z');
    expect(
      collection.features.map((f) => f.properties.id).sort((a, b) => Number(a) - Number(b)),
    ).toEqual([2, 12]);
    const campus = collection.features.find((f) => f.properties.id === 2)?.properties;
    expect(validateWithSchema(schema, campus)).toEqual([]);
    expect((campus?.ica as number[] | undefined)?.[23]).toBe(0.86);
    expect((campus?.dominante as string[] | undefined)?.[23]).toBe('O3');
    expect(campus?.inicio).toBe('2026-10-31T10:00:00.000Z');
  });
});
