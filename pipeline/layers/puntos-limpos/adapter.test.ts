import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { titular } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [{ match: 'Puntos_limpos.csv', file: join(dir, 'fixtures', 'Puntos_limpos.csv') }];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('puntos-limpos adapter', () => {
  it('decodes the Windows-1252 file and validates every point', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    const fs = out.collection.features;
    expect(fs.map((f) => f.id)).toEqual([
      'a-bana',
      'a-caniza',
      'a-coruna-ronda-de-outeiro-concello',
      'cerdedo-cotobade',
      'ferrol-entidade-privada',
    ]);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
  });

  it('keeps opening hours and drops phones, costs and operators', async () => {
    const { out } = await run();
    const text = JSON.stringify(out.collection);
    expect(text).not.toMatch(/000 000 000|€|Urbaser|Recinor|SLU/);
    expect(out.collection.features[0]?.properties).toEqual({
      id: 'a-bana',
      nome: 'A Baña',
      enderezo: 'Parroquia de Lañas',
      concello: 'A Baña',
      codigo_ine: '15007',
      horario: 'De luns a sábado de 10 a 14 horas',
      titular: 'Concello',
      concellos_servidos: 'A Baña',
    });
    expect(out.collection.features[3]?.properties.codigo_ine).toBe('36902');
  });

  it('shortens the owner text', () => {
    expect(titular('DEPUTACIÓN. Instalacións construidas pola CMAOT')).toBe('Deputación');
    expect(titular('')).toBeNull();
  });
});
