import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { detectionTime, parseCsv, redact } from './adapter.ts';

const dir = 'pipeline/layers/focos-calor';
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));

const europeRoutes = [
  { match: 'SUOMI_VIIRS_C2_Europe_24h.csv', file: fx('SUOMI_VIIRS_C2_Europe_24h.csv') },
  { match: 'J1_VIIRS_C2_Europe_24h.csv', file: fx('J1_VIIRS_C2_Europe_24h.csv') },
  { match: 'J2_VIIRS_C2_Europe_24h.csv', file: fx('J2_VIIRS_C2_Europe_24h.csv') },
  { match: 'MODIS_C6_1_Europe_24h.csv', file: fx('MODIS_C6_1_Europe_24h.csv') },
];

// Not a real key: a placeholder to check the keyed code path and redaction.
const FAKE_KEY = 'test0000placeholder0000key00000';

async function run(ctx: ReturnType<typeof fixtureContext>) {
  return adapter.normalize(await adapter.fetch(ctx), ctx);
}

describe('focos-calor (keyless Europe fallback)', () => {
  it('normalizes the real Europe 24 h files clipped to Galicia', async () => {
    const ctx = fixtureContext(layer, europeRoutes);
    const { collection, publishedAt } = await run(ctx);
    expect(ctx.requested).toHaveLength(4);
    expect(ctx.requested.every((u) => !u.includes('/api/'))).toBe(true);
    // 2 SNPP + 12 NOAA-20 + 11 NOAA-21 + 2 MODIS inside the bbox in the recorded files.
    expect(collection.features).toHaveLength(27);
    for (const f of collection.features) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, 0.01)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(publishedAt).toBe('2026-10-18T03:02:00.000Z');
  });

  it('reads VIIRS and MODIS columns', async () => {
    const { collection } = await run(fixtureContext(layer, europeRoutes));
    const modis = collection.features.filter((f) => f.properties.instrumento === 'MODIS');
    expect(modis).toHaveLength(2);
    expect(modis[0]?.properties).toMatchObject({
      satelite: 'Terra',
      confianza: 'alta',
      confianza_pct: 100,
      dia_noite: 'noite',
    });
    const sats = new Set(collection.features.map((f) => f.properties.satelite));
    expect(sats).toEqual(new Set(['Suomi NPP', 'NOAA-20', 'NOAA-21', 'Terra']));
    const viirs = collection.features.find((f) => f.properties.satelite === 'NOAA-21');
    expect(viirs?.properties).toMatchObject({
      instrumento: 'VIIRS',
      confianza: 'nominal',
      confianza_pct: null,
    });
  });

  it('accepts the area API column layout (instrument column, short confidence)', () => {
    const csv = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      '42.06,-8.2,330.1,0.4,0.4,2026-10-17,105,N20,VIIRS,h,2.0NRT,290,3.9,D',
    ].join('\n');
    const [f] = parseCsv(csv, 'VIIRS_NOAA20_NRT');
    expect(f?.properties).toMatchObject({
      satelite: 'NOAA-20',
      instrumento: 'VIIRS',
      confianza: 'alta',
      data_deteccion: '2026-10-17T01:05:00.000Z',
    });
  });
});

describe('time conversion and clipping', () => {
  it('converts acq_date + acq_time (UTC HHMM) to ISO', () => {
    expect(detectionTime('2026-10-17', '2049')).toBe('2026-10-17T20:49:00.000Z');
    expect(detectionTime('2026-10-18', '0005')).toBe('2026-10-18T00:05:00.000Z');
    expect(detectionTime('2026-10-18', '5')).toBe('2026-10-18T00:05:00.000Z');
    expect(() => detectionTime('17/10/2026', '2049')).toThrow();
  });

  it('drops detections outside the Galicia bbox', () => {
    const csv = [
      'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight',
      '64.66731,21.29199,317.88,1,1,2026-10-17,0330,A,95,6.1NRT,277.31,20.24,N',
      '43.12929,-9.10432,342.71,1.05,1.02,2026-10-17,2049,T,25,6.1NRT,286.84,54.1,N',
      '43.9,-8.0,342.71,1.05,1.02,2026-10-17,2049,T,50,6.1NRT,286.84,54.1,D',
    ].join('\n');
    const out = parseCsv(csv, 'MODIS_NRT');
    expect(out).toHaveLength(1);
    expect(out[0]?.properties.confianza).toBe('baixa');
  });
});

describe('focos-calor (area API with key)', () => {
  const apiRoutes = [
    { match: '/VIIRS_SNPP_NRT/', file: fx('SUOMI_VIIRS_C2_Europe_24h.csv') },
    { match: '/VIIRS_NOAA20_NRT/', file: fx('J1_VIIRS_C2_Europe_24h.csv') },
    { match: '/VIIRS_NOAA21_NRT/', file: fx('J2_VIIRS_C2_Europe_24h.csv') },
    { match: '/MODIS_NRT/', file: fx('MODIS_C6_1_Europe_24h.csv') },
  ];

  it('uses the area API for the four products when FIRMS_MAP_KEY is set', async () => {
    const ctx = fixtureContext(layer, apiRoutes, { env: { FIRMS_MAP_KEY: FAKE_KEY } });
    const { collection } = await run(ctx);
    expect(ctx.requested).toHaveLength(4);
    for (const u of ctx.requested) {
      expect(u).toContain(`/api/area/csv/${FAKE_KEY}/`);
      expect(u).toContain('/-9.35,41.8,-6.7,43.8/1');
    }
    expect(collection.features.length).toBeGreaterThan(0);
    expect(JSON.stringify(collection)).not.toContain(FAKE_KEY);
  });

  it('never leaks the key in errors', async () => {
    const ctx = fixtureContext(layer, [], { env: { FIRMS_MAP_KEY: FAKE_KEY } });
    const err = await adapter.fetch(ctx).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain(FAKE_KEY);
    expect((err as Error).message).toContain('[FIRMS_MAP_KEY]');
    expect(redact(`x/${FAKE_KEY}/y/${FAKE_KEY}`, FAKE_KEY)).toBe(
      'x/[FIRMS_MAP_KEY]/y/[FIRMS_MAP_KEY]',
    );
  });

  it('throws on the real invalid-key response', async () => {
    const ctx = fixtureContext(layer, [{ match: '/api/', file: fx('area_api_invalid_key.txt') }], {
      env: { FIRMS_MAP_KEY: FAKE_KEY },
    });
    await expect(run(ctx)).rejects.toThrow(/Unexpected FIRMS response/);
  });
});

describe('malformed input', () => {
  it('throws on an empty body and yields 0 features on header-only CSV', async () => {
    const ctx = fixtureContext(layer, []);
    expect(() =>
      adapter.normalize({ mode: 'europe', files: [{ product: 'MODIS_NRT', csv: '' }] }, ctx),
    ).toThrow();
    const header =
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight';
    const out = await adapter.normalize(
      { mode: 'europe', files: [{ product: 'VIIRS_SNPP_NRT', csv: header }] },
      ctx,
    );
    expect(out.collection.features).toHaveLength(0);
    expect(out.publishedAt).toBeNull();
  });
});
