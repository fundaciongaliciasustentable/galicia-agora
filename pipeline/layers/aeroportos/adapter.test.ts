import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  eurostatUrl,
  PAD,
  parseCsvLine,
  readAirports,
  readPassengers,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  { match: 'airports.csv', file: fx('airports.csv') },
  { match: 'avia_paoa', file: fx('avia_paoa.json') },
];
const NOW = new Date('2026-10-24T08:00:00Z');

async function run() {
  const ctx = fixtureContext(layer, routes, { now: NOW });
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

const HEADER =
  '"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"';

describe('aeroportos adapter', () => {
  it('makes two requests, the Eurostat one for the three airports since 24 months ago', async () => {
    const { ctx } = await run();
    expect(ctx.requested).toHaveLength(2);
    const u = new URL(ctx.requested[1] as string);
    expect(u.searchParams.getAll('rep_airp')).toEqual(['ES_LECO', 'ES_LEST', 'ES_LEVX']);
    expect(u.searchParams.get('sinceTimePeriod')).toBe('2024-10');
    expect(eurostatUrl(new Date('2026-01-15T00:00:00Z'))).toContain('sinceTimePeriod=2024-01');
  });

  it('normalizes the recorded responses', async () => {
    const { out } = await run();
    const fs = out.collection.features;
    expect(fs).toHaveLength(40);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, PAD)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(out.publishedAt).toBe('2026-10-21T21:00:00.000Z');
    const tipos = fs.map((f) => f.properties.tipo);
    expect(tipos.filter((t) => t === 'grande')).toHaveLength(1);
    expect(tipos.filter((t) => t === 'mediano')).toHaveLength(2);
    expect(tipos.filter((t) => t === 'pequeno')).toHaveLength(13);
    expect(tipos.filter((t) => t === 'heliporto')).toHaveLength(24);
  });

  it('adds passengers only to the three commercial airports', async () => {
    const { out } = await run();
    const byId = new Map(out.collection.features.map((f) => [f.id, f.properties]));
    expect(byId.get('LEST')).toMatchObject({
      icao: 'LEST',
      iata: 'SCQ',
      tipo: 'grande',
      servizo_regular: true,
      elevacion_m: 370, // 1213 ft
      pasaxeiros_mes: 171132,
      pasaxeiros_periodo: '2026-03',
      pasaxeiros_12_meses: 2922431,
      fonte_url: 'https://ourairports.com/airports/LEST/',
    });
    expect(byId.get('LECO')).toMatchObject({
      pasaxeiros_mes: 117086,
      pasaxeiros_12_meses: 1308076,
    });
    expect(byId.get('LEVX')).toMatchObject({ pasaxeiros_mes: 91690, pasaxeiros_12_meses: 1107022 });
    expect(byId.get('ES-0010')).toMatchObject({
      tipo: 'pequeno',
      icao: null,
      pasaxeiros_mes: null,
      pasaxeiros_periodo: null,
    });
    const withPax = out.collection.features.filter((f) => f.properties.pasaxeiros_mes !== null);
    expect(withPax.map((f) => f.id).sort()).toEqual(['LECO', 'LEST', 'LEVX']);
  });

  it('excludes other regions and closed sites', () => {
    const csv = Buffer.from(
      [
        HEADER,
        '1,"ES-X1","closed","Old field",42.5,-8.5,100,"EU","ES","ES-GA","Lalín","no",,,,,,,',
        '2,"ES-X2","small_airport","Asturian field",43.5,-7.0,100,"EU","ES","ES-AS","Vegadeo","no",,,,,,,',
        '3,"ES-X3","heliport","Helipad, ""quoted""",42.5,-8.5,,"EU","ES","ES-GA",,"no",,,,,,,',
      ].join('\r\n'),
    );
    const a = readAirports(csv);
    expect(a.map((x) => x.ident)).toEqual(['ES-X3']);
    expect(a[0]).toMatchObject({ nome: 'Helipad, "quoted"', elevacion_m: null, localidade: null });
    expect(parseCsvLine('1,"a,b",,"c""d"')).toEqual(['1', 'a,b', '', 'c"d']);
  });

  it('leaves the 12-month total null when a month is missing', async () => {
    const ds = JSON.parse(await readFile(fx('avia_paoa.json'), 'utf8'));
    delete ds.value['30']; // LEST 2025-04
    const { byIcao } = readPassengers(ds);
    expect(byIcao.get('LEST')).toEqual({ mes: 171132, periodo: '2026-03', ultimos12: null });
    expect(byIcao.get('LECO')?.ultimos12).toBe(1308076);
  });

  it('throws on malformed responses', async () => {
    const ctx = fixtureContext(layer, [], { now: NOW });
    const csv = await readFile(fx('airports.csv'));
    const eurostat = JSON.parse(await readFile(fx('avia_paoa.json'), 'utf8'));
    expect(() => adapter.normalize({ csv, eurostat: { error: 'x' } }, ctx)).toThrow();
    expect(() => adapter.normalize({ csv: Buffer.from(''), eurostat }, ctx)).toThrow();
    expect(() => adapter.normalize({ csv: Buffer.from('a,b,c\n1,2,3'), eurostat }, ctx)).toThrow(
      /missing column/,
    );
    const noTotal = { ...eurostat, dimension: { ...eurostat.dimension } };
    noTotal.dimension.schedule = { category: { index: { SCHED: 0 } } };
    expect(() => adapter.normalize({ csv, eurostat: noTotal }, ctx)).toThrow(/schedule/);
    const empty = await adapter.normalize({ csv: Buffer.from(HEADER), eurostat }, ctx);
    expect(empty.collection.features).toHaveLength(0);
  });
});
