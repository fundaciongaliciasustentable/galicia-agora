// Build the PNOA orthophoto layer outside the scheduled ingest (it takes
// ~210,000 tile requests). Used by .github/workflows/ortofoto.yml; also runs
// locally on a small area with --bbox.
//
//   tsx pipeline/layers/ortofoto-pnoa/build.ts plan    --mask=<concellos.geojson> [--zooms=6-16] [--bbox=w,s,e,n]
//   tsx pipeline/layers/ortofoto-pnoa/build.ts fetch   --mask=… --cache=<dir> [--minutes=N] [--rate=9] [--format=webp|jpeg]
//   tsx pipeline/layers/ortofoto-pnoa/build.ts pack    --mask=… --cache=<dir> --out=<dir> [--limit-mb=1900]
//   tsx pipeline/layers/ortofoto-pnoa/build.ts flights --mask=… --out=<dir>
//   tsx pipeline/layers/ortofoto-pnoa/build.ts publish --index=<archives.json> --data-out=<dir>
//
// `pack` writes only the archives whose tiles are all in the cache, plus
// <out>/archives.json listing them. `publish` copies that index into the data
// branch folder and writes meta.json with the ingest failure policy (publish.ts).

import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LayerDef } from '../../lib/adapter.ts';
import { fetchWithRetry } from '../../lib/http.ts';
import { decide, readMeta, writeAtomic } from '../../lib/publish.ts';
import type { Bbox, Tile } from '../../lib/raster.ts';
import { loadYaml } from '../../lib/schemas.ts';
import { EXT, fetchTiles, type TileFormat, tilePath, tileState } from './fetch.ts';
import { type ArchiveInfo, DEFAULT_GROUPS, packGroup, planGroups, splitGroups } from './pack.ts';
import { coverTiles, polygonsOf, type Rings, tileBounds } from './tiles.ts';

export const LAYER_ID = 'ortofoto-pnoa';
export const WMTS_LAYER = 'OI.OrthoimageCoverage';
export const TILE_URL =
  'https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  `&LAYER=${WMTS_LAYER}&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=GoogleMapsCompatible` +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
/** Per-pixel flight date and resolution of the mosaic (GetFeatureInfo). */
export const MOSAIC_WMS = 'https://www.ign.es/wms-inspire/pnoa-ma';

const MINZOOM = 6;
const MAXZOOM = 16;

export interface ArchivesIndex {
  layer_id: string;
  source: string;
  format: TileFormat;
  quality: number | null;
  built_at: string;
  flights: Record<string, number> | null;
  archives: ArchiveInfo[];
}

function arg(name: string, fallback?: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const v = hit?.split('=').slice(1).join('=') ?? fallback;
  if (v === undefined) throw new Error(`missing --${name}=`);
  return v;
}

function zooms(): [number, number] {
  const [a, b] = arg('zooms', `${MINZOOM}-${MAXZOOM}`).split('-').map(Number);
  return [a ?? MINZOOM, b ?? a ?? MAXZOOM];
}

function bboxArg(): Bbox | null {
  const v = process.argv.find((a) => a.startsWith('--bbox='));
  if (!v) return null;
  const [west, south, east, north] = v.slice(7).split(',').map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return { west, south, east, north };
}

export function intersects(a: Bbox, b: Bbox): boolean {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
}

function concellos(): Rings[] {
  const fc = JSON.parse(readFileSync(arg('mask'), 'utf8'));
  const polys = polygonsOf(fc, ['nivel', 'concello']);
  if (polys.length < 300)
    throw new Error(`mask has ${polys.length} concello polygons; expected ~313`);
  return polys;
}

/** The tile list: everything touching Galicia, optionally only inside --bbox (local tests). */
export function planTiles(polys: Rings[], z0: number, z1: number, bbox: Bbox | null): Tile[] {
  const all = coverTiles(polys, z0, z1, 1);
  return bbox ? all.filter((t) => intersects(tileBounds(t), bbox)) : all;
}

function countByZoom(tiles: Tile[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const t of tiles) out[t.z] = (out[t.z] ?? 0) + 1;
  return out;
}

function ghOutput(pairs: Record<string, string | number | boolean>) {
  const f = process.env.GITHUB_OUTPUT;
  if (!f) return;
  for (const [k, v] of Object.entries(pairs)) appendFileSync(f, `${k}=${v}\n`);
}

async function cmdPlan() {
  const [z0, z1] = zooms();
  const tiles = planTiles(concellos(), z0, z1, bboxArg());
  console.log(JSON.stringify({ total: tiles.length, byZoom: countByZoom(tiles) }));
}

async function cmdFetch() {
  const [z0, z1] = zooms();
  const tiles = planTiles(concellos(), z0, z1, bboxArg());
  const minutes = Number(arg('minutes', '0'));
  const format = arg('format', 'webp') as TileFormat;
  const stats = await fetchTiles({
    tiles,
    cache: arg('cache'),
    tileUrl: TILE_URL,
    get: (url, o) => fetchWithRetry(url, o),
    format,
    quality: Number(arg('quality', '75')),
    perSecond: Number(arg('rate', '9')),
    concurrency: Number(arg('concurrency', '6')),
    deadline: minutes > 0 ? Date.now() + minutes * 60_000 : undefined,
    log: (l) => console.log(l),
    logEvery: 2000,
  });
  console.log(JSON.stringify(stats));
  if (stats.fetched) {
    console.log(
      `in ${(stats.bytesIn / stats.fetched / 1024).toFixed(1)} KB/tile JPEG, out ${(stats.bytesOut / stats.fetched / 1024).toFixed(1)} KB/tile ${format}`,
    );
  }
  ghOutput({ complete: stats.complete, remaining: stats.remaining, failed: stats.failed });
  if (stats.aborted && stats.aborted !== 'time budget used') process.exitCode = 1;
}

async function cmdPack() {
  const [z0, z1] = zooms();
  const cache = arg('cache');
  const outDir = arg('out');
  const format = arg('format', 'webp') as TileFormat;
  const limit = Number(arg('limit-mb', '1900')) * 1e6;
  const layer = await loadYaml<LayerDef>(join('pipeline/layers', LAYER_ID, 'layer.yaml'));
  const tiles = planTiles(concellos(), z0, z1, bboxArg());
  mkdirSync(outDir, { recursive: true });

  const ranges = DEFAULT_GROUPS.map(([a, b]): [number, number] => [
    Math.max(a, z0),
    Math.min(b, z1),
  ]).filter(([a, b]) => a <= b);
  const complete = planGroups(tiles, ranges).filter((g) => {
    const todo = g.tiles.filter((t) => tileState(cache, t, format) === 'todo').length;
    if (todo) console.log(`${g.name}: ${todo} of ${g.tiles.length} tiles not fetched yet, skipped`);
    return todo === 0;
  });
  const size = (t: Tile) => {
    try {
      return readFileSync(tilePath(cache, t, EXT[format])).length;
    } catch {
      return 0;
    }
  };
  const archives: ArchiveInfo[] = [];
  for (const g of splitGroups(complete, size, limit)) {
    const tmp = join(outDir, `${g.name}.pmtiles`);
    const info = packGroup(g, {
      cache,
      format,
      out: tmp,
      meta: {
        name: `${LAYER_ID} ${g.name}`,
        attribution: layer.attribution,
        description:
          'Obra derivada de PNOA máxima actualidad CC BY 4.0 scne.es (IGN, WMTS pnoa-ma, OI.OrthoimageCoverage), ' +
          `teselas recodificadas a ${format}, Galicia`,
      },
    });
    // Content-addressed names: a rebuilt archive never shares a URL (and a browser cache) with the old one.
    const file = `${g.name}.${info.sha256.slice(0, 12)}.pmtiles`;
    renameSync(tmp, join(outDir, file));
    info.file = file;
    if (info.bytes > limit) throw new Error(`${file} is ${info.bytes} bytes, over the limit`);
    console.log(
      `${file}: z${info.minzoom}–${info.maxzoom}, ${info.tiles} tiles, ${(info.bytes / 1e6).toFixed(1)} MB`,
    );
    archives.push(info);
  }
  let flights: Record<string, number> | null = null;
  try {
    flights = JSON.parse(readFileSync(join(outDir, 'flights.json'), 'utf8')).dates;
  } catch {}
  const index: ArchivesIndex = {
    layer_id: LAYER_ID,
    source: TILE_URL,
    format,
    quality: format === 'webp' ? Number(arg('quality', '75')) : null,
    built_at: new Date().toISOString(),
    flights,
    archives,
  };
  writeFileSync(join(outDir, 'archives.json'), `${JSON.stringify(index, null, 2)}\n`);
  ghOutput({ archives: archives.length, files: archives.map((a) => a.file).join(' ') });
}

/** Point-in-polygon (even-odd over all rings of one polygon). */
function inside(lon: number, lat: number, poly: Rings): boolean {
  let c = false;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as [number, number];
      const [xj, yj] = ring[j] as [number, number];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

/** Flight month and resolution on a 0.2° grid over Galicia: one request per second. */
async function cmdFlights() {
  const polys = concellos();
  const dates: Record<string, number> = {};
  const resolution: Record<string, number> = {};
  for (let lat = 41.85; lat < 43.8; lat += 0.2) {
    for (let lon = -9.3; lon < -6.7; lon += 0.2) {
      if (!polys.some((p) => inside(lon, lat, p))) continue;
      const d = 0.001;
      const url =
        `${MOSAIC_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=OI.MosaicElement` +
        '&QUERY_LAYERS=OI.MosaicElement&STYLES=&CRS=EPSG:4326' +
        `&BBOX=${lat - d},${lon - d},${lat + d},${lon + d}&WIDTH=3&HEIGHT=3&I=1&J=1&INFO_FORMAT=text/plain&FORMAT=image/png`;
      try {
        const text = (await fetchWithRetry(url, { timeoutMs: 30_000 })).body.toString('utf8');
        const f = /FECHA = '([^']*)'/.exec(text)?.[1] ?? 'unknown';
        const r = /RESOLUCION = '([^']*)'/.exec(text)?.[1] ?? 'unknown';
        dates[f] = (dates[f] ?? 0) + 1;
        resolution[r] = (resolution[r] ?? 0) + 1;
      } catch (err) {
        console.log(`flights: ${lon.toFixed(2)},${lat.toFixed(2)}: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const outDir = arg('out');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'flights.json'),
    `${JSON.stringify({ dates, resolution }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ dates, resolution }));
}

/** Copy the index to the data branch folder and write meta.json (failure policy of publish.ts). */
async function cmdPublish() {
  const index = JSON.parse(readFileSync(arg('index'), 'utf8')) as ArchivesIndex;
  const dir = join(arg('data-out'), LAYER_ID);
  const layer = await loadYaml<LayerDef>(join('pipeline/layers', LAYER_ID, 'layer.yaml'));
  const prev = await readMeta(join(dir, 'meta.json'));
  // Checksum over the archive list only, so rebuilding identical archives is not a change.
  const body = JSON.stringify(index.archives);
  const tiles = index.archives.reduce((s, a) => s + a.tiles, 0);
  const decision = decide(
    {
      layerId: LAYER_ID,
      at: new Date(),
      sourceUrl: layer.source_url,
      licence: layer.licence.spdx ?? layer.licence.text_url,
      attribution: layer.attribution,
      data: { body, featureCount: tiles, publishedAt: null },
      ...(index.archives.length ? {} : { error: 'no complete archive' }),
    },
    prev,
  );
  if (decision.write)
    await writeAtomic(join(dir, 'archives.json'), `${JSON.stringify(index, null, 2)}\n`);
  await writeAtomic(join(dir, 'meta.json'), `${JSON.stringify(decision.meta, null, 2)}\n`);
  console.log(
    `${LAYER_ID}: ${decision.meta.status} · ${decision.meta.feature_count} tiles${decision.write ? '' : ` · kept last good · ${decision.meta.last_error}`}`,
  );
  ghOutput({ accepted: decision.write });
}

const commands: Record<string, () => Promise<void>> = {
  plan: cmdPlan,
  fetch: cmdFetch,
  pack: cmdPack,
  flights: cmdFlights,
  publish: cmdPublish,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = commands[process.argv[2] ?? ''];
  if (!cmd) {
    console.error(`usage: build.ts ${Object.keys(commands).join('|')} …`);
    process.exit(2);
  }
  await cmd();
}
