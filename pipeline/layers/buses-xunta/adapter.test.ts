import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import type { FetchOptions } from '../../lib/http.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  DOWNLOAD_URL,
  forEachRow,
  META_URL,
  napUpdatedAt,
  parseCsvLine,
  parseNapDate,
  redact,
  stopFeatures,
} from './adapter.ts';

const dir = 'pipeline/layers/buses-xunta';
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));

// Not a real key: a placeholder to check the header and redaction.
const FAKE_KEY = 'test0000placeholder0000key00000';
const env = { NAP_API_KEY: FAKE_KEY };
const routes = [{ match: 'api/Fichero/download/1584', file: fx('gtfs.zip') }];
const now = new Date('2026-10-24T08:00:00Z');

/** Fixture context that also records the options of each request. */
function ctxWithOpts(r = routes) {
  const ctx = fixtureContext(layer, r, { env, now });
  const opts: Array<FetchOptions | undefined> = [];
  const get = ctx.get;
  ctx.get = (url, o) => {
    opts.push(o);
    return get(url, o);
  };
  return { ctx, opts };
}

async function run() {
  const { ctx, opts } = ctxWithOpts();
  const raw = await adapter.fetch(ctx);
  const out = await adapter.normalize(raw, ctx);
  return { ctx, opts, raw, out };
}

describe('buses-xunta adapter', () => {
  it('downloads the ZIP with the key in the ApiKey header only', async () => {
    const { ctx, opts, out } = await run();
    // Download, then the optional metadata request (no fixture: it fails and is ignored).
    expect(ctx.requested).toEqual([DOWNLOAD_URL, META_URL]);
    for (const u of ctx.requested) expect(u).not.toContain(FAKE_KEY);
    expect(opts[0]?.headers).toEqual({ ApiKey: FAKE_KEY });
    expect(opts[0]?.timeoutMs).toBe(300_000);
    expect(layer.source_url).toBe(DOWNLOAD_URL);
    expect(JSON.stringify(layer)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(out)).not.toContain(FAKE_KEY);
  });

  it('normalizes the fixture GTFS into served stops', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, 0.1)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    const byId = new Map(fs.map((f) => [f.id, f.properties]));
    // 12 stops in stops.txt; SP36862 and SP19945 have no stop_times.
    expect(fs).toHaveLength(10);
    expect(byId.has('SP36862')).toBe(false);
    expect(byId.has('SP19945')).toBe(false);
    // Hospital HULA: Navia de Suarna and Pedrafita lines; "HULA"/"Hula" spellings are one line.
    expect(byId.get('SP13116')).toEqual({
      stop_id: 'SP13116',
      nome: 'HOSPITAL HULA',
      linas: 2,
      linas_nomes: 'Navia de Suarna-Hospital HULA · Pedrafita do Cebreiro-Hospital HULA',
    });
    // Pedrafita: both directions of XG721001 and XG721031 share one long name.
    expect(byId.get('SP28399')).toMatchObject({ linas: 1 });
    expect(byId.get('SP20155')).toMatchObject({
      nome: 'Ribeira E.A.',
      linas: 2,
      linas_nomes: 'Ribeira E.A.-CHUS-Hospital de Conxo-Santiago E.I. · Ribeira E.A.-Noia E.A.',
    });
    expect(out.publishedAt).toBeNull();
  });

  it('removes the temporary ZIP after normalizing', async () => {
    const { raw } = await run();
    expect(existsSync(raw.zipPath)).toBe(false);
  });

  it('takes publishedAt from the metadata only when unambiguous', () => {
    expect(napUpdatedAt({ fechaActualizacion: '2026-10-16T21:25:28Z' }, now)).toBe(
      '2026-10-16T21:25:28.000Z',
    );
    expect(napUpdatedAt({ fichero: { FechaUltimaActualizacion: '16/10/2026 21:25' } }, now)).toBe(
      '2026-10-16T19:25:00.000Z',
    );
    expect(napUpdatedAt({ fechaActualizacion: '05/10/2026' }, now)).toBeNull();
    expect(napUpdatedAt({ fechaActualizacion: '2027-01-01T00:00:00Z' }, now)).toBeNull();
    expect(napUpdatedAt({ validoDesde: '2026-10-16T00:00:00Z' }, now)).toBeNull();
    expect(napUpdatedAt(null, now)).toBeNull();
    expect(parseNapDate('10/16/2026 21:25:28')).toBe('2026-10-16T19:25:28.000Z');
    expect(parseNapDate('2026-10-16 21:25:28')).toBe('2026-10-16T19:25:28.000Z');
    expect(parseNapDate('mañá')).toBeNull();
  });

  it('uses the metadata when the request succeeds', async () => {
    const { ctx } = ctxWithOpts();
    const get = ctx.get;
    ctx.get = async (url, o) => {
      if (url !== META_URL) return get(url, o);
      const r = await get(DOWNLOAD_URL, o);
      return { ...r, url, body: Buffer.from('{"fechaActualizacion":"2026-10-16T21:25:28+02:00"}') };
    };
    const out = await adapter.normalize(await adapter.fetch(ctx), ctx);
    expect(out.publishedAt).toBe('2026-10-16T19:25:28.000Z');
  });

  it('parses quoted CSV fields', () => {
    expect(parseCsvLine('a,"b, c","d ""e""",')).toEqual(['a', 'b, c', 'd "e"', '']);
    expect(parseCsvLine('SP1,1,Rúa,43,-8')).toEqual(['SP1', '1', 'Rúa', '43', '-8']);
  });

  it('clips to Galicia and caps the names at 10', () => {
    const names = Array.from({ length: 12 }, (_, i) => `Liña ${String(i).padStart(2, '0')}`);
    const served = new Map([
      ['A', new Set(names.map((_, i) => i))],
      ['B', new Set([0])],
    ]);
    const fs = stopFeatures(
      [
        { id: 'A', name: 'A', lat: 43, lon: -8 },
        { id: 'B', name: 'B', lat: 43.4, lon: -5.8 }, // Asturias, beyond the pad
        { id: 'C', name: 'C', lat: 43, lon: -8 }, // not served
      ],
      served,
      names,
    );
    expect(fs.map((f) => f.id)).toEqual(['A']);
    expect(fs[0]?.properties.linas).toBe(12);
    expect(String(fs[0]?.properties.linas_nomes).split(' · ')).toEqual(names.slice(0, 10));
  });

  it('fails on a missing GTFS member or column', async () => {
    await expect(forEachRow(fx('gtfs.zip'), 'shapes.txt', ['shape_id'], () => {})).rejects.toThrow(
      /unzip -p shapes.txt exited/,
    );
    await expect(
      forEachRow(fx('gtfs.zip'), 'stops.txt', ['parent_station'], () => {}),
    ).rejects.toThrow(/missing column "parent_station"/);
  });

  it('fails without a key and on a non-ZIP body, never leaking the key', async () => {
    await expect(adapter.fetch(fixtureContext(layer, routes))).rejects.toThrow(
      /NAP_API_KEY is not set/,
    );

    const { ctx } = ctxWithOpts();
    const get = ctx.get;
    ctx.get = async (url, o) => {
      const r = await get(url, o);
      // A body echoing the key, to prove redaction.
      return { ...r, body: Buffer.from(`Api Key ${FAKE_KEY} is not valid.`) };
    };
    const err = (await adapter.fetch(ctx).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/not a ZIP/);
    expect(err.message).not.toContain(FAKE_KEY);
    expect(err.message).toContain('[NAP_API_KEY]');

    const failing = fixtureContext(layer, [], { env });
    failing.get = async () => {
      throw new Error(`HTTP 401 for ${DOWNLOAD_URL} with ${FAKE_KEY}`);
    };
    const e2 = (await adapter.fetch(failing).catch((e: unknown) => e)) as Error;
    expect(e2.message).not.toContain(FAKE_KEY);
    expect(redact(`x${FAKE_KEY}y`, FAKE_KEY)).toBe('x[NAP_API_KEY]y');
  });
});
