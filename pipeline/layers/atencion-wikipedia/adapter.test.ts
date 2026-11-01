import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { HttpError } from '../../lib/http.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { articleUrl, median, spikeIndex } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real answers of the per-article endpoint for Lalín, Vigo and Negueira de Muñiz (gl and es),
// 4/10/2025–31/10/2026, recorded on 1/11/2026; their 2021 census from poboacion-seculo. The
// other 310 concellos answer 404 (no views), which the adapter reads as zeros.
async function run() {
  const routes = ['gl', 'es'].flatMap((w) =>
    ['Lalín', 'Vigo', 'Negueira de Muñiz'].map((t) => ({
      match: `/${w}.wikipedia/all-access/user/${encodeURIComponent(t.replaceAll(' ', '_'))}/`,
      file: fx(`${w}-${t.replaceAll(' ', '_')}.json`),
    })),
  );
  const c = fixtureContext(layer, routes, { now: new Date('2026-11-01T06:00:00Z') });
  const get = c.get.bind(c);
  c.get = async (url, o) => {
    if (!routes.some((r) => url.includes(r.match))) {
      c.requested.push(url);
      throw new HttpError('HTTP 404', 404, 1);
    }
    return get(url, o);
  };
  c.readLayer = async (id) => {
    expect(id).toBe('poboacion-seculo');
    return {
      collection: JSON.parse(await readFile(fx('poboacion-seculo.geojson'), 'utf8')),
      meta: JSON.parse(await readFile(fx('poboacion-seculo.meta.json'), 'utf8')),
    };
  };
  const out = await adapter.normalize(await adapter.fetch(c), c);
  return { out, requested: c.requested };
}

describe('atencion-wikipedia adapter', () => {
  it('asks one daily range per article, 393 days ending yesterday', async () => {
    const { requested } = await run();
    expect(requested).toHaveLength(626);
    expect(requested).toContain(
      'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/es.wikipedia/all-access/user/Ames_(La_Coru%C3%B1a)/daily/20251004/20261031',
    );
  });

  it('publishes the last 365 days of gl and es views per concello', async () => {
    const { out } = await run();
    expect(out.publishedAt).toBe('2026-10-31T00:00:00.000Z');
    const m = new Map(out.collection.features.map((f) => [String(f.id), f.properties]));
    expect(m.size).toBe(313);
    for (const p of m.values()) expect(validateWithSchema(schema, p)).toEqual([]);
    const lalin = m.get('36024') as Record<string, unknown>;
    expect(lalin.desde).toBe('2025-11-01');
    expect((lalin.gl as number[]).length).toBe(365);
    // Same yearly figures as the research call (1/11/2025–31/10/2026): gl 1,756, es 26,706.
    expect((lalin.gl as number[]).reduce((a, b) => a + b, 0)).toBe(1756);
    expect((lalin.es as number[]).reduce((a, b) => a + b, 0)).toBe(26706);
    expect(lalin.vistas_ano).toBe(1756 + 26706);
    expect(lalin.vistas_ano_mil).toBe(1412.2);
    expect(lalin.agrupacion).toBe('dia');
  });

  it('reads a concello with no answer as zero views and no index', async () => {
    const { out } = await run();
    const ames = out.collection.features.find((f) => f.id === '15002')?.properties;
    expect(ames?.vistas_ano).toBe(0);
    expect((ames?.valor as unknown[] | undefined)?.every((v) => v === null)).toBe(true);
  });
});

describe('spike index', () => {
  const first = new Date('2026-01-05T00:00:00Z'); // a Monday

  it('compares a day with the median of the 28 days before', () => {
    const total = [...Array(28).fill(10), 10, 30, 5];
    const { grouping, index } = spikeIndex(total, first);
    expect(grouping).toBe('dia');
    expect(index).toEqual([100, 300, 50]);
  });

  it('goes weekly where the daily median is under 3', () => {
    // Four warm-up weeks of 7 views, then a week of 14 and two days of 2 (scaled to 7 days).
    const total = [...Array(28).fill(1), ...Array(7).fill(2), 2, 0];
    const { grouping, index } = spikeIndex(total, first);
    expect(grouping).toBe('semana');
    expect(index.slice(0, 7)).toEqual(Array(7).fill(200));
    expect(index.slice(7)).toEqual([100, 100]);
  });

  it('medians', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('encodes titles with underscores', () => {
    expect(articleUrl('gl', 'A Coruña', '20260101', '20260102')).toContain('/A_Coru%C3%B1a/');
  });
});
