import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { PAD, parseSite, scanSites, textChunks } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fixture = join(dir, 'fixtures', 'electrolineras.xml');
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [{ match: 'electrolineras.xml', file: fixture }];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

const site = (id: string, address: string, lat = 42.4, lon = -8.6) => `
  <egi:energyInfrastructureSite id="${id}" version="">
    <fac:name><com:values><com:value lang="es">Sitio ${id} &amp; cía</com:value></com:values></fac:name>
    <fac:lastUpdated>2024-03-04T10:43:12.000+01:00</fac:lastUpdated>
    <fac:locationReference xsi:type="loc:PointLocation">
      <loc:_locationReferenceExtension><loc:facilityLocation><locx:address>${address}</locx:address></loc:facilityLocation></loc:_locationReferenceExtension>
      <loc:coordinatesForDisplay><loc:latitude>${lat}</loc:latitude><loc:longitude>${lon}</loc:longitude></loc:coordinatesForDisplay>
    </fac:locationReference>
    <egi:energyInfrastructureStation id="${id}_1" version="">
      <egi:refillPoint id="p1"><fac:name><com:values><com:value lang="es">ES*X*1</com:value></com:values></fac:name>
        <egi:connector><egi:connectorType>iec62196T2</egi:connectorType><egi:maxPowerAtSocket>22000.0</egi:maxPowerAtSocket></egi:connector>
      </egi:refillPoint>
    </egi:energyInfrastructureStation>
  </egi:energyInfrastructureSite>`;
const doc = (sites: string) =>
  Buffer.from(
    `<?xml version="1.0"?><d2:payload xmlns:d2="x"><com:publicationTime>2026-10-23T10:16:28.845+02:00</com:publicationTime><egi:energyInfrastructureTable id="ELECTROLINERAS">${sites}</egi:energyInfrastructureTable></d2:payload>`,
  );
const line = (t: string) =>
  `<locx:addressLine><locx:text><com:values><com:value lang="es">${t}</com:value></com:values></locx:text></locx:addressLine>`;

describe('puntos-recarga adapter', () => {
  it('makes one request and normalizes the recorded response', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    const fs = out.collection.features;
    expect(fs).toHaveLength(24);
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, PAD)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(out.publishedAt).toBe('2026-10-23T08:16:28.845Z');
  });

  it('keeps only Galician sites (Asturias in the bbox and Alicante "3690" are dropped)', async () => {
    const { out } = await run();
    const ids = out.collection.features.map((f) => f.id);
    expect(ids).not.toContain('2023002167'); // Tapia de Casariego
    expect(ids).not.toContain('2023002207'); // Castropol
    expect(ids).not.toContain('2024000695'); // Sant Vicent del Raspeig, postcode 3690
  });

  it('reads name, operator, points, power and connectors of a site', async () => {
    const { out } = await run();
    const odeon = out.collection.features.find((f) => f.id === 'TI2V9GLJARAHFYV2Q9JT');
    expect(odeon?.properties).toMatchObject({
      nome: 'Centro Comercial Odeón',
      puntos: 26,
      potencia_max_kw: 150,
      conectores: 'CCS2, CHAdeMO, Tipo 2',
      actualizado: '2025-09-03T15:47:54.000Z',
    });
    expect(typeof odeon?.properties.operador).toBe('string');
    const outeiro = out.collection.features.find((f) => f.id === '2023004105');
    expect(outeiro?.properties).toMatchObject({ puntos: 10, potencia_max_kw: 180 });
  });

  it('reads a gzip body and tiny chunks the same way', async () => {
    const plain = await readFile(fixture);
    const a = await adapter.normalize(plain, fixtureContext(layer, []));
    const b = await adapter.normalize(gzipSync(plain), fixtureContext(layer, []));
    expect(b).toEqual(a);
    const ids: string[] = [];
    const { sites } = await scanSites(textChunks(plain, 7), (xml) => {
      const s = parseSite(xml);
      if (s?.galicia) ids.push(s.id);
    });
    expect(sites).toBe(27);
    expect(ids).toEqual(a.collection.features.map((f) => f.id));
  });

  it('falls back to a 5-digit postcode only when there is no region line', async () => {
    const ok = parseSite(
      site('1', `<locx:postcode>36001</locx:postcode>${line('Municipio: Pontevedra')}`),
    );
    expect(ok).toMatchObject({ galicia: true, concello: 'Pontevedra', nome: 'Sitio 1 & cía' });
    expect(parseSite(site('2', '<locx:postcode>3690</locx:postcode>'))?.galicia).toBe(false);
    expect(
      parseSite(
        site('3', `<locx:postcode>36001</locx:postcode>${line('Comunidad Autónoma: Asturias')}`),
      )?.galicia,
    ).toBe(false);
    expect(parseSite(site('4', line('Comunidad Autónoma: Galicia'), Number.NaN, -8))).toBeNull();
  });

  it('drops Galician sites whose coordinates fall outside Galicia', async () => {
    const out = await adapter.normalize(
      doc(
        site('1', line('Comunidad Autónoma: Galicia')) +
          site('2', line('Comunidad Autónoma: Galicia'), 40.4, -3.7),
      ),
      fixtureContext(layer, []),
    );
    expect(out.collection.features.map((f) => f.id)).toEqual(['1']);
    expect(out.collection.features[0]?.properties).toMatchObject({
      puntos: 1,
      potencia_max_kw: 22,
      conectores: 'Tipo 2',
      operador: null,
    });
  });

  it('throws on malformed responses and returns 0 features for an empty table', async () => {
    const ctx = fixtureContext(layer, []);
    await expect(adapter.normalize(Buffer.alloc(0), ctx)).rejects.toThrow();
    await expect(
      adapter.normalize(Buffer.from('<html>Service unavailable</html>'), ctx),
    ).rejects.toThrow();
    await expect(
      adapter.normalize(
        Buffer.from('<egi:energyInfrastructureTable></egi:energyInfrastructureTable>'),
        ctx,
      ),
    ).rejects.toThrow(/publicationTime/);
    const empty = await adapter.normalize(doc(''), ctx);
    expect(empty.collection.features).toHaveLength(0);
    expect(empty.publishedAt).toBe('2026-10-23T08:16:28.845Z');
  });
});
