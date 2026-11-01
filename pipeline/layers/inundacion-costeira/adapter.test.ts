import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { epochDate } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [3, 4].map((n) => ({
  match: `MapasInundablesCosteiros/MapServer/${n}/query?resultOffset=0&`,
  file: join(dir, 'fixtures', `layer${n}.json`),
}));

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('inundacion-costeira adapter', () => {
  it('reads T500 then T100 so the more likely areas draw on top', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(2);
    expect(ctx.requested[0]).toContain('MapServer/4/query');
    const fs = out.collection.features;
    expect(fs.map((f) => f.properties.periodo_retorno)).toEqual([500, 500, 100, 100]);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
  });

  it('keeps the ARPSI, the study date and rounded figures', async () => {
    const { out } = await run();
    const f = out.collection.features.find((x) => x.id === 'ES014-LU-19-01-08-C_T500');
    expect(f?.properties).toEqual({
      id: 'ES014-LU-19-01-08-C_T500',
      arpsi: 'ES014-LU-19-01-08-C',
      zona: 'Rinlo (Ribadeo)',
      periodo_retorno: 500,
      superficie_km2: 0.026,
      lonxitude_km: 0.71,
      cota_max_m: 2.79,
      data_estudo: '2014-03-22',
    });
    expect(out.publishedAt).toBeNull();
  });

  it('converts ArcGIS dates', () => {
    expect(epochDate(1395446400000)).toBe('2014-03-22');
    expect(epochDate(null)).toBeNull();
  });
});
