import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { type Query, queryUrl, rolling7, spanFor, timing } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const queries = JSON.parse(await readFile(join(dir, 'consultas.json'), 'utf8')) as Query[];
timing.gapMs = 0;

// Real answers of the DOC 2.0 API recorded on 1/11/2026: "Lalín" sourcecountry:spain, volume
// and tone, timespan=12m (335 days, 7/11/2025–27/10/2026, 458 articles; GDELT's own count of
// monitored articles collapses on 6/12/2025, 28/2, 6/10, 8/10, 10/10, 26/10 and 27/10/2026).
// Every concello of a batch is served the same answer.
const backfill = [
  { match: 'mode=timelinevolraw', file: fx('vol-lalin-12m.json') },
  { match: 'mode=timelinetone', file: fx('tone-lalin-12m.json') },
];

async function first() {
  const c = fixtureContext(layer, backfill, { now: new Date('2026-11-01T22:00:00Z') });
  c.readPrevious = async () => null;
  const out = await adapter.normalize(await adapter.fetch(c), c);
  return { c, out };
}

describe('galicia-noticias adapter', () => {
  it('backfills 12 months for the first batch (9) of concellos never fetched', async () => {
    const { c, out } = await first();
    expect(c.requested).toHaveLength(18);
    expect(c.requested[0]).toBe(
      'https://api.gdeltproject.org/api/v2/doc/doc?query=%22Abegondo%22%20sourcecountry%3Aspain&mode=timelinevolraw&format=json&timespan=12m',
    );
    expect(out.collection.features).toHaveLength(313);
    for (const f of out.collection.features) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    // The axis ends on the last day GDELT really covered (26 and 27/10 are an outage).
    expect(out.publishedAt).toBe('2026-10-25T00:00:00Z');
    const p = out.collection.features[0]?.properties as Record<string, unknown>;
    expect(p.desde).toBe('2025-10-26');
    const articles = p.artigos as Array<number | null>;
    expect(articles).toHaveLength(365);
    // Before GDELT's first day and on outage days: unknown, not zero.
    expect(articles[0]).toBeNull();
    expect(articles[(Date.parse('2025-12-06') - Date.parse('2025-10-26')) / 86_400_000]).toBeNull();
    expect(articles.reduce<number>((s, v) => s + (v ?? 0), 0)).toBe(458);
    expect(p.ata).toBe('2026-10-25');
    // Tone only on days with 5 articles or more.
    const i = (Date.parse('2025-11-22') - Date.parse('2025-10-26')) / 86_400_000;
    expect(articles[i]).toBe(5);
    expect((p.ton as Array<number | null>)[i]).toBe(2.1);
    expect((p.ton as Array<number | null>).filter((t) => t !== null).length).toBeLessThan(40);
    expect(JSON.stringify(out)).not.toMatch(/https?:\/\/(?!api\.gdelt)/);
  });

  it('documents every concello left out', () => {
    const out = queries.filter((q) => q.consulta === null);
    expect(out.length).toBeGreaterThan(0);
    for (const q of out) expect(q.motivo).toBeTruthy();
    expect(queries).toHaveLength(313);
  });

  it('asks the next batch never fetched, then only the days since the last update', async () => {
    const { out } = await first();
    const c = fixtureContext(layer, backfill, { now: new Date('2026-11-01T23:00:00Z') });
    c.readPrevious = async () => ({
      collection: out.collection,
      meta: {} as never,
    });
    const next = await adapter.normalize(await adapter.fetch(c), c);
    const asked = c.requested.map((u) => decodeURIComponent(u.split('query=')[1] ?? ''));
    // The 10th concello with a query comes next, with a 12-month backfill.
    const tenth = queries.filter((q) => q.consulta)[9] as Query;
    expect(asked[0]).toContain(tenth.consulta);
    expect(c.requested[0]).toContain('timespan=12m');
    // Abegondo keeps its history from the first run.
    const abegondo = next.collection.features[0]?.properties as Record<string, unknown>;
    expect(
      (abegondo.artigos as Array<number | null>).reduce<number>((s, v) => s + (v ?? 0), 0),
    ).toBeGreaterThan(400);
  });
});

describe('helpers', () => {
  it('asks 12 months the first time, the days since otherwise', () => {
    expect(spanFor(null, '2026-11-01')).toBe('12m');
    expect(spanFor('2026-10-31', '2026-11-01')).toBe('4d');
    expect(spanFor('2026-10-20', '2026-11-01')).toBe('15d');
    expect(spanFor('2025-11-01', '2026-11-01')).toBe('12m');
  });

  it('sums 7 days when at least 4 are known', () => {
    expect(rolling7([1, 2, 3, 4, null, 5, 6, 7])).toEqual([null, null, null, 10, 10, 15, 21, 27]);
    expect(rolling7([1, null, null, null, 2])).toEqual([null, null, null, null, null]);
  });

  it('builds the query URL', () => {
    expect(queryUrl('"O Grove"', 'timelinetone', '5d')).toBe(
      'https://api.gdeltproject.org/api/v2/doc/doc?query=%22O%20Grove%22%20sourcecountry%3Aspain&mode=timelinetone&format=json&timespan=5d',
    );
  });
});
