import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { REFERENCE_DAYS, zoneNames } from '../../lib/mitma.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { distanceKm, MIN_TRIPS, meanPairs } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
// Zoning, centroids and the day excerpt are shared with mobilidade-cidades (real files: the
// rows of 21 May 2025 touching Lugo between 07:00 and 09:59). Names are this layer's own.
const shared = (f: string) => join(dir, '..', 'mobilidade-cidades', 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

const ctx = () =>
  fixtureContext(layer, [
    {
      match: 'relacion_ine_zonificacionMitma.csv',
      file: shared('relacion_ine_zonificacionMitma.csv'),
    },
    { match: 'nombres_municipios.csv', file: join(dir, 'fixtures', 'nombres_municipios.csv') },
    { match: 'centroides.shp', file: shared('centroides.shp') },
    { match: 'centroides.dbf', file: shared('centroides.dbf') },
    {
      match: '_Viajes_municipios.csv.gz',
      file: shared('20250521_Viajes_municipios_lugo_07-09.csv.gz'),
    },
  ]);

describe('mobilidade-fluxos adapter', () => {
  it('keeps the Galician pairs above the threshold, as an independent count does', async () => {
    const c = ctx();
    const raw = await adapter.fetch(c);
    expect(c.requested).toHaveLength(
      4 + REFERENCE_DAYS.mercores.length + REFERENCE_DAYS.domingo.length,
    );
    const { collection } = await adapter.normalize(raw, c);
    // Python on the same excerpt: 258 Galician pairs (o ≠ d), 71 with at least 50 trips.
    expect(collection.features).toHaveLength(71);
    for (const f of collection.features) {
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
      expect(f.properties.orixe).not.toBe(f.properties.destino);
      expect(f.properties.viaxes_mercores).toBeGreaterThanOrEqual(MIN_TRIPS);
    }
    const outeiro = collection.features.find((f) => f.id === '27039|27028')?.properties;
    // Outeiro de Rei → Lugo: 356.606, 658.513 and 455.846 trips at 07, 08 and 09 h.
    expect((outeiro?.mercores as number[] | undefined)?.slice(7, 10)).toEqual([357, 659, 456]);
    expect(outeiro?.nome_orixe).toBe('Outeiro de Rei');
    expect(outeiro?.nome_destino).toBe('Lugo');
    // Neighbouring concello: centroids about 11 km apart.
    expect(outeiro?.distancia_km).toBeGreaterThan(8);
    expect(outeiro?.distancia_km).toBeLessThan(15);
    // A grouped rural zone is named after its head concello and says it is a group.
    const grouped = collection.features.find((f) => f.id === '27014_AM|27028')?.properties;
    expect(grouped?.nome_orixe).toMatch(/ e arredores \(\d+ concellos\)$/);
  });

  it('names zones the way they are said', () => {
    const n = zoneNames(
      '|ID|name\n1|15030|Coruña, A\n2|32075_AM|San Cibrao das Viñas agregacion de municipios\n',
    );
    expect(n.get('15030')).toBe('A Coruña');
    expect(n.get('32075_AM')).toBe('San Cibrao das Viñas');
  });

  it('averages pairs over days and measures distances', () => {
    const m = meanPairs([
      [['8|a|b', 10]],
      [
        ['8|a|b', 20],
        ['9|b|a', 4],
      ],
    ]);
    expect(m.get('a|b')?.[8]).toBe(15);
    expect(m.get('b|a')?.[9]).toBe(2);
    // Santiago–A Coruña centroids are about 49 km apart.
    expect(distanceKm([-8.517, 42.911], [-8.423, 43.346])).toBeCloseTo(49, 0);
  });
});
