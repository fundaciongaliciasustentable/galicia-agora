// Prepare site/public before `astro build`:
//   - copy the basemap PMTiles, glyph ranges and sprites (all self-hosted);
//   - generate light/dark basemap styles from @protomaps/basemaps;
//   - copy layer data and meta from data-out; convert large polygon layers to
//     PMTiles with tippecanoe; write a geometry-free table.json per layer for
//     the accessible table view;
//   - write the catalogue the client reads.
//
//   tsx site/scripts/prepare.ts

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { layers, namedFlavor } from '@protomaps/basemaps';

const DATA_OUT = process.env.DATA_OUT_DIR ?? 'data-out';
const BUILD = 'build';
const PUBLIC = 'site/public';
const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
// Latin, Latin Extended-A and General Punctuation cover Galician and Spanish.
const GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];
/** Layers above this size are served as PMTiles instead of GeoJSON. */
const TILE_THRESHOLD_BYTES = 1_000_000;

function log(msg: string) {
  console.log(`prepare: ${msg}`);
}

function basemap() {
  const src = join(BUILD, 'galicia.pmtiles');
  if (!existsSync(src)) {
    log('no build/galicia.pmtiles (run `make basemap`); the map will show data layers only');
    return false;
  }
  mkdirSync(join(PUBLIC, 'basemap'), { recursive: true });
  cpSync(src, join(PUBLIC, 'basemap', 'galicia.pmtiles'));
  for (const font of FONTS) {
    for (const range of GLYPH_RANGES) {
      const from = join(BUILD, 'assets', 'fonts', font, `${range}.pbf`);
      const to = join(PUBLIC, 'glyphs', font, `${range}.pbf`);
      mkdirSync(join(PUBLIC, 'glyphs', font), { recursive: true });
      if (existsSync(from)) cpSync(from, to);
    }
  }
  cpSync(join(BUILD, 'assets', 'fonts', 'OFL.txt'), join(PUBLIC, 'glyphs', 'OFL.txt'));
  mkdirSync(join(PUBLIC, 'sprites'), { recursive: true });
  for (const f of ['light', 'dark']) {
    for (const ext of ['.json', '.png', '@2x.json', '@2x.png']) {
      cpSync(
        join(BUILD, 'assets', 'sprites', 'v4', `${f}${ext}`),
        join(PUBLIC, 'sprites', `${f}${ext}`),
      );
    }
  }
  return true;
}

function styles(hasBasemap: boolean) {
  for (const flavor of ['light', 'dark'] as const) {
    const style = {
      version: 8,
      // Absolute URLs are filled in by the client (MapLibre needs them for glyphs).
      glyphs: '/glyphs/{fontstack}/{range}.pbf',
      sprite: `/sprites/${flavor}`,
      sources: hasBasemap
        ? {
            protomaps: {
              type: 'vector',
              url: 'pmtiles:///basemap/galicia.pmtiles',
              attribution: '© OpenStreetMap (ODbL) · Protomaps',
            },
          }
        : {},
      layers: hasBasemap
        ? layers('protomaps', namedFlavor(flavor), { lang: 'gl' })
        : [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': flavor === 'light' ? '#f5f5f0' : '#1f201c' },
            },
          ],
    };
    writeFileSync(join(PUBLIC, `style-${flavor}.json`), JSON.stringify(style));
  }
}

interface CatalogLayer {
  id: string;
  geometry: string;
  table: { fields: string[] };
  meta: unknown;
  tiles?: string;
}

function data() {
  const catalogPath = join(DATA_OUT, 'catalog.json');
  if (!existsSync(catalogPath)) {
    log(`no ${catalogPath}; run \`npm run ingest\` first`);
    return;
  }
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { layers: CatalogLayer[] };
  rmSync(join(PUBLIC, 'data'), { recursive: true, force: true });
  for (const layer of catalog.layers) {
    const srcDir = join(DATA_OUT, layer.id);
    const dstDir = join(PUBLIC, 'data', layer.id);
    if (!existsSync(join(srcDir, 'meta.json'))) continue;
    mkdirSync(dstDir, { recursive: true });
    cpSync(join(srcDir, 'meta.json'), join(dstDir, 'meta.json'));
    // Raster layers arrive as a ready PMTiles archive (pipeline/lib/raster.ts).
    if (layer.geometry === 'raster') {
      const archive = join(srcDir, 'data.pmtiles');
      if (!existsSync(archive)) continue;
      cpSync(archive, join(dstDir, 'data.pmtiles'));
      layer.tiles = `/data/${layer.id}/data.pmtiles`;
      log(`${layer.id}: raster PMTiles ${(statSync(archive).size / 1e6).toFixed(1)} MB`);
      continue;
    }
    const geojson = join(srcDir, 'data.geojson');
    if (!existsSync(geojson)) continue;
    cpSync(geojson, join(dstDir, 'data.geojson'));

    // Geometry-free rows for the accessible table view.
    const fc = JSON.parse(readFileSync(geojson, 'utf8')) as {
      features: Array<{ properties: Record<string, unknown> }>;
    };
    writeFileSync(join(dstDir, 'table.json'), JSON.stringify(fc.features.map((f) => f.properties)));

    if (layer.geometry !== 'none' && statSync(geojson).size > TILE_THRESHOLD_BYTES) {
      const out = join(dstDir, 'data.pmtiles');
      execFileSync(
        'tippecanoe',
        [
          '-o',
          out,
          '--force',
          '--quiet',
          '-l',
          layer.id,
          // Points keep full precision (z13) and every feature from z10;
          // -zg would stop at z7 (~76 m) for dense point layers.
          ...(layer.geometry === 'point'
            ? ['-z13', '--base-zoom=10', '--drop-densest-as-needed']
            : [
                '-zg',
                '--coalesce-densest-as-needed',
                '--detect-shared-borders',
                '--extend-zooms-if-still-dropping',
              ]),
          geojson,
        ],
        { stdio: 'inherit' },
      );
      layer.tiles = `/data/${layer.id}/data.pmtiles`;
      log(`${layer.id}: PMTiles ${(statSync(out).size / 1e6).toFixed(1)} MB`);
    }
  }
  writeFileSync(join(PUBLIC, 'data', 'catalog.json'), JSON.stringify(catalog));
  log(`${catalog.layers.length} layers copied`);
}

function maplibreWorker() {
  // MapLibre 6 loads its worker from a URL; serve it from this origin.
  mkdirSync(join(PUBLIC, 'maplibre'), { recursive: true });
  cpSync(
    'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
    join(PUBLIC, 'maplibre', 'maplibre-gl-worker.mjs'),
  );
}

maplibreWorker();
const hasBasemap = basemap();
styles(hasBasemap);
data();
