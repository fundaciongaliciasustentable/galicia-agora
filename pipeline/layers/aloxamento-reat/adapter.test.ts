import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { TIPOLOXIAS, toFeatures } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };
import { decimal, integer, isVut, normName, parseLine, parseReat, referenceToIso } from './reat.ts';

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [{ match: 'reat_directorio-alojamientos_esp.csv', file: fx('aloxamentos.csv') }];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('aloxamento-reat adapter', () => {
  it('makes one request and keeps only non-VUT rows with coordinates in Galicia', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toEqual([
      'https://descargascdn.xunta.gal/interno/smarxa/reat_directorio-alojamientos_esp.csv',
    ]);
    const fs = out.collection.features;
    // Fixture: 62 rows = 6 VUT (2 of them with coordinates) + 56 others, 8 without coordinates.
    expect(fs).toHaveLength(48);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      expect(String(f.id)).not.toMatch(/^VUT-/);
    }
    expect(new Set(fs.map((f) => f.id)).size).toBe(fs.length);
  });

  it('never publishes tourist-use dwellings, even those with coordinates', async () => {
    const { out } = await run();
    const ids = out.collection.features.map((f) => String(f.id));
    expect(ids).not.toContain('VUT-LU-000320');
    expect(ids).not.toContain('VUT-LU-001598');
    const { stats } = toFeatures(parseReat(await readFile(fx('aloxamentos.csv'), 'utf8')).rows);
    expect(stats).toEqual({ vut: 6, noCoords: 8, outside: 0 });
  });

  it('uses the reference date as published_at', async () => {
    const { out } = await run();
    // 2026-10-01 00:00 Madrid (CEST) = 2026-09-30T22:00Z
    expect(out.publishedAt).toBe('2026-09-30T22:00:00.000Z');
    expect(referenceToIso('2026-01-01')).toBe('2025-12-31T23:00:00.000Z');
  });

  it('maps fields and drops contact data', async () => {
    const { out } = await run();
    const byId = new Map(out.collection.features.map((f) => [f.id, f]));
    const h = byId.get('H-CO-001868');
    expect(h?.geometry?.coordinates).toEqual([-8.07089, 43.45525]);
    expect(h?.properties).toEqual({
      signatura: 'H-CO-001868',
      nome: 'ALBERGUE DO BARREIRO',
      tipoloxia: 'Albergue turístico',
      categoria: 'SEGUNDA CATEGORÍA',
      especialidade: 'ALBERGUE TURÍSTICO',
      prazas: 16,
      habitacions: 6,
      concello: 'A CAPELA',
      parroquia: 'CABALAR (SANTA MARÍA)',
      lugar: 'O BARREIRO',
    });
    expect(byId.get('CA-CO-000170')?.properties).toMatchObject({
      tipoloxia: 'Cámping',
      prazas: null,
      habitacions: null,
      parroquia: null,
    });
  });

  it('gives public pilgrim hostels without signatura a stable id', async () => {
    const { out } = await run();
    const f = out.collection.features.find(
      (x) => x.properties.nome === 'ALBERGUE DE PEREGRINOS DE ARZÚA',
    );
    expect(f?.id).toBe('sen-signatura-arzua-albergue-de-peregrinos-de-arzua');
    expect(f?.properties).toMatchObject({ signatura: null, prazas: 54 });
  });

  it('fails on an unknown accommodation type instead of publishing it', () => {
    const row = { tipo: 'NUEVO TIPO', signatura: 'X-CO-1', denominacion: 'X' };
    expect(() => toFeatures([row])).toThrow(/unknown accommodation type/);
    expect(Object.keys(TIPOLOXIAS)).toHaveLength(7);
  });

  it('parser helpers', () => {
    expect(parseLine('"a;b";"c""d";12;;"x"')).toEqual(['a;b', 'c"d', '12', '', 'x']);
    expect(decimal('-8,07089')).toBe(-8.07089);
    expect(decimal('')).toBeNull();
    expect(integer('16')).toBe(16);
    expect(integer('')).toBeNull();
    expect(isVut({ tipo: 'VIVIENDAS USO TURÍSTICO', signatura: '' })).toBe(true);
    expect(isVut({ tipo: 'OTRO', signatura: 'VUT-PO-1' })).toBe(true);
    expect(isVut({ tipo: 'VIVIENDAS TURÍSTICAS', signatura: 'VT-PO-1' })).toBe(false);
    expect(normName('Coruña, A')).toBe(normName('A CORUÑA'));
    expect(normName('Cerdedo-Cotobade')).toBe('CERDEDO COTOBADE');
    expect(() => parseReat('"signatura";"x"\n')).toThrow(/Fecha de referencia/);
  });
});
