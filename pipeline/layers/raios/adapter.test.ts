import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { queryUrl, utcToIso } from './adapter.ts';

const dir = 'pipeline/layers/raios';
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));

async function run(now: Date, file = 'jsonRaios-17-23oct.json') {
  const ctx = fixtureContext(layer, [{ match: 'jsonRaios.action', file: fx(file) }], { now });
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('raios adapter', () => {
  it('makes exactly one request covering yesterday and today', async () => {
    const { ctx } = await run(new Date('2026-10-18T05:00:00Z'));
    expect(ctx.requested).toEqual([
      'https://servizos.meteogalicia.gal/mgrss/observacion/jsonRaios.action?dataIni=17/10/2026&dataFin=18/10/2026',
    ]);
  });

  it('ends the range at the Madrid date, so local and UTC days are both covered', () => {
    // 23:30 UTC on the 18th is already the 19th in Madrid.
    expect(queryUrl(new Date('2026-10-18T23:30:00Z'))).toContain(
      'dataIni=17/10/2026&dataFin=19/10/2026',
    );
    expect(queryUrl(new Date('2027-01-01T00:30:00Z'))).toContain(
      'dataIni=31/12/2026&dataFin=01/01/2027',
    );
  });

  it('normalizes the recorded response (strikes inside Galicia, last 24 h)', async () => {
    const { out } = await run(new Date('2026-10-18T05:00:00Z'));
    const fs = out.collection.features;
    expect(fs).toHaveLength(66);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, 0.1)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(fs.filter((f) => f.properties.polaridade === 'positivo')).toHaveLength(33);
    expect(out.publishedAt).toBe('2026-10-17T09:04:29.000Z');
  });

  it('maps peakCurrent to intensity and polarity', async () => {
    const { out } = await run(new Date('2026-10-18T05:00:00Z'));
    const first = out.collection.features[0];
    expect(first?.properties).toEqual({
      data: '2026-10-17T05:29:48.000Z',
      intensidade_ka: -9,
      polaridade: 'negativo',
    });
    expect(first?.geometry).toEqual({ type: 'Point', coordinates: [-7.3875, 42.5001] });
  });

  it('keeps only the last 24 hours', async () => {
    const { out } = await run(new Date('2026-10-18T08:00:00Z'));
    expect(out.collection.features).toHaveLength(19);
    const { out: later } = await run(new Date('2026-10-20T08:00:00Z'));
    expect(later.collection.features).toHaveLength(0);
    expect(later.publishedAt).toBeNull();
  });

  it('accepts a day without strikes and rejects malformed responses', async () => {
    const { out } = await run(new Date('2026-10-24T07:12:42Z'), 'jsonRaios-hoxe-baleiro.json');
    expect(out.collection.features).toHaveLength(0);
    expect(out.publishedAt).toBeNull();
    const ctx = fixtureContext(layer, []);
    expect(() => adapter.normalize({}, ctx)).toThrow();
    expect(() => adapter.normalize({ raios: [{ data: 'x' }] }, ctx)).toThrow();
    expect(() =>
      adapter.normalize(
        { raios: [{ listaRaios: [{ fecha: '17/10/2026 05:00', lat: 42, lon: -8 }] }] },
        ctx,
      ),
    ).toThrow();
    expect(utcToIso('2026-10-17T05:29:48')).toBe('2026-10-17T05:29:48.000Z');
  });
});
