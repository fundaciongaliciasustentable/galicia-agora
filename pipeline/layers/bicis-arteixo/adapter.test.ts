import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { cleanName, type Raw } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  { match: 'station_information.json', file: fx('station_information.json') },
  { match: 'station_status.json', file: fx('station_status.json') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('bicis-arteixo adapter', () => {
  it('makes exactly two requests and never reads free_bike_status', async () => {
    const { ctx } = await run();
    expect(ctx.requested).toHaveLength(2);
    for (const u of ctx.requested) expect(u).not.toContain('free_bike');
  });

  it('normalizes the recorded feeds', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs).toHaveLength(15);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(out.publishedAt).toBe('2026-10-24T07:20:15.000Z');
  });

  it('joins status to stations and cleans repeated names', async () => {
    const { out } = await run();
    const p = out.collection.features.find((f) => f.id === '193706823')?.properties;
    expect(p).toEqual({
      id: '193706823',
      nome: 'OFICINA DE TURISMO - PL SABON 30',
      capacidade: 16,
      bicis_libres: 15,
      ancoraxes_libres: 1,
      operativa: true,
      actualizado: '2026-10-24T07:20:15.000Z',
    });
    expect(cleanName('PRAIA DE ALBA-SABÓN PRAIA DE ALBA-SABÓN Poligono 3 Parcela 396')).toBe(
      'PRAIA DE ALBA-SABÓN Poligono 3 Parcela 396',
    );
    expect(cleanName('PRAIA DE SABÓN')).toBe('PRAIA DE SABÓN');
  });

  it('publishes no individual bike data', async () => {
    const { out } = await run();
    const text = JSON.stringify(out.collection);
    expect(text).not.toContain('bike_id');
    expect(text).not.toContain('vehicle_type');
  });

  it('marks a station not renting as not operational and skips stations without status', async () => {
    const raw: Raw = {
      info: {
        last_updated: 1,
        data: {
          stations: [
            { station_id: 'a', name: 'A', lat: 43.3, lon: -8.5, capacity: 10 },
            { station_id: 'b', name: 'B', lat: 43.3, lon: -8.5 },
          ],
        },
      },
      status: {
        last_updated: 1792826415,
        data: {
          stations: [
            { station_id: 'a', num_bikes_available: 0, is_installed: true, is_renting: false },
          ],
        },
      },
    };
    const out = await adapter.normalize(raw, fixtureContext(layer, []));
    expect(out.collection.features).toHaveLength(1);
    expect(out.collection.features[0]?.properties).toMatchObject({
      operativa: false,
      ancoraxes_libres: null,
      actualizado: '2026-10-24T07:20:15.000Z',
    });
  });

  it('throws on malformed feeds and yields 0 features on empty ones', async () => {
    const ctx = fixtureContext(layer, []);
    expect(() => adapter.normalize({ info: {}, status: {} }, ctx)).toThrow();
    expect(() =>
      adapter.normalize({ info: { last_updated: 1, data: { stations: [] } }, status: null }, ctx),
    ).toThrow();
    const empty = await adapter.normalize(
      {
        info: { last_updated: 1, data: { stations: [] } },
        status: { last_updated: 1, data: { stations: [] } },
      },
      ctx,
    );
    expect(empty.collection.features).toHaveLength(0);
  });
});
