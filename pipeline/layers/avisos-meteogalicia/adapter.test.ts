import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { codigoIne, DETAIL_URL, NIVEL_URL, type Raw } from './adapter.ts';

const dir = 'pipeline/layers/avisos-meteogalicia';
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const schema = JSON.parse(await readFile(join(dir, 'properties.schema.json'), 'utf8'));
const niveisText = await readFile(fx('jsonConcellosNivelMax.json'), 'utf8');

type Niveis = {
  listaDiaConcellos: Array<{ listaNiveisMaximos: Array<{ idConcello: number; nivelMax: number }> }>;
};

/** The recorded response with Vigo at orange and Lugo at yellow. */
function niveisWithWarnings(): Niveis {
  const n = JSON.parse(niveisText) as Niveis;
  for (const c of n.listaDiaConcellos[0]?.listaNiveisMaximos ?? []) {
    if (c.idConcello === 36057) c.nivelMax = 2;
    if (c.idConcello === 27028) c.nivelMax = 1;
  }
  return n;
}

// Synthetic detail following the documented fields (no warning was active when recording).
const detail = {
  listaDiaConcellos: [
    {
      dia: 0,
      listaAvisosConcellos: [
        {
          idconcello: 36057,
          idNivel: 2,
          nomeConcello: 'Vigo',
          dataAviso: '2026-10-24T09:00:00',
          dataIni: '2026-10-24T12:00:00',
          dataFin: '2026-10-24T23:59:00',
          idTipoAlerta: 8,
          tipoalerta_gl: 'Refacho máximo de vento',
        },
        {
          idconcello: 36057,
          idNivel: 1,
          nomeConcello: 'Vigo',
          dataAviso: '2026-10-24T09:30:00',
          dataIni: '2026-10-24T08:00:00',
          dataFin: '2026-10-24T20:00:00',
          idTipoAlerta: 4,
        },
        {
          idconcello: 27028,
          idNivel: 1,
          nomeConcello: 'Lugo',
          dataAviso: '2026-10-24T09:00:00',
          dataIni: '2026-10-24T00:00:00',
          dataFin: '2026-10-24T10:00:00',
          idTipoAlerta: 5,
          tipoalerta_gl: 'Néboa',
        },
        { idconcello: 15030, idNivel: 0, nomeConcello: 'A Coruña', idTipoAlerta: 1 },
      ],
    },
    {
      dia: 1,
      listaAvisosConcellos: [
        { idconcello: 15030, idNivel: 3, idTipoAlerta: 10, dataAviso: '2026-10-24T09:00:00' },
      ],
    },
  ],
};

describe('avisos-meteogalicia adapter', () => {
  it('makes one request when no concello has a warning', async () => {
    const ctx = fixtureContext(layer, [
      { match: 'jsonConcellosNivelMax', file: fx('jsonConcellosNivelMax.json') },
    ]);
    const raw = await adapter.fetch(ctx);
    expect(ctx.requested).toEqual([NIVEL_URL]);
    expect(raw.avisos).toBeNull();

    const out = await adapter.normalize(raw, ctx);
    const fs = out.collection.features;
    expect(fs).toHaveLength(313);
    expect(new Set(fs.map((f) => f.properties.codigo_ine)).size).toBe(313);
    for (const f of fs) {
      expect(f.geometry).toBeNull();
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
    expect(fs[0]?.properties).toEqual({
      codigo_ine: '15001',
      nome: 'Abegondo',
      nivel: 0,
      nivel_txt: 'sen aviso',
      fenomenos: null,
      inicio: null,
      fin: null,
    });
    expect(out.publishedAt).toBeNull();
  });

  it('asks for the detail (second request) only when some concello is above 0', async () => {
    const tmpN = join(tmpdir(), 'avisos-mg-niveis.json');
    const tmpD = join(tmpdir(), 'avisos-mg-detail.json');
    await writeFile(tmpN, JSON.stringify(niveisWithWarnings()));
    await writeFile(tmpD, JSON.stringify(detail));
    const ctx = fixtureContext(layer, [
      { match: 'jsonConcellosNivelMax', file: tmpN },
      { match: 'jsonAvisosConcellos', file: tmpD },
    ]);
    const raw = await adapter.fetch(ctx);
    expect(ctx.requested).toEqual([NIVEL_URL, DETAIL_URL]);

    const out = await adapter.normalize(raw, ctx);
    const byCode = new Map(out.collection.features.map((f) => [f.id, f.properties]));
    expect(byCode.get('36057')).toEqual({
      codigo_ine: '36057',
      nome: 'Vigo',
      nivel: 2,
      nivel_txt: 'laranxa',
      fenomenos: 'Refacho máximo de vento, Precipitación 12 horas',
      inicio: '2026-10-24T06:00:00.000Z',
      fin: '2026-10-24T21:59:00.000Z',
    });
    expect(byCode.get('27028')).toMatchObject({
      nivel: 1,
      nivel_txt: 'amarelo',
      fenomenos: 'Néboa',
    });
    // Tomorrow's warnings do not change today's row.
    expect(byCode.get('15030')).toMatchObject({ nivel: 0, fenomenos: null });
    // Newest dataAviso (local time) of today's list.
    expect(out.publishedAt).toBe('2026-10-24T07:30:00.000Z');
    for (const f of out.collection.features) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
  });

  it('checks INE codes', () => {
    expect(codigoIne(36902)).toBe('36902');
    expect(() => codigoIne(28079)).toThrow();
    expect(() => codigoIne('1501')).toThrow();
  });

  it('rejects malformed or truncated responses', async () => {
    const ctx = fixtureContext(layer, []);
    const bad = (r: Raw) => () => adapter.normalize(r, ctx);
    expect(bad({ niveis: {}, avisos: null })).toThrow();
    expect(bad({ niveis: { listaDiaConcellos: [{ dia: 0 }] }, avisos: null })).toThrow();
    expect(
      bad({
        niveis: { listaDiaConcellos: [{ dia: 0, listaNiveisMaximos: [] }] },
        avisos: null,
      }),
    ).toThrow();
    const n = JSON.parse(niveisText) as Niveis;
    const first = n.listaDiaConcellos[0]?.listaNiveisMaximos[0];
    if (first) first.nivelMax = 7;
    expect(bad({ niveis: n, avisos: null })).toThrow();
    expect(bad({ niveis: JSON.parse(niveisText), avisos: { foo: 1 } })).toThrow();
  });

  it('accepts the recorded empty detail response', async () => {
    const empty = JSON.parse(await readFile(fx('jsonAvisosConcellos-dia-1-baleiro.json'), 'utf8'));
    const out = await adapter.normalize(
      { niveis: JSON.parse(niveisText), avisos: empty },
      fixtureContext(layer, []),
    );
    expect(out.collection.features).toHaveLength(313);
    expect(out.publishedAt).toBeNull();
  });
});
