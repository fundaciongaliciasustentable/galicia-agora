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
  { match: 'MapServer/0/query?resultOffset=0&', file: join(dir, 'fixtures', 'page0.json') },
  { match: 'MapServer/0/query?resultOffset=2&', file: join(dir, 'fixtures', 'page1.json') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('humidais adapter', () => {
  it('follows the second page and validates every element', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(2);
    const fs = out.collection.features;
    expect(fs.map((f) => f.id)).toEqual(['111159.02', '113033.01', '114085.02']);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
  });

  it('keeps element names, the raw typology code and the DOG date', async () => {
    const { out } = await run();
    expect(out.collection.features[0]?.properties).toEqual({
      id: '111159.02',
      codigo_humidal: '111159',
      nome: 'As Medoñas',
      elemento: 'As Medoñas L2',
      tipoloxia: '4.71',
      superficie_ha: 0.04,
      data_dog: '2024-02-20',
    });
    expect(out.collection.features[1]?.properties.elemento).toBeNull();
    expect(out.publishedAt).toBe('2024-02-20T00:00:00.000Z');
  });
});
