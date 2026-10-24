import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { BOX, queryUrl } from './adapter.ts';

const dir = 'pipeline/layers/sismos-recentes';
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));
const now = new Date('2026-10-24T07:09:35Z');

async function run() {
  const ctx = fixtureContext(layer, [{ match: 'seismicportal.eu', file: fx('emsc-30d.json') }], {
    now,
  });
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('sismos-recentes adapter', () => {
  it('makes one request for the last 30 days in the Galicia box', async () => {
    const { ctx } = await run();
    expect(ctx.requested).toEqual([queryUrl(now)]);
    expect(ctx.requested[0]).toContain('starttime=2026-09-24T07:09:35&');
    expect(ctx.requested[0]).toContain('minlongitude=-10.5&maxlongitude=-6.5');
  });

  it('normalizes the recorded response', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs).toHaveLength(50);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(lon).toBeGreaterThanOrEqual(BOX.minlon);
      expect(lon).toBeLessThanOrEqual(BOX.maxlon);
      expect(lat).toBeGreaterThanOrEqual(BOX.minlat);
      expect(lat).toBeLessThanOrEqual(BOX.maxlat);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    // Newest lastupdate in the response.
    expect(out.publishedAt).toBe('2026-10-24T03:33:22.025Z');
  });

  it('maps EMSC fields', async () => {
    const { out } = await run();
    const q = out.collection.features.find((f) => f.id === '20261015_0000287');
    expect(q?.properties).toMatchObject({
      data: '2026-10-15T20:34:44.850Z',
      actualizado: '2026-10-16T06:48:45.375Z',
      magnitude: 4.2,
      tipo_magnitude: 'ml',
      profundidade_km: 10.2,
      autoria: 'EMSC',
      rexion: 'SPAIN',
      tipo_evento: 'ke',
      fonte_url: 'https://www.seismicportal.eu/eventdetails.html?unid=20261015_0000287',
    });
    expect(q?.properties).not.toHaveProperty('profundidade_fixada');
    expect(q?.geometry).toEqual({ type: 'Point', coordinates: [-6.6299, 42.4297] });
  });

  it('flags a depth of exactly 0 km as fixed', async () => {
    const { out } = await run();
    const fixed = out.collection.features.filter((f) => f.properties.profundidade_km === 0);
    expect(fixed.length).toBeGreaterThan(0);
    for (const f of fixed) expect(f.properties.profundidade_fixada).toBe(true);
  });

  it('accepts 204 No Content as zero events', async () => {
    const empty = join(tmpdir(), 'sismos-recentes-204.txt');
    await writeFile(empty, '');
    const ctx = fixtureContext(layer, [{ match: 'seismicportal', file: empty, status: 204 }]);
    const out = await adapter.normalize(await adapter.fetch(ctx), ctx);
    expect(out.collection.features).toHaveLength(0);
    expect(out.publishedAt).toBeNull();
  });

  it('drops events outside the box and throws on malformed responses', () => {
    const ctx = fixtureContext(layer, []);
    const outside = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          id: 'x',
          properties: {
            unid: 'x',
            lat: 40,
            lon: -8,
            time: '2026-10-20T00:00:00Z',
            lastupdate: '2026-10-20T00:10:00Z',
          },
        },
      ],
    });
    expect(adapter.normalize(outside, ctx)).toMatchObject({
      collection: { features: [] },
      publishedAt: null,
    });
    expect(() => adapter.normalize('{"features":[]}', ctx)).toThrow();
    expect(() => adapter.normalize('<html>', ctx)).toThrow();
    expect(() =>
      adapter.normalize(
        JSON.stringify({ type: 'FeatureCollection', features: [{ properties: { unid: 'y' } }] }),
        ctx,
      ),
    ).toThrow();
  });
});
