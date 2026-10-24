import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  ATOM_URL,
  capFeatures,
  capLinks,
  capPolygon,
  MAX_CAPS,
  parseAtom,
} from './adapter.ts';

const dir = 'pipeline/layers/avisos-aemet';
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));
const now = new Date('2026-10-24T07:16:18Z');
const CAP_URL =
  'https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/Z_CAP_C_LEMM_20261024063710_AFAZ711501COCO2422.xml';

const routes = [
  { match: 'CAP_AFAC71_ATOM.xml', file: fx('CAP_AFAC71_ATOM.xml') },
  { match: 'AFAZ711501COCO2422.xml', file: fx('cap-AFAZ711501COCO2422.xml') },
];

async function run(at = now) {
  const ctx = fixtureContext(layer, routes, { now: at });
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('avisos-aemet adapter', () => {
  it('fetches the Atom feed and each CAP XML, never the tar.gz', async () => {
    const { ctx } = await run();
    expect(ctx.requested).toEqual([ATOM_URL, CAP_URL]);
  });

  it('normalizes the recorded warning', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs).toHaveLength(1);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      // Coastal zones reach ~40 km offshore.
      for (const [lon, lat] of (f.geometry as { coordinates: number[][][] }).coordinates[0] ?? []) {
        expect(inGalicia(lon as number, lat as number, 0.5)).toBe(true);
      }
    }
    expect(out.publishedAt).toBe('2026-10-24T06:37:10.000Z');
    expect(fs[0]?.properties).toEqual({
      id: '2.49.0.0.724.0.ES.20261024063710.711501COCO24221792823830_711501C',
      nivel: 'amarelo',
      fenomeno: 'Costeros',
      codigo_fenomeno: 'CO',
      zona: 'Costa - Noroeste de A Coruña',
      codigo_zona: '711501C',
      inicio: '2026-10-24T18:00:00.000Z',
      fin: '2026-10-24T21:59:59.000Z',
      titular: 'Aviso de costeros de nivel amarillo. Costa - Noroeste de A Coruña',
      descricion:
        'Viento del suroeste de 51 a 60 km/h (fuerza 7). Mar combinada del noroeste en torno a 4 metros.',
      probabilidade: '40%-70%',
      fonte_url: CAP_URL,
    });
  });

  it('converts the CAP polygon to a closed [lon, lat] ring', async () => {
    const { out } = await run();
    const geom = out.collection.features[0]?.geometry as { coordinates: number[][][] };
    const ring = geom.coordinates[0] as number[][];
    expect(ring[0]).toEqual([-9.42, 43.46]);
    expect(ring[ring.length - 1]).toEqual(ring[0]);
    expect(capPolygon('42,-8 42,-7 43,-7')).toEqual([
      [-8, 42],
      [-7, 42],
      [-7, 43],
      [-8, 42],
    ]);
    expect(() => capPolygon('42,-8 x,y 43,-7')).toThrow();
  });

  it('drops expired warnings', async () => {
    const { out } = await run(new Date('2026-10-25T00:00:00Z'));
    expect(out.collection.features).toHaveLength(0);
    expect(out.publishedAt).toBe('2026-10-24T06:37:10.000Z');
  });

  it('drops green (no warning) CAPs and does not fetch "Nivel verde" entries', async () => {
    const green = await readFile(fx('cap-verde-AFAZ71VV71GAGA2623.xml'), 'utf8');
    // Its expiry (2026-10-26 23:59 CET) is in the future: only the level removes it.
    expect(capFeatures(green, 'https://example.test/verde.xml', now)).toEqual([]);
    expect(
      capLinks([
        { title: 'Aviso. Nivel verde. Galernas', href: 'https://x.test/a.xml' },
        { title: 'Estado completo', href: 'https://x.test/b.tar.gz' },
        { title: 'Aviso. Nivel naranja. Vientos', href: 'https://x.test/c.xml' },
        { title: 'Aviso. Nivel naranja. Vientos', href: 'https://x.test/c.xml' },
      ]),
    ).toEqual(['https://x.test/c.xml']);
  });

  it(`fetches at most ${MAX_CAPS} CAPs per run`, () => {
    const entries = Array.from({ length: 55 }, (_, i) => ({
      title: 'Aviso. Nivel amarillo.',
      href: `https://x.test/${i}.xml`,
    }));
    expect(capLinks(entries)).toHaveLength(MAX_CAPS);
  });

  it('accepts a feed with no warnings and rejects malformed responses', async () => {
    const ctx = fixtureContext(layer, [], { now });
    const emptyFeed =
      '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><updated>2026-10-24T06:37:10+00:00</updated></feed>';
    expect(parseAtom(emptyFeed).entries).toEqual([]);
    const out = await adapter.normalize({ atom: emptyFeed, caps: [] }, ctx);
    expect(out.collection.features).toHaveLength(0);
    expect(out.publishedAt).toBe('2026-10-24T06:37:10.000Z');
    expect(() => adapter.normalize({ atom: '<html></html>', caps: [] }, ctx)).toThrow();
    expect(() =>
      adapter.normalize(
        { atom: emptyFeed, caps: [{ url: 'https://x.test/a.xml', xml: '<html/>' }] },
        ctx,
      ),
    ).toThrow();
  });
});
