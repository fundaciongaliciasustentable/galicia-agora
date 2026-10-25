import { copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef, PublishedLayer } from '../../lib/adapter.ts';
import { readPublishedLayer, runLayer } from '../../lib/ingest.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  classify,
  collectSites,
  Grid,
  haversineKm,
  INPUTS,
  inputsTime,
  type Raw,
  SERVICES,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const NOW = new Date('2026-10-25T12:00:00Z');

async function readFixture(id: string): Promise<PublishedLayer> {
  return {
    collection: JSON.parse(await readFile(fx(`${id}.geojson`), 'utf8')),
    meta: JSON.parse(await readFile(fx(`${id}.meta.json`), 'utf8')),
  };
}

function ctx() {
  return { ...fixtureContext(layer, [], { now: NOW }), readLayer: readFixture };
}

/** A data-out dir holding the fixture inputs as if they had been published. */
async function outDirWithInputs(): Promise<string> {
  const out = await mkdtemp(join(tmpdir(), 'ga-dist-'));
  for (const id of INPUTS) {
    await mkdir(join(out, id), { recursive: true });
    await copyFile(fx(`${id}.geojson`), join(out, id, 'data.geojson'));
    await copyFile(fx(`${id}.meta.json`), join(out, id, 'meta.json'));
  }
  return out;
}

describe('distancia-servizos adapter', () => {
  it('declares every input in depends_on', () => {
    expect(layer.depends_on).toEqual([...INPUTS]);
  });

  it('computes one row per entity, valid against the schema', async () => {
    const c = ctx();
    const out = await adapter.normalize(await adapter.fetch(c), c);
    const fs = out.collection.features;
    expect(fs).toHaveLength(41);
    expect(c.requested).toHaveLength(0);
    for (const f of fs) {
      expect(f.geometry?.type).toBe('Point');
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      for (const s of SERVICES) expect(typeof f.properties[`dist_${s}`]).toBe('number');
    }
    const peliceira = fs.find((f) => f.properties.nome === 'Peliceira');
    expect(peliceira?.properties).toMatchObject({
      codigo_ine: '27034',
      dist_centro_saude: 14,
      centro_saude_nome: 'CENTRO SAUDE NAVIA DE SUARNA',
    });
    // Places without population in the source keep null, not 0.
    expect(fs.some((f) => f.properties.poboacion === null)).toBe(true);
  });

  it('dates the layer with the newest input (published_at, else last good download)', async () => {
    const raw = {} as Raw;
    for (const id of INPUTS) raw[id] = await readFixture(id);
    // SERGAS and Educación give no published_at: their download times count.
    expect(inputsTime(raw)).toBe(raw['centros-educativos'].meta.last_success_at);
  });

  it('classifies services', () => {
    expect(classify('centros-saude', { tipo: 'pac' })).toEqual(['pac']);
    expect(
      classify('centros-educativos', { titularidade: 'publica', etapa: 'infantil_primaria' }),
    ).toEqual(['escola']);
    expect(
      classify('centros-educativos', { titularidade: 'publica', etapa: 'primaria_secundaria' }),
    ).toEqual(['escola', 'instituto']);
    expect(
      classify('centros-educativos', { titularidade: 'privada', etapa: 'secundaria' }),
    ).toEqual([]);
    expect(classify('centros-educativos', { titularidade: 'publica', etapa: null })).toEqual([]);
    expect(classify('centros-maiores', { tipo: 'Centro de día' })).toEqual(['centro_dia']);
    expect(classify('centros-maiores', { tipo: 'Residencia' })).toEqual([]);
  });

  it('haversine and grid agree with brute force', async () => {
    // Santiago (Obradoiro) to A Coruña (María Pita): about 56 km in a straight line.
    expect(haversineKm(-8.5446, 42.8806, -8.3966, 43.3707)).toBeCloseTo(55.8, 0);
    const raw = {} as Raw;
    for (const id of INPUTS) raw[id] = await readFixture(id);
    const sites = collectSites(raw);
    for (const s of SERVICES) {
      const g = new Grid(sites[s]);
      for (const f of raw['entidades-poboacion'].collection.features) {
        const [lon, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
        expect(g.nearest(lon, lat)?.km).toBe(g.bruteForce(lon, lat)?.km);
      }
    }
  });

  it('refuses to run without ctx.readLayer', async () => {
    await expect(adapter.fetch(fixtureContext(layer, []))).rejects.toThrow(/readLayer/);
  });

  it('runs through ingest reading the published inputs', async () => {
    const outDir = await outDirWithInputs();
    const r = await runLayer('distancia-servizos', { outDir, now: NOW, force: true });
    expect(r.skipped).toBe(false);
    if (!r.skipped) {
      expect(r.meta.status).toBe('fresh');
      expect(r.meta.feature_count).toBe(41);
    }
  });

  it('fails (keeps last good) when an input is stale or missing', async () => {
    const outDir = await outDirWithInputs();
    // centros-saude has stale_after P3D: four days later it is stale.
    const later = new Date('2026-10-29T12:00:00Z');
    const r = await runLayer('distancia-servizos', { outDir, now: later, force: true });
    if (!r.skipped) {
      expect(r.write).toBe(false);
      expect(r.meta.last_error).toMatch(/is stale/);
    }
    await expect(readPublishedLayer(layer, 'raios', outDir, NOW)).rejects.toThrow(/depends_on/);
    await expect(
      readPublishedLayer({ ...layer, depends_on: ['raios'] }, 'raios', outDir, NOW),
    ).rejects.toThrow(/no published data/);
  });
});
