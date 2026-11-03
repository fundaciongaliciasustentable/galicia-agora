import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AdapterContext, LayerDef, PublishedLayer } from '../../lib/adapter.ts';
import { HttpError } from '../../lib/http.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import adapter, {
  advance,
  build,
  normName,
  readZip,
  type State,
  titleName,
  type Year,
  zipUrl,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const places: PublishedLayer = {
  collection: JSON.parse(await readFile(fx('entidades-poboacion.geojson'), 'utf8')),
  meta: JSON.parse(await readFile(fx('entidades-poboacion.meta.json'), 'utf8')),
};
const year = async (y: number): Promise<[number, Year]> => [
  y,
  await readZip(await readFile(fx(`Nacional_${y}.zip`))),
];

describe('aldeas-baleiras', () => {
  it('declares the 2025 ZIP as its source', () => {
    expect(layer.source_url).toBe(zipUrl(2025));
  });

  it('reads Latin-1 and UTF-8 members, Galician singular entities only', async () => {
    const [, y2000] = await year(2000);
    const [, y2025] = await year(2025);
    expect([...y2000.keys()].every((c) => /^(15|27)\d{7}00$/.test(c) && !c.endsWith('0000'))).toBe(
      true,
    );
    expect([...y2025.values()].some((u) => u.name.includes('Ñ') || /[ÁÉÍÓÚ]/.test(u.name))).toBe(
      true,
    );
    expect([...y2000.values()].some((u) => u.name.includes('Ñ') || /[ÁÉÍÓÚ]/.test(u.name))).toBe(
      true,
    );
  });

  it('follows the entities of Oza-Cesuras back to Oza and Cesuras', async () => {
    const { features, last } = build({
      previous: null,
      places,
      years: [await year(2000), await year(2013), await year(2025)],
    });
    expect(last).toBe(2025);
    const oza = features
      .map((f) => f.properties)
      .filter((p) => String(p.codigo).startsWith('15902'));
    expect(oza.length).toBeGreaterThan(50);
    // Most have a 2000 population, so their history was carried over the merger.
    expect(oza.filter((p) => p.pob_2000 !== null).length / oza.length).toBeGreaterThan(0.9);
    for (const f of features) expect(validateWithSchema(schema, f.properties)).toEqual([]);
    // Most entities get the IET point with the same code.
    expect(features.filter((f) => f.geometry).length / features.length).toBeGreaterThan(0.8);
  });

  it('records the empty years, the last emptying and revivals', () => {
    const u = (pop: number) => new Map([['27034010100', { name: 'X (A)', parish: 'Y', pop }]]);
    const state = new Map<string, State>();
    advance(state, [
      [2000, u(3)],
      [2001, u(0)],
      [2002, u(0)],
      [2003, u(2)],
      [2004, u(0)],
    ]);
    expect(state.get('27034010100')).toMatchObject({
      baleira_desde: 2004,
      rexurdiu: true,
      anos_baleira: [2001, 2002, 2004],
      pob_2000: 3,
    });
    advance(state, [[2005, u(1)]]);
    expect(state.get('27034010100')).toMatchObject({ baleira_desde: null, rexurdiu: true });
  });

  it('downloads years until the INE answers 404, after its own last year', async () => {
    const requested: string[] = [];
    const ctx: AdapterContext = {
      layer,
      now: new Date('2026-11-03T12:00:00Z'),
      env: {},
      async get(url) {
        requested.push(url);
        if (!url.endsWith('Nacional_2025.zip')) throw new HttpError(`HTTP 404 for ${url}`, 404, 1);
        return {
          url,
          status: 200,
          notModified: false,
          body: await readFile(fx('Nacional_2025.zip')),
          headers: {},
          etag: null,
          lastModified: null,
          attempts: 1,
        };
      },
      readLayer: async () => places,
      readPrevious: async () => ({
        collection: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: null,
              properties: {
                codigo: '27034010100',
                nome_ine: 'X',
                pob_2000: 1,
                pob: 0,
                ano: 2024,
                primeiro_ano: 2000,
                baleira_desde: 2010,
                baleira_antes_2000: false,
                rexurdiu: false,
                anos_baleira: [2010],
              },
            },
          ],
        },
        meta: places.meta,
      }),
    };
    const raw = await adapter.fetch(ctx);
    expect(requested).toEqual([zipUrl(2025), zipUrl(2026)]);
    expect(raw.years.map(([y]) => y)).toEqual([2025]);
  });

  it('normalises names both ways', () => {
    expect(normName('GALLADO (O)')).toBe(normName('O Gallado'));
    expect(titleName('GALLADO (O)')).toBe('O Gallado');
  });
});
