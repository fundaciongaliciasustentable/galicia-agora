import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import { readTrips, tripFeatures } from '../pulso-tren/gtfs-trips.ts';
import adapter from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
// Reduced real GTFS of buses-xunta (see its fixtures/README.md): times are made up there.
const zip = join(dir, '..', 'buses-xunta', 'fixtures', 'gtfs.zip');
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const FAKE_KEY = 'test-key-not-real-0123';

describe('pulso-bus adapter', () => {
  it('reads the trips of the given days from the bus GTFS', async () => {
    // The fixture only has services on single dates: Thursday 29 and Saturday 31 October.
    const days = { laborable: '20261029', domingo: '20261031' };
    const trips = await readTrips(zip, {
      days,
      pad: 0.1,
      label: 'test',
      lineName: (short, long, id) => long || short || id,
    });
    expect(trips.filter((t) => t.day === 'laborable').length).toBeGreaterThan(0);
    expect(trips.filter((t) => t.day === 'domingo').length).toBeGreaterThan(0);
    for (const f of tripFeatures(trips, 'bus', days)) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
  });

  it('fails without buses on the reference Wednesday, never leaking the key', async () => {
    const ctx = fixtureContext(layer, [{ match: 'api/Fichero/download/1584', file: zip }], {
      env: { NAP_API_KEY: FAKE_KEY },
      // Reference days: Wednesday 28 October and Sunday 1 November (none in the fixture).
      now: new Date('2026-10-24T08:00:00Z'),
    });
    const raw = await adapter.fetch(ctx);
    const err = await Promise.resolve()
      .then(() => adapter.normalize(raw, ctx))
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/no buses on the working reference day/);
    expect((err as Error).message).not.toContain(FAKE_KEY);
  });

  it('refuses to run without the NAP key', async () => {
    const ctx = fixtureContext(layer, [], { env: {} });
    await expect(adapter.fetch(ctx)).rejects.toThrow(/NAP_API_KEY is not set/);
  });
});
