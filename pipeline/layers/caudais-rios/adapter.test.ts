import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { redact, requestUrl, SOURCE_URL, utcToIso } from './adapter.ts';

const dir = 'pipeline/layers/caudais-rios';
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));

// Not a real key: a placeholder to check the keyed request and redaction.
const FAKE_KEY = 'test0000placeholder+key/0000';
const env = { METEOGALICIA_AFOROS_KEY: FAKE_KEY };
const routes = [{ match: 'mgafos/json/estadoActual.action', file: fx('estadoActual.json') }];

async function run() {
  const ctx = fixtureContext(layer, routes, { env });
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

const row = (id: number, dataUTC: string, caudal = 1, nivel = 0.5) => ({
  idEstacion: id,
  estacion: `E${id}`,
  concello: 'LUGO',
  provincia: 'Lugo',
  dataUTC,
  lat: 43,
  lon: -7.5,
  valorCaudal: caudal,
  valorNivel: nivel,
});

describe('caudais-rios adapter', () => {
  it('makes exactly one request, with the key only in the request URL', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toEqual([requestUrl(FAKE_KEY)]);
    expect(ctx.requested[0]).toContain(`cod=${encodeURIComponent(FAKE_KEY)}`);
    expect(layer.source_url).toBe(SOURCE_URL);
    expect(layer.source_url).not.toContain('cod=');
    expect(JSON.stringify(layer)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(out)).not.toContain(FAKE_KEY);
  });

  it('normalizes the recorded response', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    // 89 stations: one stale (2026-10-23) and one with neither value are dropped.
    expect(fs).toHaveLength(87);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, 0.1)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(out.publishedAt).toBe('2026-10-24T07:10:00.000Z');
    const byId = new Map(fs.map((f) => [f.id, f.properties]));
    expect(byId.get(141167)).toEqual({
      id: 141167,
      nome: 'Barcés - Abegondo',
      concello: 'ABEGONDO',
      provincia: 'A Coruña',
      caudal_m3s: 0.426,
      nivel_m: 0.763,
      data_medida: '2026-10-24T07:10:00.000Z',
    });
    // -9999 is "no data": null, the station is kept for its level.
    expect(byId.get(141125)).toMatchObject({ caudal_m3s: null, nivel_m: 0.126 });
    expect(byId.has(141350)).toBe(false); // reading from 2026-10-23
    expect(byId.has(140508)).toBe(false); // flow and level both -9999
  });

  it('reads dataUTC as UTC', () => {
    expect(utcToIso('2026-10-24T07:10:00')).toBe('2026-10-24T07:10:00.000Z');
    expect(() => utcToIso('24/10/2026 07:10')).toThrow();
  });

  it('keeps a reading exactly 3 h old and drops one older', async () => {
    const raw = {
      listEstadoActual: [
        row(1, '2026-10-24T10:00:00'),
        row(2, '2026-10-24T07:00:00'),
        row(3, '2026-10-24T06:59:00'),
      ],
    };
    const out = await adapter.normalize(raw, fixtureContext(layer, []));
    expect(out.collection.features.map((f) => f.id)).toEqual([1, 2]);
  });

  it('drops stations outside Galicia or without coordinates', async () => {
    const raw = {
      listEstadoActual: [
        row(1, '2026-10-24T10:00:00'),
        { ...row(2, '2026-10-24T10:00:00'), lon: -5.8 },
        { ...row(3, '2026-10-24T10:00:00'), lat: null },
      ],
    };
    const out = await adapter.normalize(raw, fixtureContext(layer, []));
    expect(out.collection.features.map((f) => f.id)).toEqual([1]);
  });

  it('fails without a key, on the HTML error page, and on an unexpected shape', async () => {
    await expect(adapter.fetch(fixtureContext(layer, routes))).rejects.toThrow(
      /METEOGALICIA_AFOROS_KEY is not set/,
    );
    // Without a valid key the real service answers 200 with an HTML error page
    // (pipeline/samples/augas-galicia/mgafos_estadoActual_nokey.txt, not committed).
    const html = fixtureContext(layer, [], { env });
    html.get = async (url) => ({
      url,
      status: 200,
      notModified: false,
      body: Buffer.from('<!DOCTYPE html><title>Erro - MeteoGalicia</title>'),
      headers: {},
      etag: null,
      lastModified: null,
      attempts: 1,
    });
    await expect(adapter.fetch(html)).rejects.toThrow(/HTML page instead of JSON/);
    const ctx = fixtureContext(layer, []);
    expect(() => adapter.normalize({}, ctx)).toThrow(/listEstadoActual/);
    const empty = await adapter.normalize({ listEstadoActual: [] }, ctx);
    expect(empty.collection.features).toHaveLength(0);
    expect(empty.publishedAt).toBeNull();
  });

  it('never leaks the key in errors', async () => {
    const ctx = fixtureContext(layer, [], { env }); // no route: get throws with the full URL
    const err = await adapter.fetch(ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).not.toContain(FAKE_KEY);
    expect(msg).not.toContain(encodeURIComponent(FAKE_KEY));
    expect(msg).toContain('[METEOGALICIA_AFOROS_KEY]');
    expect(redact(`a ${FAKE_KEY} b ${encodeURIComponent(FAKE_KEY)}`, FAKE_KEY)).toBe(
      'a [METEOGALICIA_AFOROS_KEY] b [METEOGALICIA_AFOROS_KEY]',
    );
  });
});
