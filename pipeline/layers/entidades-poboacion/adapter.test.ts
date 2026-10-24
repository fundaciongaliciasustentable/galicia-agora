import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Feature, inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  cleanCodigo,
  codigoParroquia,
  editionFromText,
  publishedFromService,
  timing,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
// No pauses between fixture requests.
timing.pauseMs = 0;

const routes = [
  { match: 'returnCountOnly=true', file: fx('count.json') },
  { match: '0/query?resultOffset=0&', file: fx('query-offset0.geojson') },
  // The next offset is the number of features already returned (10 in the trimmed fixture).
  { match: '0/query?resultOffset=10&', file: fx('query-page2.geojson') },
  { match: 'MapServer?f=json', file: fx('mapserver.json') },
];

async function run(r = routes) {
  const ctx = fixtureContext(layer, r);
  const raw = await adapter.fetch(ctx);
  return { ctx, raw, out: await adapter.normalize(raw, ctx) };
}

const byId = (fs: Feature[], id: string) => fs.find((f) => f.id === id);

describe('entidades-poboacion adapter', () => {
  it('normalizes real fixtures into valid points inside Galicia', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs).toHaveLength(12);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      expect(f.geometry?.type).toBe('Point');
      const [lon, lat] = (f.geometry?.coordinates ?? []) as [number, number];
      expect(inGalicia(lon, lat)).toBe(true);
    }
  });

  it('pages with resultOffset and checks the count', async () => {
    const { ctx } = await run();
    const q = ctx.requested.filter((u) => u.includes('resultOffset='));
    expect(q).toHaveLength(2);
    expect(q[1]).toContain('resultOffset=10&');
    for (const u of q) {
      expect(u).toContain('resultRecordCount=1000');
      expect(u).toContain('orderByFields=OBJECTID');
      expect(u).toContain('outSR=4326');
      expect(u).toContain('f=geojson');
    }
  });

  it('reads the edition month as publishedAt', async () => {
    const { out } = await run();
    // "Decembro 2025" (description) wins over the older "Xuño 2025" (serviceDescription).
    expect(out.publishedAt).toBe('2025-11-30T23:00:00.000Z');
    expect(editionFromText('Entidades Poboacion PBA. Xuño 2025')).toBe('2025-05-31T22:00:00.000Z');
    expect(editionFromText('sen data')).toBeNull();
    expect(publishedFromService({})).toBeNull();
  });

  it('keeps codes as clean strings and derives the INE code from the parroquia', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(byId(fs, '15041032700')?.properties).toEqual({
      codigo: '15041032700',
      nome: 'A Matosa',
      tipo: 'ED',
      tipo_nome: 'Entidade en diseminado',
      codigo_parroquia: '1504103',
      codigo_ine: '15041',
      poboacion: 14,
      nomenclator_xunta: true,
    });
    for (const f of fs) {
      const p = f.properties;
      expect(p.codigo_ine).toBe((p.codigo_parroquia as string).slice(0, 5));
      if (p.codigo) expect((p.codigo as string).slice(0, 7)).toBe(p.codigo_parroquia);
    }
  });

  it('gives unique ids when COD_IGRP repeats and nulls malformed codes', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(new Set(fs.map((f) => f.id)).size).toBe(fs.length);
    // Two "A Manguela" with the same parroquia placeholder code.
    const manguela = fs.filter((f) => f.properties.codigo === '15022050099');
    expect(manguela.map((f) => f.id).sort()).toEqual(['15022050099-1', '15022050099-2']);
    // "150780099" has 9 digits: no code, but the parroquia (COD_ENT_CO) is kept.
    const mallou = fs.find((f) => f.properties.nome === 'Mallou de Arriba');
    expect(mallou?.properties).toMatchObject({ codigo: null, codigo_parroquia: '1507821' });
    expect(mallou?.id).toBe('1507821-sen-codigo');
  });

  it('publishes no population for non-INE places (LU, PU)', async () => {
    const { out } = await run();
    for (const f of out.collection.features) {
      if (['LU', 'PU'].includes(f.properties.tipo as string)) {
        expect(f.properties.poboacion).toBeNull();
      } else {
        expect(typeof f.properties.poboacion).toBe('number');
      }
    }
    const nu = out.collection.features.find((f) => f.properties.tipo === 'NU');
    expect(nu?.properties.poboacion).toBe(961);
  });

  it('throws when the final count differs from the service count by more than 1%', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'entidades-'));
    await writeFile(join(tmp, 'count.json'), '{"count":36190}');
    const r = [{ match: 'returnCountOnly=true', file: join(tmp, 'count.json') }, ...routes];
    await expect(run(r)).rejects.toThrow(/got 12 features, service counts 36190/);
  });

  it('throws on empty or malformed responses', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'entidades-'));
    await writeFile(join(tmp, 'err.json'), '{"error":{"code":400,"message":"Invalid query"}}');
    await writeFile(join(tmp, 'html.json'), '<html>maintenance</html>');
    await writeFile(join(tmp, 'zero.json'), '{"count":0}');
    const swap = (match: string, file: string) => [{ match, file: join(tmp, file) }, ...routes];
    await expect(run(swap('0/query?resultOffset=0&', 'err.json'))).rejects.toThrow(/Invalid query/);
    await expect(run(swap('0/query?resultOffset=0&', 'html.json'))).rejects.toThrow(/not JSON/);
    await expect(run(swap('returnCountOnly=true', 'zero.json'))).rejects.toThrow(/count/);
    expect(cleanCodigo('150780099')).toBeNull();
    expect(() => codigoParroquia(null)).toThrow();
    expect(() => codigoParroquia(4800101)).toThrow(/outside Galicia/);
  });
});
