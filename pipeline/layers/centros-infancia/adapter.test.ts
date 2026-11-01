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
  { match: 'centros_infancia.kml', file: join(dir, 'fixtures', 'centros_infancia.kml') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('centros-infancia adapter', () => {
  it('parses every placemark into a valid centre', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    const fs = out.collection.features;
    expect(fs).toHaveLength(5);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
    expect(new Set(fs.map((f) => f.properties.tipo))).toEqual(
      new Set(['Escola infantil', 'Punto de atención á infancia (PAI)', 'Ludoteca']),
    );
  });

  it('publishes no e-mails, phones, timetables or person owners', async () => {
    const { out } = await run();
    const text = JSON.stringify(out.collection);
    expect(text).not.toMatch(/@|000000000|APELIDO|LUNS A VENRES/i);
    // The person owner and "PATRONATO CASA DEL NIÑO" (not a recognised legal form) are hidden.
    expect(lastStats?.ownerHidden).toBe(2);
    const first = out.collection.features[0]?.properties;
    expect(first).toMatchObject({
      nome: 'XARDIN DE INFANCIA RAIOLA',
      iniciativa: 'social',
      entidade: 'ASOCIACION PAIS DO XARDIN DE INFANCIA RAIOLA',
      concello: 'Santiago de Compostela',
      codigo_ine: '15078',
    });
    expect(first?.ligazon_ruepss).toContain('%7BactionForm.id_cent%7D=217413');
  });
});
