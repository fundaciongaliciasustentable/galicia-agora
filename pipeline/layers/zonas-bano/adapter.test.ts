import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { titleCase } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  {
    match: 'MapServer/4/query?where=1%3D1&returnCountOnly=true',
    file: join(dir, 'fixtures', 'count.json'),
  },
  { match: 'MapServer/find?searchText=ES&', file: join(dir, 'fixtures', 'find.json') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('zonas-bano adapter', () => {
  it('counts with query, reads shapes with find and drops deregistered zones', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(2);
    expect(ctx.requested[1]).toContain('maxAllowableOffset=0.0002');
    const fs = out.collection.features;
    expect(fs.map((f) => f.id)).toEqual([
      'ES11100030M15030E',
      'ES11400012C36012E',
      'ES11100069M15069E',
    ]);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry?.type);
    }
    expect(fs[1]?.properties).toMatchObject({
      nome: 'Rio de Calvelo Cotobade',
      tipo: 'continental',
    });
    expect(out.publishedAt).toBeNull();
  });

  it('fails when find returns fewer features than the count', async () => {
    const ctx = fixtureContext(layer, [
      { match: 'returnCountOnly', file: join(dir, 'fixtures', 'count-real.json') },
      routes[1] as { match: string; file: string },
    ]);
    await expect(adapter.fetch(ctx)).rejects.toThrow(/find gave 5 features, query counts 458/);
  });

  it('writes census names in readable case', () => {
    expect(titleCase('PLAYA AREA DA BARCA-COVELO')).toBe('Playa Area da Barca-Covelo');
    expect(titleCase('EMBALSE RIO EUME PONTES DE GARCIA RODRIGUEZ (AS)')).toBe(
      'Embalse Rio Eume Pontes de Garcia Rodriguez (As)',
    );
  });
});
