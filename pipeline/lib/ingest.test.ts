import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Adapter } from './adapter.ts';
import { madridToIso } from './adapter.ts';
import { runLayer } from './ingest.ts';

const LAYER_YAML = `
id: proba
title: { gl: Proba, es: Prueba }
source_url: https://example.org/feed
licence: { spdx: CC-BY-4.0, text_url: https://example.org/l, collection: odbl }
attribution: © Example
ingest: { every: PT10M }
`;

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'ga-ingest-'));
  const layersDir = join(root, 'layers');
  await mkdir(join(layersDir, 'proba'), { recursive: true });
  await writeFile(join(layersDir, 'proba', 'layer.yaml'), LAYER_YAML);
  return { layersDir, outDir: join(root, 'out') };
}

const good: Adapter<number> = {
  fetch: async () => 2,
  normalize: (n) => ({
    publishedAt: '2026-10-18T08:00:00.000Z',
    collection: {
      type: 'FeatureCollection',
      features: Array.from({ length: n }, (_, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-8 + i, 42] },
        properties: { i },
      })),
    },
  }),
};

describe('runLayer', () => {
  it('publishes a valid collection as fresh', async () => {
    const { layersDir, outDir } = await setup();
    const r = await runLayer('proba', { layersDir, outDir, adapter: good });
    expect(r.skipped).toBe(false);
    const meta = JSON.parse(await readFile(join(outDir, 'proba', 'meta.json'), 'utf8'));
    expect(meta.status).toBe('fresh');
    expect(meta.feature_count).toBe(2);
    expect(meta.published_at).toBe('2026-10-18T08:00:00.000Z');
  });

  it('skips a layer that is not due', async () => {
    const { layersDir, outDir } = await setup();
    const now = new Date('2026-10-18T08:00:00Z');
    await runLayer('proba', { layersDir, outDir, adapter: good, now });
    const r = await runLayer('proba', {
      layersDir,
      outDir,
      adapter: good,
      now: new Date('2026-10-18T08:05:00Z'),
    });
    expect(r.skipped).toBe(true);
  });

  it('marks stale and keeps data when the source throws (simulated failure)', async () => {
    const { layersDir, outDir } = await setup();
    await runLayer('proba', { layersDir, outDir, adapter: good });
    const failing: Adapter = {
      fetch: async () => {
        throw new Error('HTTP 503');
      },
      normalize: () => {
        throw new Error('unreachable');
      },
    };
    const r = await runLayer('proba', { layersDir, outDir, adapter: failing, force: true });
    expect(r.skipped).toBe(false);
    if (!r.skipped) expect(r.meta.status).toBe('stale');
    const data = JSON.parse(await readFile(join(outDir, 'proba', 'data.geojson'), 'utf8'));
    expect(data.features).toHaveLength(2);
  });

  it('rejects output that is not valid GeoJSON', async () => {
    const { layersDir, outDir } = await setup();
    const bad: Adapter = {
      fetch: async () => null,
      normalize: () => ({
        publishedAt: null,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
        collection: { type: 'FeatureCollection', features: [{ type: 'Nope' } as any] },
      }),
    };
    const r = await runLayer('proba', { layersDir, outDir, adapter: bad });
    if (!r.skipped) {
      expect(r.write).toBe(false);
      expect(r.meta.last_error).toMatch(/schema validation/);
    }
  });
});

describe('madridToIso', () => {
  it('handles summer and winter offsets', () => {
    expect(madridToIso('2026-10-18 09:00')).toBe('2026-10-18T07:00:00.000Z');
    expect(madridToIso('2026-12-01 09:00')).toBe('2026-12-01T08:00:00.000Z');
  });
});
