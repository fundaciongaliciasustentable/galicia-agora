import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { clase, codigo } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  { match: 'MapServer/2/query?where=1%3D1&returnCountOnly=true', file: fx('count-zonas.json') },
  { match: 'MapServer/1/query?where=1%3D1&returnCountOnly=true', file: fx('count-bateas.json') },
  {
    match: 'find?searchText=ES&contains=true&searchFields=EUZPROTCOD&layers=2&',
    file: fx('find-zonas.json'),
  },
  {
    match: 'find?searchText=ES&contains=true&searchFields=EUZPROTCOD&layers=1&',
    file: fx('find-bateas.json'),
  },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('zonas-producion-moluscos adapter', () => {
  it('reads zones and raft polygons through find with their own tolerance', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(4);
    expect(ctx.requested[1]).toContain('maxAllowableOffset=0.0003');
    expect(ctx.requested[3]).toContain('maxAllowableOffset=0.0001');
    const fs = out.collection.features;
    expect(fs.map((f) => f.id)).toEqual([
      'zona-GAL 04/04',
      'zona-GAL 09/07-2',
      'zona-GAL 01/09-2',
      'bateas-44',
      'bateas-55',
    ]);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry?.type);
    }
    expect(out.publishedAt).toBeNull();
  });

  it('keeps the plan class, the seasonal note and readable names', async () => {
    const { out } = await run();
    const p = (id: string) => out.collection.features.find((f) => f.id === id)?.properties;
    expect(p('zona-GAL 04/04')).toMatchObject({
      nome: 'Enseada dos Moteis',
      clase: 'B',
      estado: 'provisional',
      nota: null,
    });
    expect(p('zona-GAL 09/07-2')).toMatchObject({
      estado: 'estacional',
      nota: 'Clase C de novembro a xuño',
    });
    expect(p('bateas-44')).toMatchObject({
      nome: 'Sada 1',
      ria: 'Ares-Betanzos',
      codigo: 'GAL 12',
    });
    expect(p('bateas-55')).toMatchObject({ codigo: null, clase: null, estado: null });
  });

  it('reads class and code values defensively', () => {
    expect(clase(' ')).toBeNull();
    expect(clase('c')).toBe('C');
    expect(codigo('GAL')).toBeNull();
  });
});
