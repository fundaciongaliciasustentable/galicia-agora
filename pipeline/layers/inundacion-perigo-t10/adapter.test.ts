import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GALICIA_BBOX, type LayerDef } from '../../lib/adapter.ts';
import { tilesInBbox } from '../../lib/raster.ts';
import { loadYaml } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import { create, WMTS_LAYER } from './adapter.ts';

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// A real tile with flood zones; every other tile gets the real blank PNG.
const routes = [
  { match: 'TILEMATRIX=12&TILEROW=1515&TILECOL=1958', file: fx('tile-t10-z12-x1958-y1515.png') },
  { match: 'REQUEST=GetTile', file: fx('tile-blank.png') },
];

describe(`${layer.id} adapter`, () => {
  it('requests every tile of the Galicia bbox from z6 to z13 and keeps only non-empty ones', async () => {
    const ctx = fixtureContext(layer, routes);
    const adapter = create({ delayMs: 0, logEvery: 0 });
    const raw = await adapter.fetch(ctx);
    expect(raw.requested).toBe(tilesInBbox(GALICIA_BBOX, 6, 13).length);
    expect(ctx.requested.length).toBe(raw.requested);
    expect(ctx.requested.every((u) => u.includes(`LAYER=${WMTS_LAYER}&`))).toBe(true);
    expect(ctx.requested.every((u) => u.includes('TILEMATRIXSET=GoogleMapsCompatible'))).toBe(true);
    expect(raw.tiles.map((t) => `${t.z}/${t.x}/${t.y}`)).toEqual(['12/1958/1515']);

    const out = await adapter.normalize(raw, ctx);
    expect(out.tileCount).toBe(1);
    // Fixtures carry no headers: no Last-Modified means no publication time.
    expect(out.publishedAt).toBeNull();
    expect(out.archive.subarray(0, 7).toString('latin1')).toBe('PMTiles');
  }, 60_000);

  it('declares a yearly raster layer with the ARPSI coverage note', () => {
    expect(layer.geometry).toBe('raster');
    expect(layer.output).toBe('pmtiles');
    expect(layer.ingest?.every).toBe('P365D');
    expect(layer.stale_after).toBe('P400D');
    const context = layer.context as Array<{ value: string; note: { gl: string; es: string } }>;
    expect(context[0]?.note.gl).toContain('non todos os ríos');
    expect(context[0]?.note.es).toContain('no todos los ríos');
  });
});
