import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  ETAPA_BY_TIPO,
  lastStats,
  locate,
  PAD,
  parseCsv,
  toFeatures,
  urlFor,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  { match: '/001/', file: fx('coruna.csv') },
  { match: '/003/', file: fx('lugo.csv') },
  { match: '/005/', file: fx('ourense.csv') },
  { match: '/007/', file: fx('pontevedra.csv') },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, raw, out: await adapter.normalize(raw, ctx) };
}

describe('centros-educativos adapter', () => {
  it('requests the four province CSVs and normalizes them', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toEqual(['001', '003', '005', '007'].map(urlFor));
    const fs = out.collection.features;
    expect(fs).toHaveLength(82 - 11);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, PAD)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(out.publishedAt).toBeNull();
  });

  it('fixes swapped coordinates and drops and counts rows outside Galicia', async () => {
    const { out } = await run();
    expect(lastStats).toMatchObject({ rows: 82, swapped: 16, dropped: 11 });
    // 0/0 (A Coruña, Lugo, Pontevedra) and -13.49/0 (CPR Infórmate branches).
    expect(lastStats?.droppedCodes).toContain('15005397');
    expect(lastStats?.droppedCodes).toContain('15033332');
    const byId = new Map(out.collection.features.map((f) => [f.id, f]));
    expect(byId.has('15005397')).toBe(false);
    // (lat, lon) order
    expect(byId.get('15000016')?.geometry?.coordinates).toEqual([-8.28658, 43.22918]);
    // (lon, lat) order: CEIP de Escarabote, Boiro
    expect(byId.get('15001616')?.geometry?.coordinates).toEqual([-8.90697, 42.63812]);
  });

  it('maps the properties', async () => {
    const { out } = await run();
    const byId = new Map(out.collection.features.map((f) => [f.id, f.properties]));
    expect(byId.get('15000016')).toEqual({
      codigo: '15000016',
      nome: 'CEIP Plurilingüe San Marcos',
      tipo: 'CEIP',
      etapa: 'infantil_primaria',
      titularidade: 'publica',
      concertado: false,
      concello: 'Abegondo',
      enderezo: 'Campo da Feira s/n',
      cp: '15318',
    });
    // Private, publicly funded; a CPR can teach several stages, so no etapa.
    expect(byId.get('15000132')).toMatchObject({
      tipo: 'CPR',
      etapa: null,
      titularidade: 'privada',
      concertado: true,
      enderezo: 'Lugar Biduído de Arriba 36',
    });
    // Quoted address with a comma.
    expect(byId.get('15000107')?.enderezo).toBe('Rúa Peregrina, s/n (Bertamiráns)');
    expect(byId.get('15000545')).toMatchObject({ tipo: 'EMUSPR', etapa: 'outros' });
    // No phone in the output.
    for (const p of byId.values()) expect(Object.keys(p)).not.toContain('telefono');
  });

  it('etapa mapping covers only types that fix the stage', () => {
    expect(ETAPA_BY_TIPO.IES).toBe('secundaria');
    expect(ETAPA_BY_TIPO.EOI).toBe('outros');
    expect(ETAPA_BY_TIPO.CPR).toBeUndefined();
    expect(ETAPA_BY_TIPO.CPREX).toBeUndefined();
  });

  it('helpers', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
    expect(locate(43.2, -8.3)).toEqual({ lon: -8.3, lat: 43.2, swapped: false });
    expect(locate(-8.3, 43.2)).toEqual({ lon: -8.3, lat: 43.2, swapped: true });
    expect(locate(0, 0)).toBeNull();
    expect(locate(Number.NaN, 43)).toBeNull();
  });

  it('rejects unexpected input', async () => {
    const ctx = fixtureContext(layer, []);
    expect(() => adapter.normalize(['a,b\n1,2'], ctx)).toThrow();
    const head =
      'Código,Nome,Enderezo,Concello,Provincia,Cód. postal,Teléfono,Tipo de centro,COORDENADA_X,COORDENADA_Y,TITULARIDADE,ENSINO_CONCERTADO,DEPENDENTE\n';
    const bad = `${head}15000016,X,Y,Z,A Coruña,15318,,CEIP,43.2,-8.2,Concertada,Non,Si\n`;
    expect(() => toFeatures([bad])).toThrow(/TITULARIDADE/);
    expect(() => adapter.normalize([head, head, head, head.replace('Nome', 'Name')], ctx)).toThrow(
      /header/,
    );
    const empty = await adapter.normalize([head, head, head, head], ctx);
    expect(empty.collection.features).toHaveLength(0);
  });
});
