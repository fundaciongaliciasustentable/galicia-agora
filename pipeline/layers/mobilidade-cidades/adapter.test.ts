import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { municipalZones } from '../../lib/mitma.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, {
  CITIES,
  DAYS,
  meanHourly,
  peakPresence,
  ringFlows,
  ringZones,
} from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real files: Galician rows of the MITMA zoning and population, the Galician zone centroids,
// and the rows of 21 May 2025 that touch Lugo between 07:00 and 09:59 (plus the first national
// rows, which must be dropped). Every reference day is served the same excerpt.
const ctx = () =>
  fixtureContext(layer, [
    { match: 'relacion_ine_zonificacionMitma.csv', file: fx('relacion_ine_zonificacionMitma.csv') },
    { match: 'zonificacion/poblacion.csv', file: fx('poblacion.csv') },
    { match: 'centroides.shp', file: fx('centroides.shp') },
    { match: 'centroides.dbf', file: fx('centroides.dbf') },
    {
      match: '_Viajes_municipios.csv.gz',
      file: fx('20250521_Viajes_municipios_lugo_07-09.csv.gz'),
    },
  ]);

describe('mobilidade-cidades adapter', () => {
  it('builds every ring from whole MITMA zones', async () => {
    const { zoneOf, members } = municipalZones(
      await readFile(fx('relacion_ine_zonificacionMitma.csv'), 'utf8'),
    );
    expect(zoneOf.size).toBe(313);
    for (const c of CITIES) {
      expect(c.anel1).toContain(c.codigo_ine);
      expect(() => ringZones(c.anel1, zoneOf, members)).not.toThrow();
    }
    // San Cibrao das Viñas shares a zone with A Merca: a ring with only one of them is refused.
    expect(() => ringZones(['32054', '32075'], zoneOf, members)).toThrow(/mixes concellos/);
  });

  it('matches an independent count for Lugo on 21 May 2025', async () => {
    const c = ctx();
    const raw = await adapter.fetch(c);
    // Zoning, population, two centroid files and the eight reference days.
    expect(c.requested).toHaveLength(4 + DAYS.mercores.length + DAYS.domingo.length);
    expect(c.requested).toContain(
      'https://movilidad-opendata.mitma.es/estudios_basicos/por-municipios/viajes/ficheros-diarios/2025-06/20250601_Viajes_municipios.csv.gz',
    );
    const { collection } = await adapter.normalize(raw, c);
    expect(collection.features).toHaveLength(7);
    for (const f of collection.features)
      expect(validateWithSchema(schema, f.properties)).toEqual([]);

    const lugo = collection.features.find((f) => f.properties.codigo_ine === '27028');
    const ring = lugo?.properties.anel0 as {
      residentes: number;
      mercores: Record<string, number[]>;
    };
    // Same rows summed independently in Python from the raw file: entries 3537.041, 4771.49,
    // 3685.403; exits 2940.764, 3733.435, 3236.21; internal 11685.466, 20106.541, 18318.824.
    expect(ring.mercores.entradas?.slice(7, 10)).toEqual([3537, 4771, 3685]);
    expect(ring.mercores.saidas?.slice(7, 10)).toEqual([2941, 3733, 3236]);
    expect(ring.mercores.internas?.slice(7, 10)).toEqual([11685, 20107, 18319]);
    expect(ring.mercores.entradas?.[6]).toBe(0);
    expect(ring.residentes).toBe(97613);
    // Lugo's urban area is the concello itself.
    expect(lugo?.properties.residentes_anel1).toBe(97613);

    // The point is MITMA's centroid of the concello, inside Lugo.
    const [lon, lat] = (lugo?.geometry?.coordinates ?? []) as number[];
    expect(lon).toBeGreaterThan(-7.75);
    expect(lon).toBeLessThan(-7.35);
    expect(lat).toBeGreaterThan(42.9);
    expect(lat).toBeLessThan(43.15);
  });

  it('averages days and finds the peak running balance', () => {
    const day = (e: number, s: number) => ({
      entradas: Array.from({ length: 24 }, (_, h) => (h === 8 ? e : 0)),
      saidas: Array.from({ length: 24 }, (_, h) => (h === 14 ? s : 0)),
      internas: Array(24).fill(0),
    });
    const m = meanHourly([day(10, 4), day(21, 6)]);
    expect(m.entradas[8]).toBe(16); // 15.5 rounds up
    expect(peakPresence(m)).toBe(16);
    // A city that empties in the morning never shows a negative presence.
    expect(
      peakPresence({
        entradas: Array(24).fill(0),
        saidas: Array(24).fill(5),
        internas: Array(24).fill(0),
      }),
    ).toBe(0);
  });

  it('splits flows into entries, exits and internal trips', () => {
    const h = ringFlows(
      [
        ['8|a|b', 5],
        ['8|x|a', 3],
        ['9|a|x', 2],
        ['9|x|x', 7],
      ],
      new Set(['a', 'b']),
    );
    expect(h.internas[8]).toBe(5);
    expect(h.entradas[8]).toBe(3);
    expect(h.saidas[9]).toBe(2);
  });
});
