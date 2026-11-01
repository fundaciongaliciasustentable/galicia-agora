import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { anoAforo } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  {
    match: 'MapaTrafico/MapServer/7/query?resultOffset=0&',
    file: join(dir, 'fixtures', 'layer7.json'),
  },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('imd-estradas adapter', () => {
  it('reads the 2025 sections in one generalised page', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    expect(ctx.requested[0]).toContain('resultRecordCount=2000');
    expect(ctx.requested[0]).toContain('maxAllowableOffset=0.0002');
    expect(out.collection.features).toHaveLength(4);
    for (const f of out.collection.features) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(out.publishedAt).toBeNull();
  });

  it('keeps the year and kind of the last count next to the IMD', async () => {
    const { out } = await run();
    const byId = (id: string) => out.collection.features.find((f) => f.id === id)?.properties;
    expect(byId('342')).toMatchObject({
      estrada: 'AG-11',
      imd: 12730,
      pesados_pct: 6.1,
      ano: 2025,
      ano_aforo: 2025,
      tipo_aforo: 'PER',
      rede: 'estruturante',
      clase: 'Autovía',
    });
    expect(byId('393')).toMatchObject({ ano_aforo: null, tipo_aforo: null, clase: 'Autoestrada' });
    expect(byId('481')).toMatchObject({ imd: 107, ano_aforo: 2009, rede: 'local' });
  });

  it('reads count years defensively', () => {
    expect(anoAforo(0)).toBeNull();
    expect(anoAforo(2019)).toBe(2019);
    expect(anoAforo('x')).toBeNull();
  });
});
