import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fixture = join(dir, 'fixtures', 'content.xml');
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [{ match: 'radares/content.xml', file: fixture }];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

describe('trafico-radares adapter', () => {
  it('makes one request and keeps Galician cabins and sections', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    expect(out.publishedAt).toBe('2025-12-18T08:56:52.406Z');
    const fs = out.collection.features;
    expect(fs.map((f) => f.id)).toEqual([
      'CABINACINEMOMETRO_120060',
      'CABINACINEMOMETRO_120062',
      'CABINACINEMOMETRO_120079',
      'CABINACINEMOMETRO_166669',
      'CVM_161420',
      'CVM_164230',
    ]);
    for (const f of fs) expect(validateWithSchema(schema, f.properties)).toEqual([]);
  });

  it('reads a cabin as a point', async () => {
    const { out } = await run();
    const c = out.collection.features.find((f) => f.id === 'CABINACINEMOMETRO_120060');
    expect(c?.geometry?.type).toBe('Point');
    expect(c?.properties).toMatchObject({
      tipo: 'cabina',
      estrada: 'A-6',
      pk: 470.054,
      pk_fin: null,
      sentido: 'crecente',
      provincia: 'Lugo',
    });
  });

  it('reads a section as a from→to line, also when it crosses into Asturias', async () => {
    const { out } = await run();
    const t = out.collection.features.find((f) => f.id === 'CVM_164230');
    expect(t?.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [-7.02694, 43.54311],
        [-7.04189, 43.54287],
      ],
    });
    expect(t?.properties).toMatchObject({
      tipo: 'tramo',
      estrada: 'A-8',
      pk: 505.09,
      pk_fin: 506.28,
      cara_a: 'BAAMONDE',
      provincia: 'Asturias / Lugo',
    });
  });

  it('reads gzip bodies the same way and throws on bad responses', async () => {
    const plain = await readFile(fixture);
    const ctx = fixtureContext(layer, []);
    expect(await adapter.normalize(gzipSync(plain), ctx)).toEqual(
      await adapter.normalize(plain, ctx),
    );
    await expect(adapter.normalize(Buffer.alloc(0), ctx)).rejects.toThrow();
    await expect(adapter.normalize(Buffer.from('<html>Error</html>'), ctx)).rejects.toThrow();
  });
});
