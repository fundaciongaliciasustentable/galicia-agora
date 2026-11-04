import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef, PublishedLayer } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { acquired } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real rows of the 2025 FIRMS archives for Spain (S-NPP and MODIS), recorded on 1/11/2026:
// 40 August vegetation detections inside Quiroga, Monterrei or Ponteareas per product, plus
// rows inside the Galicia box but outside those concellos, outside the season (January), or not type 0.
// The concellos are the published polygons of those three.
async function concellos(): Promise<PublishedLayer> {
  return {
    collection: JSON.parse(await readFile(fx('concellos-parroquias.geojson'), 'utf8')),
    meta: JSON.parse(await readFile(fx('concellos-parroquias.meta.json'), 'utf8')),
  };
}

describe('focos-tempada-2025 adapter', () => {
  it('keeps vegetation fires of the season inside a concello, in time order', async () => {
    const c = fixtureContext(layer, [
      { match: 'viirs-snpp_2025_Spain.csv', file: fx('viirs-snpp_2025_Spain.csv') },
      { match: 'modis_2025_Spain.csv', file: fx('modis_2025_Spain.csv') },
    ]);
    c.readLayer = async (id) => {
      expect(id).toBe('concellos-parroquias');
      return concellos();
    };
    const raw = await adapter.fetch(c);
    const { collection } = await adapter.normalize(raw, c);
    expect(collection.features).toHaveLength(80);
    const props = collection.features.map((f) => f.properties);
    for (const p of props) {
      expect(validateWithSchema(schema, p)).toEqual([]);
      expect(String(p.instante).startsWith('2025-08')).toBe(true);
      expect(['27050', '32050', '36042']).toContain(p.codigo_ine);
    }
    const times = props.map((p) => String(p.instante));
    expect(times).toEqual([...times].sort());
    expect(new Set(props.map((p) => p.produto))).toEqual(new Set(['VIIRS S-NPP', 'MODIS']));
  });

  it('reads FIRMS times as UTC', () => {
    expect(acquired('2025-08-15', '142')).toBe('2025-08-15T01:42:00Z');
    expect(acquired('2025-08-15', '1319')).toBe('2025-08-15T13:19:00Z');
  });
});
