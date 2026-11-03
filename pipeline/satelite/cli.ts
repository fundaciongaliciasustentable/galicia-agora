// Monthly Sentinel-2 mosaic of Galicia (layers satelite-mes and ndvi-mes).
//
//   tsx pipeline/satelite/cli.ts [--month=YYYY-MM] [--tiles=29TNH,29TNG] [--cache=<dir>]
//                                [--preview-only]
//
// Builds the month (default: the month before today, UTC) and, per layer:
//   <SATELITE_OUT_DIR>/<id>/<YYYY-MM>-<hash>.pmtiles  the archive, uploaded to the server by
//                                         the workflow (never committed to the data branch)
//   <DATA_OUT_DIR>/<id>/meta.json         status, as every layer (publish.ts policy)
//   <DATA_OUT_DIR>/<id>/archives.json     index in the ortofoto-pnoa format (ADR 0008): the
//                                         latest month in `archives`, the last 12 in `months`
//   <SATELITE_OUT_DIR>/upload.txt         "<id>/<file>" lines to upload
//   <DATA_OUT_DIR>/<id>/previews/*.webp   one whole-Galicia image per month (preview.ts),
//   <DATA_OUT_DIR>/<id>/previews.json     kept in the data branch, PREVIEW_MONTHS of them
//
// --preview-only builds the month for its image alone (past months for the fades of
// /pulso/respira/): no archive, no upload, meta.json and archives.json untouched.
//
// The clip outline is the IGN one in galicia-ign.geojson (outline.ts).
// The index is written only when the archive was accepted, and the workflow
// commits it only after the upload, so the site never points at a missing file.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchWithRetry } from '../lib/http.ts';
import { loadLayer } from '../lib/ingest.ts';
import { type Attempt, publish, writeAtomic } from '../lib/publish.ts';
import { writePmtiles } from '../lib/raster.ts';
import { buildMonth, type MonthBuild } from './build.ts';
import {
  addMonth,
  addPreview,
  archiveName,
  emptyIndex,
  type MonthIndex,
  type PreviewIndex,
} from './months.ts';
import { loadOutline } from './outline.ts';
import { previewImage } from './preview.ts';
import { previousMonth } from './stac.ts';

const DATA_OUT = process.env.DATA_OUT_DIR ?? 'data-out';
const SAT_OUT = process.env.SATELITE_OUT_DIR ?? 'satelite-out';
export const LAYERS = { truecolour: 'satelite-mes', ndvi: 'ndvi-mes' } as const;
/** Months with less than this share of Galicia covered are not published. */
const MAX_GAP_SHARE = 0.9;
const BBOX = { west: -9.35, south: 41.8, east: -6.7, north: 43.8 };
const MINZOOM = 8;
const MAXZOOM = 13;
/** Months kept on the server. */
export const KEEP_MONTHS = 12;
/** Monthly images kept in the data branch. */
export const PREVIEW_MONTHS = 24;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

/** Range GET with retries; with a cache directory, each range is kept on disk (local runs). */
function rangeGetter(cacheDir: string | undefined, counter: { bytes: number }) {
  return async (url: string, start: number, end: number): Promise<Buffer> => {
    const key = createHash('sha1').update(`${url}|${start}|${end}`).digest('hex');
    const file = cacheDir ? join(cacheDir, key) : '';
    if (cacheDir) {
      try {
        return await readFile(file);
      } catch {}
    }
    const res = await fetchWithRetry(url, {
      headers: { range: `bytes=${start}-${end}` },
      timeoutMs: 120_000,
      retries: 4,
    });
    // A server that ignores Range answers 200 with the whole file: keep the asked part.
    const body = res.status === 206 ? res.body : res.body.subarray(start, end + 1);
    counter.bytes += res.body.length;
    if (cacheDir) await writeFile(file, body);
    return body;
  };
}

async function readIndex(id: string): Promise<MonthIndex> {
  try {
    const index = JSON.parse(
      await readFile(join(DATA_OUT, id, 'archives.json'), 'utf8'),
    ) as MonthIndex;
    return Array.isArray(index.months) ? index : emptyIndex(id);
  } catch {
    return emptyIndex(id);
  }
}

async function readPreviews(id: string): Promise<PreviewIndex> {
  try {
    const index = JSON.parse(
      await readFile(join(DATA_OUT, id, 'previews.json'), 'utf8'),
    ) as PreviewIndex;
    return Array.isArray(index.previews) ? index : { layer_id: id, previews: [] };
  } catch {
    return { layer_id: id, previews: [] };
  }
}

async function main(): Promise<number> {
  const now = new Date();
  const month = arg('month') ?? previousMonth(now);
  const tiles = arg('tiles')?.split(',').filter(Boolean);
  const cacheDir = arg('cache');
  if (cacheDir) await mkdir(cacheDir, { recursive: true });
  const counter = { bytes: 0 };
  const get = rangeGetter(cacheDir, counter);
  const getJson = async (url: string) =>
    JSON.parse((await fetchWithRetry(url)).body.toString('utf8'));
  const log = (m: string) =>
    process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${m}\n`);

  const layers = {
    truecolour: await loadLayer(LAYERS.truecolour),
    ndvi: await loadLayer(LAYERS.ndvi),
  };

  let built: MonthBuild | null = null;
  let error: string | undefined;
  const t0 = Date.now();
  try {
    built = await buildMonth({
      month,
      galicia: await loadOutline(),
      bbox: BBOX,
      get,
      getJson,
      tiles,
      minzoom: MINZOOM,
      maxzoom: MAXZOOM,
      log,
    });
    if (built.gapShare > MAX_GAP_SHARE) {
      error = `${month}: ${(built.gapShare * 100).toFixed(0)} % of Galicia without a clear observation`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  log(
    `build: ${((Date.now() - t0) / 60_000).toFixed(1)} min, ${(counter.bytes / 1e6).toFixed(0)} MB downloaded`,
  );

  const previewOnly = process.argv.includes('--preview-only');
  let previews = 0;
  if (built && !error) {
    for (const kind of ['truecolour', 'ndvi'] as const) {
      const id = layers[kind].id;
      const p = await previewImage(built[kind], BBOX);
      const hash = createHash('sha256').update(p.webp).digest('hex').slice(0, 12);
      const file = `previews/${month}-${hash}.webp`;
      await mkdir(join(DATA_OUT, id, 'previews'), { recursive: true });
      await writeAtomic(join(DATA_OUT, id, file), p.webp);
      const { index, removed } = addPreview(
        await readPreviews(id),
        {
          month,
          file,
          width: p.width,
          height: p.height,
          bounds: p.bounds,
          gap_share: Math.round(built.gapShare * 1000) / 1000,
          scenes: built.tiles.reduce((n, t) => n + t.scenes.length, 0),
          first_date: built.firstDate,
          last_date: built.lastDate,
        },
        PREVIEW_MONTHS,
      );
      await writeAtomic(join(DATA_OUT, id, 'previews.json'), `${JSON.stringify(index, null, 2)}\n`);
      for (const f of removed) await rm(join(DATA_OUT, id, f), { force: true });
      previews++;
      log(`${id}: ${file} ${(p.webp.length / 1e3).toFixed(0)} kB, ${p.width} × ${p.height}`);
    }
  }
  if (previewOnly) {
    // Nothing to upload; the workflow still reads the list.
    await mkdir(SAT_OUT, { recursive: true });
    await writeFile(join(SAT_OUT, 'upload.txt'), '');
    return previews ? 0 : 1;
  }

  const upload: string[] = [];
  for (const kind of ['truecolour', 'ndvi'] as const) {
    const layer = layers[kind];
    const id = layer.id;
    const year = month.slice(0, 4);
    const attribution = layer.attribution.replace('[ano]', year);
    const tilesOut = built ? built[kind] : [];
    const attempt: Attempt = {
      layerId: id,
      at: now,
      sourceUrl: layer.source_url,
      licence: layer.licence.spdx ?? layer.licence.text_url,
      attribution,
      error,
    };
    if (built && !error) {
      attempt.data = {
        body: writePmtiles(tilesOut, {
          name: `${id} ${month}`,
          attribution,
          description: `${layer.title.gl}, ${month}`,
          bounds: BBOX,
          minzoom: MINZOOM,
          maxzoom: MAXZOOM,
          format: 'webp',
        }),
        featureCount: tilesOut.length,
        publishedAt: built.lastDate,
      };
    }
    const body = attempt.data?.body as Buffer | undefined;
    const sha256 = body ? createHash('sha256').update(body).digest('hex') : '';
    const file = body ? archiveName(month, sha256) : 'unpublished.pmtiles';
    const archive = join(SAT_OUT, id, file);
    const decision = await publish(attempt, archive, join(DATA_OUT, id, 'meta.json'));
    if (!decision.write || !built || !body) {
      log(`${id}: not published (${decision.meta.last_error})`);
      continue;
    }
    const bytes = body.length;
    const { index, removed } = addMonth(
      await readIndex(id),
      {
        month,
        file,
        minzoom: MINZOOM,
        maxzoom: MAXZOOM,
        bounds: [BBOX.west, BBOX.south, BBOX.east, BBOX.north],
        tiles: tilesOut.length,
        bytes,
        sha256,
        gap_share: Math.round(built.gapShare * 1000) / 1000,
        scenes: built.tiles.reduce((n, t) => n + t.scenes.length, 0),
        first_date: built.firstDate,
        last_date: built.lastDate,
        built_at: now.toISOString(),
      },
      KEEP_MONTHS,
    );
    await writeAtomic(join(DATA_OUT, id, 'archives.json'), `${JSON.stringify(index, null, 2)}\n`);
    upload.push(`${id}/${file}`);
    if (removed.length) log(`${id}: past the retention ${removed.join(' ')}`);
    log(
      `${id}: ${file} ${(bytes / 1e6).toFixed(1)} MB, ${tilesOut.length} tiles, gaps ${(built.gapShare * 100).toFixed(1)} %`,
    );
  }
  if (built) {
    for (const t of built.tiles) {
      log(
        `  ${t.tile}: ${t.scenes.length} scenes${t.failed.length ? `, failed ${t.failed.join(' ')}` : ''}`,
      );
    }
  }
  await mkdir(SAT_OUT, { recursive: true });
  await writeFile(join(SAT_OUT, 'upload.txt'), upload.map((l) => `${l}\n`).join(''));
  return upload.length ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
