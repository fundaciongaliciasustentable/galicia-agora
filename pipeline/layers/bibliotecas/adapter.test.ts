import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { lastStats } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  {
    match: 'DirectorioBibliotecasPublicasGalicia.csv',
    file: join(dir, 'fixtures', 'DirectorioBibliotecasPublicasGalicia.csv'),
  },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('bibliotecas adapter', () => {
  it('drops rows without both coordinates and validates the rest', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    expect(lastStats).toEqual({ rows: 6, noCoords: 2 });
    const fs = out.collection.features;
    expect(fs).toHaveLength(4);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
    expect(out.publishedAt).toBeNull();
  });

  it('publishes no phones or e-mails and normalises the categories', async () => {
    const { out } = await run();
    expect(JSON.stringify(out.collection)).not.toMatch(/@|000 000 000/);
    const [first, colexio, alliance] = out.collection.features.map((f) => f.properties);
    expect(first).toMatchObject({
      id: 'biblioteca-publica-municipal-de-abegondo-abegondo',
      concello: 'Abegondo',
      codigo_ine: '15001',
      titularidade: 'publica',
      acceso: 'publico',
      rede_bibliotecas: true,
      web: null,
    });
    expect(colexio).toMatchObject({
      titularidade: 'privada',
      acceso: 'restrinxido',
      concello: 'A Coruña',
    });
    expect(alliance?.acceso).toBeNull();
  });
});
