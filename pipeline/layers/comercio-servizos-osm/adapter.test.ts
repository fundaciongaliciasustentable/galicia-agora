import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Feature, LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  categorize,
  concelloPolygons,
  findConcello,
  httpDateToIso,
  osmId,
  osmiumAvailable,
  type Raw,
  representativePoint,
  URL,
  website,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const hasOsmium = await osmiumAvailable();
const REPLICATION = '2026-10-24T20:20:51Z';

describe('comercio-servizos-osm helpers', () => {
  it('categorizes amenity and shop tags, amenity first', () => {
    expect(categorize({ amenity: 'cafe' })).toEqual({
      categoria: 'hostalaría',
      tag: 'amenity=cafe',
    });
    expect(categorize({ amenity: 'fuel', shop: 'convenience' })).toEqual({
      categoria: 'servizos',
      tag: 'amenity=fuel',
    });
    expect(categorize({ shop: 'Supermarket;convenience' })).toEqual({
      categoria: 'alimentación',
      tag: 'shop=supermarket',
    });
    expect(categorize({ shop: 'hairdresser' })?.categoria).toBe('servizos');
    expect(categorize({ shop: 'shoes' })).toEqual({
      categoria: 'outros comercios',
      tag: 'shop=shoes',
    });
    expect(categorize({ shop: 'vacant', name: 'O Forno' })).toBeNull();
    expect(categorize({ amenity: 'parking' })).toBeNull();
    expect(categorize({ building: 'yes' })).toBeNull();
  });

  it('maps osmium unique ids to OSM ids', () => {
    expect(osmId('n123')).toBe('n123');
    expect(osmId('w456')).toBe('w456');
    expect(osmId('a52200108')).toBe('w26100054');
    expect(osmId('a23013683')).toBe('r11506841');
    expect(osmId('x1')).toBeNull();
  });

  it('keeps only http(s) websites', () => {
    expect(website({ website: 'https://galipizza.com/ribadeo/' })).toBe(
      'https://galipizza.com/ribadeo/',
    );
    expect(website({ 'contact:website': 'www.example.gal' })).toBe('https://www.example.gal');
    expect(website({ website: 'javascript:alert(1)' })).toBeNull();
    expect(website({ website: 'chámanos ao 982' })).toBeNull();
    expect(website({})).toBeNull();
  });

  it('computes representative points', () => {
    expect(representativePoint({ type: 'Point', coordinates: [-8, 42] })).toEqual([-8, 42]);
    expect(
      representativePoint({
        type: 'LineString',
        coordinates: [
          [0, 0],
          [2, 2],
        ],
      }),
    ).toEqual([1, 1]);
    // Square 0..2 with a hole 0..1 in the corner: centroid moves away from the hole.
    const [x, y] = representativePoint({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      ],
    }) as [number, number];
    expect(x).toBeCloseTo(7 / 6);
    expect(y).toBeCloseTo(7 / 6);
  });

  it('finds the concello, with a tolerance for piers and lonxas', async () => {
    const { readFile } = await import('node:fs/promises');
    const cs = concelloPolygons(JSON.parse(await readFile(fx('concellos-sample.geojson'), 'utf8')));
    expect(cs.map((c) => c.nome).sort()).toEqual(['Ribadeo', 'Sanxenxo', 'Tui']);
    expect(findConcello(-7.0422249, 43.5349515, cs)?.nome).toBe('Ribadeo');
    // Lonxa de Portonovo, ~16 m off the Sanxenxo polygon.
    expect(findConcello(-8.82266, 42.39442, cs)?.nome).toBe('Sanxenxo');
    // Valença (Portugal), ~230 m across the Miño from Tui.
    expect(findConcello(-8.65581, 42.02484, cs)).toBeNull();
  });

  it('converts HTTP dates', () => {
    expect(httpDateToIso('Fri, 23 Oct 2026 05:32:26 GMT')).toBe('2026-10-23T05:32:26.000Z');
    expect(httpDateToIso(null)).toBeNull();
  });
});

describe.skipIf(!hasOsmium)('comercio-servizos-osm adapter (osmium)', () => {
  let work: string;
  let pbf: string;
  let outDir: string;

  beforeAll(async () => {
    work = await mkdtemp(join(tmpdir(), 'comercio-osm-test-'));
    pbf = join(work, 'sample.osm.pbf');
    // Real objects trimmed from the Geofabrik extract (XML), converted to PBF with the
    // replication timestamp header that Geofabrik writes.
    execFileSync('osmium', [
      'cat',
      fx('galicia-sample.osm'),
      '-o',
      pbf,
      `--output-header=osmosis_replication_timestamp=${REPLICATION}`,
    ]);
    outDir = join(work, 'data-out');
    await mkdir(join(outDir, 'concellos-parroquias'), { recursive: true });
    await copyFile(
      fx('concellos-sample.geojson'),
      join(outDir, 'concellos-parroquias', 'data.geojson'),
    );
  });

  afterAll(async () => {
    await rm(work, { recursive: true, force: true });
  });

  async function run(env: Record<string, string>) {
    const ctx = fixtureContext(layer, [{ match: 'galicia-latest.osm.pbf', file: pbf }], { env });
    const raw = (await adapter.fetch(ctx)) as Raw;
    return { ctx, raw, out: await adapter.normalize(raw, ctx) };
  }

  it('extracts, categorizes and filters real OSM objects', async () => {
    const { ctx, raw, out } = await run({ DATA_OUT_DIR: outDir });
    expect(ctx.requested).toEqual([URL]);
    expect(raw.concellos?.length).toBe(3);
    expect(out.publishedAt).toBe(REPLICATION);

    const fs = out.collection.features;
    const byId = (id: string) => fs.find((f: Feature) => f.id === id)?.properties;
    expect(fs.map((f) => f.id)).toEqual([
      'n1428601768',
      'n1838992725',
      'n1838992766',
      'n2405451918',
      'n2405451923',
      'n4944409973',
      'n5469472519',
      'r11506841',
      'w26100054',
    ]);
    // Vacant shop (n1999312165) and Valença restaurant (w827065030) are gone.
    expect(byId('n1838992725')).toEqual({
      osm_id: 'n1838992725',
      nome: 'Eroski',
      categoria: 'alimentación',
      tag: 'shop=supermarket',
      marca: 'Eroski',
      horario: 'Mo-Sa 09:00-21:30; Su off',
      web: null,
    });
    expect(byId('r11506841')).toMatchObject({ nome: 'Mercadona', tag: 'shop=supermarket' });
    expect(byId('w26100054')).toMatchObject({ categoria: 'alimentación', tag: 'shop=seafood' });
    expect(byId('n5469472519')).toMatchObject({ categoria: 'servizos', tag: 'amenity=atm' });
    expect(byId('n1838992766')).toMatchObject({ nome: null, tag: 'amenity=pharmacy' });
    expect(byId('n2405451918')).toMatchObject({
      categoria: 'outros comercios',
      tag: 'shop=furniture',
    });

    for (const f of fs) {
      expect(f.geometry?.type).toBe('Point');
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    // No phones, emails or addresses, even where OSM has them (La Solana has all three).
    const json = JSON.stringify(out.collection);
    expect(json).not.toMatch(/HOTMAIL|\+34|addr:|Antonio Otero/i);
  });

  it('falls back to the Galicia bbox without concello polygons', async () => {
    const { raw, out } = await run({ DATA_OUT_DIR: join(work, 'missing') });
    expect(raw.concellos).toBeNull();
    // The Valença restaurant is inside the bbox: the fallback lets it through.
    expect(out.collection.features.map((f) => f.id)).toContain('w827065030');
  });
});

if (!hasOsmium) {
  console.warn(
    'comercio-servizos-osm: osmium CLI not found, skipping the extraction tests (install osmium-tool)',
  );
}
