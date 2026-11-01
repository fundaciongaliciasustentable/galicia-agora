import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { isHome, lastStats, looksLikePerson, ubicacion } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  { match: 'equipos-DESA-061.csv', file: join(dir, 'fixtures', 'equipos-DESA-061.csv') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('desfibriladores adapter', () => {
  it('decodes the Latin-1 file and drops homes and bad coordinates', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    const fs = out.collection.features;
    expect(fs.map((f) => f.id)).toEqual(['1002', '1010', '1306', '2686', '4527', '4062', '4739']);
    expect(lastStats).toEqual({ rows: 10, homes: 2, badCoords: 1, textDropped: 1 });
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
  });

  it('never publishes the applicant, names in the text or phone numbers', async () => {
    const { out } = await run();
    const text = JSON.stringify(out.collection);
    expect(text).not.toMatch(/solicitante|Apelido|982000000|Universidade de Santiago/);
    const byId = (id: string) => out.collection.features.find((f) => f.id === id)?.properties;
    expect(byId('4527')?.ubicacion).toBeNull();
    expect(byId('4062')?.ubicacion).toBe('MURO RESTAURANTE');
    expect(byId('4739')?.ubicacion).toBe('NAVANTIA FERROL');
  });

  it('resolves concello names, short 061 forms included', async () => {
    const { out } = await run();
    expect(out.collection.features[0]?.properties).toEqual({
      id: '1002',
      ubicacion: 'Enfermaría Piscina Universitaria',
      tipo: 'Centro docente',
      concello: 'Santiago de Compostela',
      codigo_ine: '15078',
    });
    expect(out.collection.features[1]?.properties.concello).toBe('A Coruña');
    // Fixtures carry no headers; live runs use the Last-Modified header.
    expect(out.publishedAt).toBeNull();
  });

  it('tells persons and homes apart from organisations', () => {
    expect(looksLikePerson('María do Carmo Apelido')).toBe(true);
    expect(looksLikePerson('Concello de Lugo')).toBe(false);
    expect(isHome('Otros', 'Piso 2ºA')).toBe(true);
    expect(isHome('Otros', 'Vivienda Comunitaria Villaoudrid')).toBe(false);
    expect(ubicacion('Clínica Dental Apelido', 'Ana Apelido Outro')).toBeNull();
    expect(ubicacion('Bar (981 000 000)', 'Concello')).toBe('Bar');
  });
});
