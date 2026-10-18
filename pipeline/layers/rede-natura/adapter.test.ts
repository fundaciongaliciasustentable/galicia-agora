import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { geometryOut, includesGalicia, latestTypeName } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

const routes = [
  { match: 'request=GetCapabilities', file: fx('getcapabilities.xml') },
  { match: 'request=GetFeature', file: fx('getfeature-galicia.json') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, raw, out: await adapter.normalize(raw, ctx) };
}

function positions(c: unknown): Array<[number, number]> {
  if (Array.isArray(c) && typeof c[0] === 'number') return [c as [number, number]];
  return Array.isArray(c) ? c.flatMap(positions) : [];
}

const square = (x: number, y: number) => [
  [x, y],
  [x + 0.1, y],
  [x + 0.1, y + 0.1],
  [x, y + 0.1],
  [x, y],
];

describe('rede-natura adapter', () => {
  it('picks the newest dated typename and filters Galicia server-side', async () => {
    const { ctx, raw } = await run();
    expect(raw.typeName).toBe('RN2000:rn2000_2024');
    const url = decodeURIComponent(ctx.requested[1] ?? '').replaceAll('+', ' ');
    expect(url).toContain('typeNames=RN2000:rn2000_2024');
    expect(url).toContain("CQL_FILTER=ids_ccaa_filtro LIKE '%11%'");
    expect(url).toContain('srsName=EPSG:4326');
    // Heavy species/habitat lists are never requested.
    expect(url).not.toContain('lista_');
    expect(
      latestTypeName('<Name>RN2000:rn2000_2023</Name><Name>RN2000:rn2000_2025</Name>'),
    ).toEqual({ typeName: 'RN2000:rn2000_2025', edicion: 2025 });
    expect(() => latestTypeName('<Name>RN2000:rn2000</Name>')).toThrow();
  });

  it('normalizes real fixtures into lean, valid features', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs.length).toBe(4);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      expect(Object.keys(f.properties).sort()).toEqual(
        ['codigo', 'edicion', 'figura', 'nome', 'superficie_ha'].sort(),
      );
      for (const [lon] of positions(f.geometry?.coordinates)) {
        expect(Math.round(lon * 1e5) / 1e5).toBe(lon);
      }
    }
    expect(fs.find((f) => f.id === 'ES0000001')?.properties).toMatchObject({
      nome: 'Illas Cíes',
      figura: 'LIC/ZEC + ZEPA',
      superficie_ha: 996.15,
      edicion: 2024,
    });
    expect(out.publishedAt).toBeNull();
  });

  it('keeps coordinates in lon/lat inside Galicia (offshore sites with a wider pad)', async () => {
    const { out } = await run();
    for (const f of out.collection.features) {
      // Banco de Galicia lies ~250 km offshore (to -12.35° lon).
      const pad = String(f.properties.nome).includes('Banco de Galicia') ? 3.1 : 0.05;
      for (const [lon, lat] of positions(f.geometry?.coordinates)) {
        expect(inGalicia(lon, lat, pad)).toBe(true);
      }
    }
  });

  it('swaps lat/lon if the server ever returns northing first', () => {
    const g = geometryOut({ type: 'Polygon', coordinates: [square(42.1, -8.5)] });
    const [lon, lat] = positions(g?.coordinates)[0] ?? [];
    expect(lon).toBe(-8.5);
    expect(lat).toBe(42.1);
  });

  it('drops sites whose CCAA list does not include Galicia', async () => {
    expect(includesGalicia('11')).toBe(true);
    expect(includesGalicia('11,90')).toBe(true);
    expect(includesGalicia('4,11')).toBe(true);
    expect(includesGalicia('110')).toBe(false);
    expect(includesGalicia('41')).toBe(false);
    const ctx = fixtureContext(layer, routes);
    const body = JSON.stringify({
      type: 'FeatureCollection',
      numberMatched: 1,
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [square(-6.3, 42.2)] },
          properties: {
            id_ref: 'ES4190110',
            nombre: 'Sierra de la Cabrera',
            ids_ccaa_filtro: '41',
          },
        },
      ],
    });
    const out = await adapter.normalize({ typeName: 'x', edicion: 2024, body }, ctx);
    expect(out.collection.features).toHaveLength(0);
  });

  it('throws on an XML exception report or a truncated result', () => {
    const ctx = fixtureContext(layer, routes);
    const xml = '<?xml version="1.0"?><ows:ExceptionReport/>';
    expect(() => adapter.normalize({ typeName: 'x', edicion: 2024, body: xml }, ctx)).toThrow(
      /not JSON/,
    );
    const partial = JSON.stringify({ type: 'FeatureCollection', numberMatched: 76, features: [] });
    expect(() => adapter.normalize({ typeName: 'x', edicion: 2024, body: partial }, ctx)).toThrow(
      /0 of 76/,
    );
  });
});
