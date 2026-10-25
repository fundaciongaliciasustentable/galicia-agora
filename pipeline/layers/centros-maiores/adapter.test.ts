import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inGalicia, type LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  entidade,
  httpDateToIso,
  lastStats,
  PAD,
  ruepssLink,
  shortServizos,
  text,
  toFeatures,
  URL,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const LAST_MODIFIED = 'Mon, 05 Oct 2026 06:52:48 GMT';

function ctxWithHeaders() {
  const base = fixtureContext(layer, [
    { match: 'centros_maiores.kml', file: join(dir, 'fixtures', 'centros_maiores.kml') },
  ]);
  return {
    ...base,
    async get(url: string) {
      const res = await base.get(url);
      return { ...res, lastModified: LAST_MODIFIED };
    },
  };
}

async function run() {
  const ctx = ctxWithHeaders();
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('centros-maiores adapter', () => {
  it('makes one request and normalizes the recorded KML', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toEqual([URL]);
    const fs = out.collection.features;
    expect(fs).toHaveLength(13);
    expect(lastStats).toEqual({ placemarks: 13, dropped: 0 });
    for (const f of fs) {
      const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      expect(inGalicia(lon, lat, PAD)).toBe(true);
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
  });

  it('uses Last-Modified as publishedAt', async () => {
    const { out } = await run();
    expect(out.publishedAt).toBe('2026-10-05T06:52:48.000Z');
  });

  it('maps the properties and drops contact fields', async () => {
    const { out } = await run();
    const byId = new Map(out.collection.features.map((f) => [f.id, f]));
    const ribeira = byId.get('E0C83');
    expect(ribeira?.geometry?.coordinates).toEqual([-8.98858, 42.55286]);
    expect(ribeira?.properties).toMatchObject({
      id: 'E0C83',
      nome: 'RESIDENCIA DE MAIORES DE RIBEIRA',
      tipo: 'Residencia',
      iniciativa: 'publica',
      entidade: 'XUNTA DE GALICIA',
      concello: 'RIBEIRA',
      cp: '15960',
      ligazon_ruepss:
        'https://ruepss.xunta.gal/XiacWeb/centros/publico/aCentroPublico.do?%7BactionForm.id_cent%7D=5634',
    });
    expect(String(ribeira?.properties.servizos)).toMatch(/^animacion socio-cultural, .*…$/);
    expect(byId.get('E270C1')?.properties.iniciativa).toBe('social');
    expect(byId.get('E5431C1')?.properties).toMatchObject({
      iniciativa: 'privada',
      entidade: 'NAV&GER TOMIÑO SL',
      tipo: 'Miniresidencia',
    });
    expect(byId.get('E0C94')?.properties.tipo).toBe('Centro de día para persoas con alzhéimer');
    expect(byId.get('E569C1')?.properties.servizos).toBeNull();
    expect(byId.get('E0C154')?.properties.cp).toBeNull();
    const json = JSON.stringify(out.collection);
    expect(json).not.toMatch(/@|mailto|Telefono|telefono|Horario/);
  });

  it('keeps the owner only when it is an organisation', async () => {
    const { out } = await run();
    const byId = new Map(out.collection.features.map((f) => [f.id, f.properties]));
    expect(byId.get('E6166C1')?.entidade).toBeNull(); // natural person (redacted in fixture)
    expect(byId.get('E1764C1')?.entidade).toBeNull(); // SLNE name with a NIF
    expect(byId.get('E1030C1')?.entidade).toBe('CLUB DE XUBILADOS VIRXE DO CARME');
    expect(entidade('FUNDACION SAN ROSENDO')).toBe('FUNDACION SAN ROSENDO');
    expect(entidade('GERIATROS S.A.')).toBe('GERIATROS S.A.');
    expect(entidade('CASER RESIDENCIAL, S.A.U.')).toBe('CASER RESIDENCIAL, S.A.U.');
    expect(entidade('CENTRO DE DIA CANGAS S L')).toBe('CENTRO DE DIA CANGAS S L');
    expect(entidade('VITAIS SC')).toBe('VITAIS SC');
    expect(entidade('ADIANTE MOS S.COOP.GALEGA')).toBe('ADIANTE MOS S.COOP.GALEGA');
    expect(entidade('O TEMPO E NOSO SLL')).toBe('O TEMPO E NOSO SLL');
    expect(entidade('NOME APELIDO APELIDO')).toBeNull();
    expect(entidade('MARIA ROSA SANTOS')).toBeNull();
    expect(entidade('APELIDO NOME 000386481T, S.L.N.E.')).toBeNull();
    expect(entidade('')).toBeNull();
  });

  it('helpers', () => {
    expect(text(' <![CDATA[a &amp; b]]>&#13;\n c ')).toBe('a & b c');
    expect(shortServizos('a, b, c', 20)).toBe('a, b, c');
    expect(shortServizos('alfa, beta, gamma, delta', 15)).toBe('alfa, beta…');
    expect(shortServizos('')).toBeNull();
    expect(ruepssLink('https://ruepss.xunta.gal/x?{a}=1')).toBe(
      'https://ruepss.xunta.gal/x?%7Ba%7D=1',
    );
    expect(ruepssLink('http://example.org/')).toBeNull();
    expect(httpDateToIso(LAST_MODIFIED)).toBe('2026-10-05T06:52:48.000Z');
    expect(httpDateToIso(null)).toBeNull();
  });

  it('publishedAt is null without Last-Modified', async () => {
    const ctx = fixtureContext(layer, [
      { match: 'centros_maiores.kml', file: join(dir, 'fixtures', 'centros_maiores.kml') },
    ]);
    const out = await adapter.normalize(await adapter.fetch(ctx), ctx);
    expect(out.publishedAt).toBeNull();
  });

  it('drops placemarks outside Galicia and rejects malformed input', () => {
    const pm = (id: string, coords: string, ini = 'INICIATIVA PÚBLICA') =>
      `<Placemark id="${id}"><name>X</name><description>RESIDENCIA</description><ExtendedData>` +
      `<Data name="Iniciativa_entidade"><displayName>I</displayName><value>${ini}</value></Data>` +
      `</ExtendedData><Point><coordinates>${coords}</coordinates></Point></Placemark>`;
    const kml = (b: string) =>
      `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${b}</Document></kml>`;
    const r = toFeatures(kml(pm('a', '-8.5,42.9') + pm('b', '0,0') + pm('c', '')));
    expect(r.features.map((f) => f.id)).toEqual(['a']);
    expect(r.stats).toEqual({ placemarks: 3, dropped: 2 });
    expect(r.features[0]?.properties).toMatchObject({ entidade: null, cp: null, servizos: null });
    expect(() => toFeatures(kml(pm('a', '-8.5,42.9', 'OUTRA')))).toThrow(/Iniciativa/);
    expect(() => toFeatures('<html></html>')).toThrow(/KML/);
    expect(toFeatures(kml('')).features).toHaveLength(0);
  });
});
