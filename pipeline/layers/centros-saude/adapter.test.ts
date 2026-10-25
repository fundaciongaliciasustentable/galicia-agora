import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter from './adapter.ts';
import INE from './concellos-ine.json' with { type: 'json' };
import schema from './properties.schema.json' with { type: 'json' };
import {
  concelloKey,
  decodeEntities,
  extractZipEntry,
  FOLDERS,
  lookupConcello,
  parseKml,
} from './sergas.ts';

const dir = import.meta.dirname;
const kmz = join(dir, 'fixtures', 'kmlserver-trimmed.kmz');
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [{ match: 'SIXSAN_WEB_KML/MapServer/KmlServer', file: kmz }];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('sergas reader', () => {
  it('reads doc.kml from the KMZ and parses the six folders', async () => {
    const kml = extractZipEntry(await readFile(kmz), 'doc.kml').toString('utf8');
    const folders = parseKml(kml);
    expect([...folders.keys()].sort()).toEqual(Object.values(FOLDERS).sort());
    const pharmacy = folders.get(FOLDERS.farmacias)?.[0];
    // "<Null>" values (double-escaped in the CDATA) are dropped.
    expect(pharmacy?.fields.TITULAR1).toBeUndefined();
    expect(pharmacy?.fields.SIGLAS).toBe('C-224-F');
  });

  it('reads stored ZIP entries too and fails clearly on a missing entry', () => {
    // Hand-built ZIP with one deflated entry.
    const data = Buffer.from('<kml/>');
    const comp = deflateRawSync(data);
    const name = Buffer.from('doc.kml');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const cdOffset = local.length + name.length + comp.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + name.length, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    const zip = Buffer.concat([local, name, comp, central, name, eocd]);
    expect(extractZipEntry(zip, 'doc.kml').toString()).toBe('<kml/>');
    expect(() => extractZipEntry(zip, 'other.kml')).toThrow(/not found/);
    expect(() => extractZipEntry(Buffer.from('<html>error</html>'), 'doc.kml')).toThrow(/ZIP/);
  });

  it('decodes double-escaped entities', () => {
    expect(decodeEntities('&#38;lt;Null&#38;gt;')).toBe('<Null>');
    expect(decodeEntities('A &amp; B &#209;')).toBe('A & B Ñ');
  });

  it('matches SERGAS concello spellings to INE codes', () => {
    expect(Object.keys(INE)).toHaveLength(313);
    expect(concelloKey('CORUÑA (A)')).toBe('coruna');
    expect(lookupConcello('CORUÑA (A)')).toEqual({ ine: '15030', nome: 'A Coruña' });
    expect(lookupConcello('POBRA DO CARAMIÑAL A')?.ine).toBe('15067');
    expect(lookupConcello('CANGAS')?.ine).toBe('36008');
    expect(lookupConcello('CABANA')?.ine).toBe('15014');
    // Ambiguous: Carballeda de Avia or de Valdeorras.
    expect(lookupConcello('CARBALLEDA')).toBeNull();
    expect(lookupConcello('CARBALLEDA DE AVIA')?.ine).toBe('32018');
  });
});

describe('centros-saude adapter', () => {
  it('makes one request and keeps health centres and PACs only', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    expect(out.publishedAt).toBeNull();
    const fs = out.collection.features;
    expect(fs).toHaveLength(6);
    expect(fs.filter((f) => f.properties.tipo === 'pac')).toHaveLength(2);
    expect(new Set(fs.map((f) => f.id)).size).toBe(fs.length);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
  });

  it('builds stable ids from type, name and concello', async () => {
    const { out } = await run();
    const byId = new Map(out.collection.features.map((f) => [f.id, f]));
    expect(byId.get('cs-centro-saude-dumbria-dumbria')?.properties).toEqual({
      id: 'cs-centro-saude-dumbria-dumbria',
      nome: 'CENTRO SAUDE DUMBRIA',
      tipo: 'centro_saude',
      enderezo: 'LUGAR BUXAN S/N',
      cp: '15151',
      concello: 'Dumbría',
      codigo_ine: '15034',
    });
    expect(byId.get('cs-centro-saude-dumbria-dumbria')?.geometry?.coordinates).toEqual([
      -9.11857, 43.01215,
    ]);
    // A PAC in the same centre keeps its own id.
    expect(byId.has('cs-centro-saude-a-pobra-caraminal-pobra-do-caraminal')).toBe(true);
    expect(
      byId.get('pac-centro-saude-a-pobra-caraminal-pobra-do-caraminal')?.properties,
    ).toMatchObject({ tipo: 'pac', concello: 'A Pobra do Caramiñal', codigo_ine: '15067' });
    // Ambiguous concello: source text kept, no code.
    expect(byId.get('cs-centro-saude-carballeda-valdeorras-carballeda')?.properties).toMatchObject({
      concello: 'CARBALLEDA',
      codigo_ine: null,
    });
  });

  it('publishes no phone numbers', async () => {
    const { out } = await run();
    expect(JSON.stringify(out.collection)).not.toMatch(/TELEFONO|9\d{8}/);
  });
});
