import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import type { Placemark } from '../centros-saude/sergas.ts';
import adapter, { isDuplicate, metres } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [
  {
    match: 'SIXSAN_WEB_KML/MapServer/KmlServer',
    file: join(dir, 'fixtures', 'kmlserver-trimmed.kmz'),
  },
];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

const pm = (nome: string, concello: string, lon: number, lat: number): Placemark => ({
  name: nome,
  lon,
  lat,
  fields: { NOMBRE: nome, CONCELLO: concello },
});

describe('hospitais adapter', () => {
  it('makes one request and drops complex points that repeat a building', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    expect(out.publishedAt).toBeNull();
    const fs = out.collection.features;
    // 4 buildings + 3 complex points, all three duplicates (two by place, one by name).
    expect(fs.map((f) => f.properties.nome).sort()).toEqual([
      'C. ESP. AMB. CONCEPCION ARENAL',
      'HOSPITAL HM MODELO',
      'HOSPITAL SAN RAFAEL',
      'HOSPITAL UNIVERSITARIO A CORUÑA',
    ]);
    expect(new Set(fs.map((f) => f.id)).size).toBe(fs.length);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
  });

  it('keeps type and complex and drops the phone', async () => {
    const { out } = await run();
    const chuac = out.collection.features.find(
      (f) => f.id === 'hospital-universitario-a-coruna-coruna',
    );
    expect(chuac?.properties).toMatchObject({
      tipo: 'HOSPITAIS XERAIS',
      complexo: 'COMPLEXO HOSPITALARIO UNIVERSITARIO A CORUÑA',
      concello: 'A Coruña',
      codigo_ine: '15030',
    });
    expect(JSON.stringify(out.collection)).not.toMatch(/TELEFONO|9\d{8}/);
  });

  it('treats near points in the same concello, or equal names, as duplicates', () => {
    const kept = [pm('HOSPITAL X', 'VIGO', -8.7, 42.2)];
    // ~110 m north, other name: duplicate.
    expect(isDuplicate(pm('COMPLEXO X', 'VIGO', -8.7, 42.201), kept)).toBe(true);
    // ~330 m away, other name: kept.
    expect(isDuplicate(pm('COMPLEXO Y', 'VIGO', -8.7, 42.203), kept)).toBe(false);
    // Same name, far away, same concello: duplicate.
    expect(isDuplicate(pm('Hospital X', 'VIGO', -8.6, 42.25), kept)).toBe(true);
    // Near but in another concello: kept.
    expect(isDuplicate(pm('COMPLEXO Z', 'REDONDELA', -8.7, 42.2005), kept)).toBe(false);
    expect(metres(pm('a', 'b', -8.7, 42.2), pm('a', 'b', -8.7, 42.201))).toBeCloseTo(111, 0);
  });
});
