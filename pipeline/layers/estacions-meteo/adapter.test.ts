import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { type Raw, utcToIso } from './adapter.ts';

const dir = 'pipeline/layers/estacions-meteo';
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));

const routes = [
  { match: 'ultimos10minEstacionsMeteo', file: fx('ultimos10min.json') },
  { match: 'listaEstacionsMeteo', file: fx('listaEstacionsMeteo.json') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, raw, out: await adapter.normalize(raw, ctx) };
}

describe('estacions-meteo adapter', () => {
  it('makes exactly two requests, without parameters', async () => {
    const { ctx } = await run();
    expect(ctx.requested).toHaveLength(2);
    for (const u of ctx.requested) expect(u).not.toContain('?');
  });

  it('normalizes the recorded response', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs.length).toBeGreaterThan(20);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, 0.1)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(out.publishedAt).toBe('2026-10-18T07:30:00.000Z');
  });

  it('reads instanteLecturaUTC as UTC', () => {
    expect(utcToIso('2026-10-18T07:30:00')).toBe('2026-10-18T07:30:00.000Z');
    expect(() => utcToIso('18/10/2026 07:30')).toThrow();
  });

  it('maps parameters and keeps only valid values', async () => {
    const { out } = await run();
    const byId = new Map(out.collection.features.map((f) => [f.id, f.properties]));
    const mabegondo = byId.get(10045);
    expect(mabegondo).toMatchObject({
      nome: 'Mabegondo',
      concello: 'ABEGONDO',
      altitude: 94,
      temperatura: 14.18,
      humidade: 59,
      vento_velocidade: 2.38,
      vento_direccion: 34,
      vento_altura_m: 10,
      refacho: 3.98,
      chuvia_10min: 0,
      presion: 1024.12,
    });
    // Code 3 (undocumented): value kept and flagged.
    expect(byId.get(19071)).toMatchObject({ temperatura: 11.97, temperatura_cod: 3 });
  });

  it('drops stations whose reading is more than 60 min older than the newest', async () => {
    const { out } = await run();
    const ids = out.collection.features.map((f) => f.id);
    expect(ids).not.toContain(10122); // 2026-09-23
    expect(ids).not.toContain(19050); // 06:20, 70 min behind 07:30
    expect(ids).not.toContain(10501); // not in the station list (no coordinates)
  });

  it('keeps a reading exactly 60 min old and drops one at 61 min', async () => {
    const m = (t: string, id: number) => ({
      estacion: `E${id}`,
      idEstacion: id,
      instanteLecturaUTC: t,
      listaMedidas: [{ codigoParametro: 'TA_AVG_1.5m', lnCodigoValidacion: 1, valor: 10 }],
    });
    const st = (id: number) => ({
      idEstacion: id,
      estacion: `E${id}`,
      concello: 'LUGO',
      altitude: 400,
      lat: 43,
      lon: -7.5,
    });
    const raw: Raw = {
      obs: {
        listUltimos10min: [
          m('2026-10-18T08:00:00', 1),
          m('2026-10-18T07:00:00', 2),
          m('2026-10-18T06:59:00', 3),
        ],
      },
      stations: { listaEstacionsMeteo: [st(1), st(2), st(3)] },
    };
    const out = await adapter.normalize(raw, fixtureContext(layer, []));
    expect(out.collection.features.map((f) => f.id)).toEqual([1, 2]);
  });

  it('drops the -9999 no-data sentinel', async () => {
    const raw: Raw = {
      obs: {
        listUltimos10min: [
          {
            estacion: 'X',
            idEstacion: 1,
            instanteLecturaUTC: '2026-10-18T08:00:00',
            listaMedidas: [{ codigoParametro: 'TA_AVG_1.5m', lnCodigoValidacion: 9, valor: -9999 }],
          },
        ],
      },
      stations: {
        listaEstacionsMeteo: [
          { idEstacion: 1, estacion: 'X', concello: 'LUGO', altitude: 1, lat: 43, lon: -7.5 },
        ],
      },
    };
    const out = await adapter.normalize(raw, fixtureContext(layer, []));
    expect(out.collection.features[0]?.properties).not.toHaveProperty('temperatura');
  });

  it('throws on a structurally unexpected response and yields 0 features on an empty one', async () => {
    const ctx = fixtureContext(layer, []);
    expect(() =>
      adapter.normalize({ obs: {}, stations: { listaEstacionsMeteo: [] } }, ctx),
    ).toThrow();
    expect(() =>
      adapter.normalize({ obs: { listUltimos10min: [] }, stations: null }, ctx),
    ).toThrow();
    const empty = await adapter.normalize(
      { obs: { listUltimos10min: [] }, stations: { listaEstacionsMeteo: [] } },
      ctx,
    );
    expect(empty.collection.features).toHaveLength(0);
    expect(empty.publishedAt).toBeNull();
  });
});
