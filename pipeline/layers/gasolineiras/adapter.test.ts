import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { decimal, PAD, parseFecha } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [{ match: 'FiltroCCAA/12', file: fx('estaciones-ccaa12.json') }];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('gasolineiras adapter', () => {
  it('makes one request and normalizes the recorded response', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    const fs = out.collection.features;
    expect(fs).toHaveLength(156);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, PAD)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
  });

  it('leaves publishedAt null: Fecha is the request time', async () => {
    const { out } = await run();
    expect(out.publishedAt).toBeNull();
    // 24/10/2026 9:24:37 Madrid (CEST) = 07:24:37Z
    expect(out.collection.features[0]?.properties.prezo_actualizado).toBe(
      '2026-10-24T07:24:37.000Z',
    );
  });

  it('parses decimal commas and maps the fuels', async () => {
    const { out } = await run();
    const byId = new Map(out.collection.features.map((f) => [f.id, f]));
    const gsm = byId.get('13723');
    expect(gsm?.geometry?.coordinates).toEqual([-8.28775, 43.23067]);
    expect(gsm?.properties).toMatchObject({
      nome: 'GSM',
      concello: 'Abegondo',
      horario: 'L-D: 07:00-23:00',
      venda: 'publica',
      gasoleo_a: 1.768,
      gasolina_95: 1.688,
      gasolina_98: 1.798,
      gasoleo_b: null,
      glp: null,
    });
    expect(byId.get('9321')?.properties.glp).toBe(1.098);
    // A station that sells none of the five fuels keeps nulls rather than zeros.
    expect(byId.get('13401')?.properties).toMatchObject({ gasoleo_a: null, gasolina_95: null });
  });

  it('helpers', () => {
    expect(decimal('43,230667')).toBe(43.230667);
    expect(decimal('')).toBeNull();
    expect(parseFecha('18/01/2026 23:05:00')).toBe('2026-01-18T22:05:00.000Z');
    expect(() => parseFecha('2026-10-24T07:24:37Z')).toThrow();
  });

  it('drops stations without coordinates or outside Galicia and fixes swapped ones', async () => {
    const st = (id: string, lat: string, lon: string) => ({
      IDEESS: id,
      IDCCAA: '12',
      Latitud: lat,
      'Longitud (WGS84)': lon,
      Rótulo: 'X',
      'Precio Gasoleo A': '1,5',
    });
    const raw = {
      Fecha: '24/10/2026 9:24:37',
      ResultadoConsulta: 'OK',
      ListaEESSPrecio: [
        st('1', '42,9', '-8,5'),
        st('2', '', ''),
        st('3', '40,4', '-3,7'),
        st('4', '-8,659472', '42,037472'), // swapped in the source (IDEESS 16268, Tui)
      ],
    };
    const out = await adapter.normalize(raw, fixtureContext(layer, []));
    expect(out.collection.features.map((f) => f.id)).toEqual(['1', '4']);
    expect(out.collection.features[1]?.geometry?.coordinates).toEqual([-8.65947, 42.03747]);
    expect(out.collection.features[0]?.properties).toMatchObject({
      gasoleo_a: 1.5,
      enderezo: '',
      gasolina_95: null,
    });
  });

  it('throws on malformed responses and returns 0 features on an empty list', async () => {
    const ctx = fixtureContext(layer, []);
    expect(() => adapter.normalize({}, ctx)).toThrow();
    expect(() => adapter.normalize({ Fecha: 'x', ListaEESSPrecio: [] }, ctx)).toThrow();
    expect(() =>
      adapter.normalize(
        { Fecha: '24/10/2026 9:24:37', ResultadoConsulta: 'ERROR', ListaEESSPrecio: [] },
        ctx,
      ),
    ).toThrow();
    const empty = await adapter.normalize(
      { Fecha: '24/10/2026 9:24:37', ResultadoConsulta: 'OK', ListaEESSPrecio: [] },
      ctx,
    );
    expect(empty.collection.features).toHaveLength(0);
  });
});
