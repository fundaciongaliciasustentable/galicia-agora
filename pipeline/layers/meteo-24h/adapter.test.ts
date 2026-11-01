import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { LATEST_URL } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real responses of 1/11/2026: three stations in the list and the last 24 hours of two of them
// (Santiago-EOAS 10124 and Coruña-Torre de Hércules 10157), 31/10 10:00 to 1/11 09:00 UTC.
const ctx = () =>
  fixtureContext(layer, [
    { match: 'listaEstacionsMeteo', file: fx('listaEstacionsMeteo.json') },
    { match: 'ultimosHorariosEstacions', file: fx('ultimosHorariosEstacions_24.json') },
  ]);

describe('meteo-24h adapter', () => {
  it('lays the last 24 hours out in time order from one request', async () => {
    const c = ctx();
    const raw = await adapter.fetch(c);
    expect(c.requested).toEqual([expect.stringContaining('listaEstacionsMeteo'), LATEST_URL]);
    const { collection, publishedAt } = await adapter.normalize(raw, c);
    expect(publishedAt).toBe('2026-11-01T09:00:00.000Z');
    // The third station of the list has no readings in the response: left out.
    expect(collection.features.map((f) => f.properties.id).sort()).toEqual([10124, 10157]);
    const santiago = collection.features.find((f) => f.properties.id === 10124)?.properties;
    expect(validateWithSchema(schema, santiago)).toEqual([]);
    expect(santiago?.inicio).toBe('2026-10-31T10:00:00.000Z');
    const ta = santiago?.ta as number[];
    // Oldest first (31/10 10:00 UTC, 13.65 °C), newest last (1/11 09:00 UTC, 10.54 °C).
    expect(ta[0]).toBe(13.7);
    expect(ta[23]).toBe(10.5);
  });
});
