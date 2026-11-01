import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import { zipEntries } from '../../lib/zip.ts';
import adapter, { BEFORE, fillerYears, NO_DATE, parseFeed, useIndex } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// The Catastro licence forbids redistributing its original files, so the building.gml here is
// synthetic: the real element structure (copied from A Gudiña's file, 21/08/2026) with made-up
// envelopes, years and uses, and without references or links. The feed is the real one of the
// Vigo office (metadata only).
function building(x: number, y: number, year: number | null, use: string): string {
  return `  <gml:featureMember>
    <bu-ext2d:Building gml:id="ES.SDGC.BU.X">
    <gml:boundedBy>
      <gml:Envelope srsName="urn:ogc:def:crs:EPSG::25829">
         <gml:lowerCorner>${x - 4} ${y - 3}</gml:lowerCorner>
         <gml:upperCorner>${x + 4} ${y + 3}</gml:upperCorner>
      </gml:Envelope>
    </gml:boundedBy>
      <bu-core2d:conditionOfConstruction>functional</bu-core2d:conditionOfConstruction>
      <bu-core2d:dateOfConstruction>
        <bu-core2d:DateOfEvent>
          <bu-core2d:beginning>${year ?? ''}-01-01T00:00:00</bu-core2d:beginning>
          <bu-core2d:end>${year ?? ''}-01-01T00:00:00</bu-core2d:end>
        </bu-core2d:DateOfEvent>
      </bu-core2d:dateOfConstruction>
        <bu-ext2d:currentUse>${use}</bu-ext2d:currentUse>
      <bu-ext2d:numberOfDwellings>0</bu-ext2d:numberOfDwellings>
    </bu-ext2d:Building>
  </gml:featureMember>
`;
}

/** A one-member ZIP, deflated, as the Catastro serves them. */
function zip(name: string, text: string): Buffer {
  const data = Buffer.from(text, 'latin1');
  const comp = deflateRawSync(data);
  const nameB = Buffer.from(name, 'latin1');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameB.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc32(data), 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameB.length, 28);
  central.writeUInt32LE(0, 42);
  const cdStart = 30 + nameB.length + comp.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + nameB.length, 12);
  end.writeUInt32LE(cdStart, 16);
  return Buffer.concat([local, nameB, comp, central, nameB, end]);
}

// Cell (2600, 18600) of 250 m holds the town: 30 houses with the placeholder year 1900, a few
// real ones around it and later. A second cell has one farm building with no date, one with a
// typing error (2099) and one from 1850.
const X = 650_100;
const Y = 4_650_100;
const rows: string[] = [];
for (let i = 0; i < 30; i++) rows.push(building(X + i, Y, 1900, '1_residential'));
rows.push(building(X, Y + 10, 1905, '1_residential'));
for (let i = 0; i < 5; i++) rows.push(building(X + i, Y + 20, 1975, '1_residential'));
for (let i = 0; i < 3; i++) rows.push(building(X + i, Y + 30, 2005, '3_industrial'));
rows.push(building(X, Y + 40, 1975, '4_2_retail'));
rows.push(building(X + 300, Y, null, '2_agriculture'));
rows.push(building(X + 300, Y + 5, 2099, '2_agriculture'));
rows.push(building(X + 300, Y + 10, 1850, '1_residential'));
const gml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<gml:FeatureCollection gml:id="ES.SDGC.BU">
${rows.join('')}</gml:FeatureCollection>
`;
const tmp = mkdtempSync(join(tmpdir(), 'catastro-'));
const zipFile = join(tmp, 'A.ES.SDGC.BU.54057.zip');
writeFileSync(zipFile, zip('A.ES.SDGC.BU.54057.building.gml', gml));

function context() {
  return fixtureContext(
    layer,
    [
      { match: 'atom_', file: join(dir, 'fixtures', 'atom_54.xml') },
      { match: '.zip', file: zipFile },
    ],
    { env: { GA_PAUSE_MS: '0', EXPECT_ZIPS: '4' } },
  );
}

describe('construcion-edificios adapter', () => {
  it('reads the municipalities of an office feed', async () => {
    const { readFile } = await import('node:fs/promises');
    const xml = (await readFile(join(dir, 'fixtures', 'atom_54.xml'))).toString('latin1');
    const entries = parseFeed(xml, '54');
    expect(entries.map((e) => [e.code, e.name])).toEqual([
      ['54003', 'BAIONA'],
      ['54021', 'GONDOMAR'],
      ['54035', 'NIGRAN'],
      ['54057', 'VIGO'],
    ]);
    expect(entries[0]?.url).toBe(
      'https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/54/54003-BAIONA/A.ES.SDGC.BU.54003.zip',
    );
    expect(entries[0]?.updated).toBe('2026-08-21T00:00:00Z');
  });

  it('finds the member of a ZIP', () => {
    const entries = zipEntries(zip('a.building.gml', 'hello'));
    expect(entries.map((e) => [e.name, e.size, e.method])).toEqual([['a.building.gml', 5, 8]]);
  });

  it('maps the Catastro uses', () => {
    expect(
      ['1_residential', '2_agriculture', '3_industrial', '4_3_publicServices', '-'].map(useIndex),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it('takes the placeholder year of a municipality and leaves real round years', () => {
    const byYear = new Map([
      [1900, 300],
      [1905, 4],
      [1950, 40],
      [1960, 45],
      [1975, 120],
      [1980, 150],
      [NO_DATE, 20],
    ]);
    expect(fillerYears(byYear)).toEqual([1900]);
    // Few buildings: no year stands out enough to call it a placeholder.
    expect(fillerYears(new Map([[1900, 6]]))).toEqual([]);
  });

  it('counts buildings per 250 m cell, year and use, without single buildings', async () => {
    const c = context();
    const raw = await adapter.fetch(c);
    expect(raw.municipalities.map((m) => m.code)).toEqual(['54003', '54021', '54035', '54057']);
    expect(raw.municipalities[0]?.buildings).toBe(43);
    const { collection, publishedAt } = await adapter.normalize(raw, c);
    expect(publishedAt).toBe('2026-08-21T00:00:00Z');
    for (const f of collection.features)
      expect(validateWithSchema(schema, f.properties)).toEqual([]);

    const [g, cells, ...years] = collection.features.map((f) => f.properties);
    expect(cells?.lado_m).toBe(250);
    expect([cells?.x0, cells?.y0, cells?.x, cells?.y]).toEqual([2600, 18600, [0, 1], [0, 0]]);
    // Four municipalities served the same ZIP: everything ×4.
    expect(g).toMatchObject({
      concellos_catastro: 4,
      edificios: 172,
      sen_ano: 4,
      recheo: 120,
      imposibles: 4,
      antes_1900: 4,
      ano_inicio: 1900,
      ano_fin: 2005,
    });
    expect((g?.anos_recheo as Array<{ ano: number }> | undefined)?.map((r) => r.ano)).toEqual([
      1900, 1900, 1900, 1900,
    ]);
    expect(years.map((p) => [p?.ano, p?.edificios])).toEqual([
      [NO_DATE, 128],
      [BEFORE, 4],
      [1905, 4],
      [1975, 24],
      [2005, 12],
    ]);
    // 1975: 20 houses and 4 shops in the first cell, as gaps (0, 0) and buildings × 5 + use.
    const y1975 = years.find((p) => p?.ano === 1975);
    expect([y1975?.d, y1975?.v]).toEqual([
      [0, 0],
      [20 * 5 + 0, 4 * 5 + 3],
    ]);
    const noDate = years.find((p) => p?.ano === NO_DATE);
    expect(noDate?.d).toEqual([0, 1]);
    const perYear = g?.por_ano as Record<string, number[]>;
    expect(perYear.vivenda?.[75]).toBe(20);
    expect(perYear.servizos?.[75]).toBe(4);
    expect(perYear.industrial?.[105]).toBe(12);
    // Nothing that could point back to a parcel.
    expect(JSON.stringify(collection)).not.toMatch(/ES\.SDGC|sedecatastro|refcat/);
  });
});
