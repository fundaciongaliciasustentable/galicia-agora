import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { type Raw } from './adapter.ts';

const dir = 'pipeline/layers/calidade-aire';
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));

const routes = [
  { match: 'jsonICAActual', file: fx('jsonICAActual.json') },
  { match: 'jsonEstacionesCaire', file: fx('jsonEstacionesCaire.json') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

const ica = (fecha: string, id = 1) => ({
  idEstacion: id,
  estacion: `E${id}`,
  fecha,
  ica: 0.5,
  icaGl: 'Boa',
  icaEs: 'Buena',
  maximo: 'O3',
  color: '#00FFFF',
});
const station = (id = 1) => ({
  idEstacion: id,
  nombre: `E${id}`,
  latitud: '43.0',
  longitud: '-8.0',
});

describe('calidade-aire adapter', () => {
  it('makes two requests', async () => {
    const { ctx } = await run();
    expect(ctx.requested).toHaveLength(2);
  });

  it('normalizes the recorded response', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs.length).toBe(46);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, 0.1)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    // fecha "2026-10-18 09:00" is local time (CEST, UTC+2).
    expect(out.publishedAt).toBe('2026-10-18T07:00:00.000Z');
    const campus = fs.find((f) => f.id === 2)?.properties;
    expect(campus).toMatchObject({
      nome: 'Campus',
      concello: 'SANTIAGO DE COMPOSTELA',
      ica: 1.4,
      categoria_gl: 'Favorable',
      categoria_es: 'Adecuada',
      contaminante: 'O3',
      cor: '#50C8A3',
      data_medida: '2026-10-18T07:00:00.000Z',
    });
  });

  it('publishes stations without data with a null ICA', async () => {
    const { out } = await run();
    const xove = out.collection.features.find((f) => f.id === 36)?.properties;
    expect(xove).toMatchObject({ ica: null, categoria_gl: 'Sen Datos', cor: '#DDDDDD' });
  });

  it('converts local Europe/Madrid time to UTC in summer and winter', async () => {
    const ctx = fixtureContext(layer, []);
    const summer = await adapter.normalize(
      { ica: { icas: [ica('2026-07-01 14:00')] }, stations: { estaciones: [station()] } },
      ctx,
    );
    expect(summer.collection.features[0]?.properties.data_medida).toBe('2026-07-01T12:00:00.000Z');
    const winter = await adapter.normalize(
      { ica: { icas: [ica('2026-12-01 14:00')] }, stations: { estaciones: [station()] } },
      ctx,
    );
    expect(winter.publishedAt).toBe('2026-12-01T13:00:00.000Z');
    // Either side of the October DST change (2026-10-25): CEST then CET.
    const dst = await adapter.normalize(
      {
        ica: { icas: [ica('2026-10-24 12:00', 1), ica('2026-10-25 12:00', 2)] },
        stations: { estaciones: [station(1), station(2)] },
      },
      ctx,
    );
    expect(dst.collection.features.map((f) => f.properties.data_medida)).toEqual([
      '2026-10-24T10:00:00.000Z',
      '2026-10-25T11:00:00.000Z',
    ]);
    expect(dst.publishedAt).toBe('2026-10-25T11:00:00.000Z');
  });

  it('throws on a malformed response and yields 0 features on an empty one', async () => {
    const ctx = fixtureContext(layer, []);
    expect(() =>
      adapter.normalize({ ica: { foo: 1 }, stations: { estaciones: [] } }, ctx),
    ).toThrow();
    expect(() =>
      adapter.normalize({ ica: { icas: [ica('18/10/2026')] }, stations: { estaciones: [] } }, ctx),
    ).toThrow();
    const empty = await adapter.normalize(
      { ica: { icas: [] }, stations: { estaciones: [] } } as Raw,
      ctx,
    );
    expect(empty.collection.features).toHaveLength(0);
    expect(empty.publishedAt).toBeNull();
  });
});
