import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Feature, inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  countTrips,
  FEEDS,
  httpDateToIso,
  keepStation,
  parseProvinces,
  referenceDay,
  STATIONS_URL,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
// Saturday: the reference day is Wednesday 2026-10-28.
const now = new Date('2026-10-24T08:00:00Z');

const routes = [
  { match: 'google_transit.zip', file: fx('google_transit.zip') },
  { match: 'fomento_transit.zip', file: fx('fomento_transit.zip') },
  { match: 'estaciones.csv', file: fx('estaciones.csv') },
];

/** Real Last-Modified values of the two ZIPs (18/10 and 24/10/2026). */
const LAST_MODIFIED: Record<string, string> = {
  [FEEDS.ld]: 'Sat, 17 Oct 2026 23:06:53 GMT',
  [FEEDS.cercanias]: 'Sat, 24 Oct 2026 02:08:23 GMT',
};

function ctxFor(r = routes, withHeaders = true) {
  const ctx = fixtureContext(layer, r, { now });
  const get = ctx.get;
  ctx.get = async (url, o) => {
    const res = await get(url, o);
    return withHeaders ? { ...res, lastModified: LAST_MODIFIED[url] ?? null } : res;
  };
  return ctx;
}

async function run(r = routes, withHeaders = true) {
  const ctx = ctxFor(r, withHeaders);
  const raw = await adapter.fetch(ctx);
  return { ctx, raw, out: await adapter.normalize(raw, ctx) };
}

const props = (fs: Feature[], id: string) => fs.find((f) => f.id === id)?.properties;

describe('estacions-tren adapter', () => {
  it('normalizes both real GTFS fixtures into valid stations inside Galicia', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toEqual([FEEDS.ld, FEEDS.cercanias, STATIONS_URL]);
    const fs = out.collection.features;
    expect(fs).toHaveLength(27);
    for (const f of fs) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, 0.05)).toBe(true);
      expect(f.properties.dia_referencia).toBe('2026-10-28');
    }
    // Stops outside Galicia (Madrid, Zaragoza) and stops without trips (Viveiro, Ribadeo) drop.
    for (const id of ['17000', '04040', '05155', '05193', '05299']) {
      expect(props(fs, id)).toBeUndefined();
    }
  });

  it('counts the trips calling on the reference Wednesday', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    // Counted independently from the fixture (calendar + calendar_dates exceptions).
    expect(props(fs, '22100')).toMatchObject({
      nome: 'Ourense',
      servizos_dia: 12,
      linas: 'ALVIA · AVLO · Intercity',
      rede: 'AV/LD/MD',
    });
    expect(props(fs, '20300')?.servizos_dia).toBe(9);
    expect(props(fs, '31412')).toMatchObject({ nome: 'A Coruña', servizos_dia: 1, linas: 'AVLO' });
    // Ferrol line (Cercanías feed): 6 Wednesday trips in the fixture.
    expect(props(fs, '21010')).toMatchObject({
      nome: 'Ferrol',
      servizos_dia: 6,
      linas: 'C1',
      rede: 'Cercanías',
    });
    // Ferrerías is only served by the Saturday trips of the fixture: listed, 0 that day.
    expect(props(fs, '05109')).toMatchObject({ servizos_dia: 0, linas: 'C1' });
  });

  it('counts a train present in both feeds at the same time only once', () => {
    const trips = {
      ld: new Map([
        ['REG1', '08:23:00'],
        ['REG2', '09:57:00'],
      ]),
      cercanias: new Map([
        ['C1a', '08:23:00'],
        ['C1b', '07:28:00'],
      ]),
    };
    expect(countTrips(trips)).toBe(3);
  });

  it('takes publishedAt from the newest ZIP Last-Modified, or null', async () => {
    expect((await run()).out.publishedAt).toBe('2026-10-24T02:08:23.000Z');
    expect((await run(routes, false)).out.publishedAt).toBeNull();
    expect(httpDateToIso('not a date')).toBeNull();
  });

  it('works without the optional station list', async () => {
    const { out } = await run(routes.slice(0, 2));
    expect(out.collection.features).toHaveLength(27);
  });

  it('drops stations that Renfe places outside Galicia', async () => {
    const prov = parseProvinces(await readFile(fx('estaciones.csv')));
    expect(prov.get('21010')).toBe('CORUÑA, A');
    expect(prov.get('05299')).toBe('ASTURIAS');
    expect(keepStation('05299', -7.0147697, 43.5095861, prov)).toBe(false); // Castropol
    expect(keepStation('05197', -7.057327, 43.479667, prov)).toBe(false); // Vegadeo
    expect(keepStation('05193', -7.055572, 43.53607, prov)).toBe(true); // Ribadeo
    expect(keepStation('99999', -8.0, 42.5, prov)).toBe(true); // unknown code, bbox only
    expect(keepStation('17000', -3.68, 40.47, prov)).toBe(false);
  });

  it('uses the first Wednesday on or after the Madrid date', () => {
    expect(referenceDay(new Date('2026-10-24T08:00:00Z'))).toBe('20261028');
    expect(referenceDay(new Date('2026-10-28T22:30:00Z'))).toBe('20261028');
    // 00:30 on Thursday in Madrid → next Wednesday.
    expect(referenceDay(new Date('2026-10-28T23:30:00Z'))).toBe('20261104');
  });

  it('throws on a non-ZIP download and on a GTFS without stop_times', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'estacions-tren-test-'));
    await writeFile(join(tmp, 'html.zip'), '<html>Mantenimiento</html>');
    const html = [{ match: 'google_transit.zip', file: join(tmp, 'html.zip') }, ...routes];
    await expect(run(html)).rejects.toThrow(/not a ZIP/);

    await copyFile(fx('fomento_transit.zip'), join(tmp, 'broken.zip'));
    execFileSync('zip', ['-q', '-d', join(tmp, 'broken.zip'), 'stop_times.txt']);
    const broken = [{ match: 'fomento_transit.zip', file: join(tmp, 'broken.zip') }, ...routes];
    const ctx = ctxFor(broken);
    const raw = await adapter.fetch(ctx);
    await expect(adapter.normalize(raw, ctx)).rejects.toThrow(/without stop_times/);
    // The temporary directory is removed even when normalize fails.
    expect(existsSync(raw.dir)).toBe(false);
  });
});
