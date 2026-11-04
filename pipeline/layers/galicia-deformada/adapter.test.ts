import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LayerDef, PublishedLayer } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { BASE, INPUTS, RATES, REQUESTS, simplifyShared, VARIABLES } from './adapter.ts';
import { Cosine } from './diffusion.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

async function readFixture(id: string): Promise<PublishedLayer> {
  return {
    collection: JSON.parse(await readFile(fx(`${id}.geojson`), 'utf8')),
    meta: JSON.parse(await readFile(fx(`${id}.meta.json`), 'utf8')),
  };
}

function context() {
  const ctx = fixtureContext(
    layer,
    Object.entries(REQUESTS).map(([key, query]) => ({ match: query, file: fx(`${key}.csv`) })),
    { now: new Date('2026-11-03T18:00:00Z'), env: { IGE_PAUSE_MS: '0', CARTOGRAM_GRID: '64' } },
  );
  return { ...ctx, readLayer: readFixture };
}

/** Rings of a `formas` entry back to absolute positions. */
function decode(rings: number[][]): Array<Array<[number, number]>> {
  return rings.map((r) => {
    const out: Array<[number, number]> = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < r.length; i += 2) {
      x += r[i] as number;
      y += r[i + 1] as number;
      out.push([x, y]);
    }
    return out;
  });
}

const ringArea = (r: Array<[number, number]>) =>
  Math.abs(
    r.reduce((s, [x, y], i) => {
      const [x1, y1] = r[(i + 1) % r.length] as [number, number];
      return s + x * y1 - x1 * y;
    }, 0) / 2,
  );
const area = (rings: number[][]) =>
  decode(rings).reduce((s, r, i) => s + (i === 0 ? 1 : -1) * ringArea(r), 0);

let rows: Array<Record<string, unknown>> = [];
let requested: string[] = [];
beforeAll(async () => {
  const ctx = context();
  const { collection } = await adapter.normalize(await adapter.fetch(ctx), ctx);
  rows = collection.features.map((f) => f.properties);
  requested = ctx.requested;
}, 60_000);

describe('galicia-deformada adapter', () => {
  it('declares its inputs and its GDP source', () => {
    expect(layer.depends_on).toEqual([...INPUTS]);
    expect(layer.source_url).toBe(BASE + REQUESTS.t9958);
  });

  it('publishes the original counts and the own calculations of every concello', async () => {
    expect(rows.map((r) => r.codigo_ine)).toEqual(['15005', '15017', '15030', '15031', '15058']);
    for (const r of rows) expect(validateWithSchema(schema, r)).toEqual([]);
    expect(requested).toHaveLength(3);

    const coruna = rows.find((r) => r.codigo_ine === '15030');
    expect(coruna).toMatchObject({
      nome: 'A Coruña',
      poboacion: 251277,
      pib: 9450637,
      nacementos: 1411,
      defuncions: 2692,
      poboacion_1950: 127618,
      poboacion_2021: 245541,
      periodos: { poboacion: '2025', pib: '2023', nacementos: '2024', poboacion_1950: '1950' },
    });
    // Register × IGE shares: the three age groups add up to the register.
    const old = coruna?.maiores_65 as number;
    const young = coruna?.menores_20 as number;
    expect(old).toBeGreaterThan(60000);
    expect(young + old).toBeLessThan(251277);
  });

  it('gives every variable a cartogram whose areas follow the values', async () => {
    for (const v of ['superficie', ...VARIABLES, ...RATES]) {
      const areas = rows.map((r) =>
        area((r.formas as Record<string, number[][]>)[v] as number[][]),
      );
      const values = rows.map((r) => (v === 'superficie' ? r.superficie_km2 : r[v]) as number);
      const totalA = areas.reduce((s, a) => s + a, 0);
      const totalV = values.reduce((s, x) => s + x, 0);
      // Integer quarter cells: a few percent of slack on these small shapes.
      areas.forEach((a, i) => {
        expect(a / totalA).toBeCloseTo((values[i] as number) / totalV, 1);
      });
    }
  });
});

describe('simplifyShared', () => {
  it('simplifies a shared jagged border the same way on both sides', () => {
    // Two squares side by side; their common border at x = 1 zig-zags by ±0.0001°.
    const border: Array<[number, number]> = [];
    for (let i = 0; i <= 50; i++) border.push([1 + (i % 2 ? 0.0001 : 0), i / 50]);
    const left = [[[0, 0], ...border, [0, 1], [0, 0]] as Array<[number, number]>];
    const right = [[[2, 0], [2, 1], ...[...border].reverse(), [2, 0]] as Array<[number, number]>];
    const out = simplifyShared(
      new Map([
        ['a', [left]],
        ['b', [right]],
      ]),
      1,
      0,
    );
    const pts = (code: string) =>
      new Set(
        out
          .get(code)?.[0]?.[0]
          ?.filter(([x]) => x > 0.5 && x < 1.5)
          .map((p) => p.join()),
      );
    const a = pts('a');
    const b = pts('b');
    expect(a.size).toBeLessThan(10);
    expect([...a].sort()).toEqual([...b].sort());
  });
});

describe('Cosine', () => {
  it('synthesises back what it analyses', () => {
    const n = 32;
    const c = new Cosine(n);
    const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i) + i / n);
    const a = new Float64Array(n);
    const back = new Float64Array(n);
    c.analyse(x, a);
    c.cosSum(a, back);
    back.forEach((v, i) => {
      expect(v).toBeCloseTo(x[i] as number, 10);
    });
  });
});
