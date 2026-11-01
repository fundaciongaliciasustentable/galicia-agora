import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  {
    match: 'sendas/sendas/MapServer/0/query?resultOffset=0&',
    file: join(dir, 'fixtures', 'itinerarios.json'),
  },
  {
    match: 'Cami%C3%B1o_do_Litoral/MapServer/0/query?resultOffset=0&',
    file: join(dir, 'fixtures', 'litoral.json'),
  },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('sendas-paisaxe adapter', () => {
  it('queries both services once, generalised on the server', async () => {
    const { ctx } = await run();
    expect(ctx.requested).toHaveLength(2);
    for (const u of ctx.requested) expect(u).toContain('maxAllowableOffset=0.0001');
  });

  it('merges routes and coastal stages into valid line features', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs.map((f) => f.id)).toEqual([
      'itinerario-224',
      'itinerario-266',
      'itinerario-84',
      'litoral-39',
      'litoral-20',
    ]);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      expect(['LineString', 'MultiLineString']).toContain(f.geometry?.type);
    }
    expect(fs[1]?.properties.tipo).toBe('Senda Litoral (faros)');
    expect(fs[3]?.properties).toEqual({
      id: 'litoral-39',
      nome: 'Etapa 39. Vilagarcía - Vilanova',
      tipo: 'Camiño do Litoral (etapa)',
      lonxitude_km: 13.8,
      concello_inicio: 'Vilagarcía de Arousa',
      concello_fin: 'Vilanova de Arousa',
    });
    expect(out.publishedAt).toBeNull();
  });

  it('rejects an unknown route kind', () => {
    const ctx = fixtureContext(layer, routes);
    const bad = {
      type: 'FeatureCollection',
      features: [{ geometry: null, properties: { ID: 1, TIPO_ITINERARIO: 'novo' } }],
    };
    expect(() => adapter.normalize({ itinerarios: [bad], litoral: [] }, ctx)).toThrow(/novo/);
  });
});
