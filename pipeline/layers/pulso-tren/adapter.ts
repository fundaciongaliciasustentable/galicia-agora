// Every train in Galicia on a working day and on a Sunday, as timed trajectories for the
// /pulso/ animation. Same Renfe static GTFS as estacions-tren: AV/LD/MD (google_transit.zip)
// and Cercanías + ancho métrico (fomento_transit.zip, Ferrol–Ortigueira–Ribadeo). See
// gtfs-trips.ts for the trajectory model.
//
// Some trains are in both feeds (the Ferrol–Ortigueira regionals are REGIONAL in AV/LD/MD and
// C1 in Cercanías, with the same times): a stretch with the same day, start point, start time
// and end time as one already read is dropped.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Adapter, AdapterContext } from '../../lib/adapter.ts';
import { FEEDS, type FeedKey, httpDateToIso } from '../estacions-tren/adapter.ts';
import { readTrips, referenceDays, type Trip, tripFeatures } from './gtfs-trips.ts';

export const PAD = 0.05;
const DOWNLOAD_TIMEOUT_MS = 300_000;

export interface Raw {
  /** Temporary directory holding the ZIPs; removed by normalize. */
  dir: string;
  zips: Record<FeedKey, string>;
  lastModified: Record<FeedKey, string | null>;
}

/** Drop stretches already present (same train in both feeds). */
export function dedupe(trips: Trip[]): Trip[] {
  const seen = new Set<string>();
  return trips.filter((tr) => {
    const k = `${tr.day}|${tr.coords[0]?.join(',')}|${tr.t[0]}|${tr.t.at(-1)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function download(ctx: AdapterContext, key: FeedKey, dir: string) {
  const res = await ctx.get(FEEDS[key], { timeoutMs: DOWNLOAD_TIMEOUT_MS });
  const body = res.body;
  // ZIP local file header "PK\x03\x04".
  if (body.length < 4 || body.readUInt32LE(0) !== 0x04034b50) {
    const head = body.subarray(0, 100).toString('utf8').replace(/\s+/g, ' ');
    throw new Error(`Renfe ${key}: download is not a ZIP (${body.length} bytes): ${head}`);
  }
  const path = join(dir, `${key}.zip`);
  await writeFile(path, body);
  return { path, lastModified: res.lastModified ?? res.headers?.['last-modified'] ?? null };
}

const adapter = {
  async fetch(ctx) {
    const dir = await mkdtemp(join(tmpdir(), 'pulso-tren-'));
    try {
      const ld = await download(ctx, 'ld', dir);
      const cercanias = await download(ctx, 'cercanias', dir);
      return {
        dir,
        zips: { ld: ld.path, cercanias: cercanias.path },
        lastModified: { ld: ld.lastModified, cercanias: cercanias.lastModified },
      };
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw err;
    }
  },

  async normalize(raw, ctx) {
    try {
      const days = referenceDays(ctx.now);
      const trips: Trip[] = [];
      for (const key of Object.keys(FEEDS) as FeedKey[]) {
        trips.push(
          ...(await readTrips(raw.zips[key], {
            days,
            pad: PAD,
            label: `Renfe ${key}`,
            lineName: (short, long, id) => (short || long || id).replace(/\s+/g, ' ').trim(),
          })),
        );
      }
      const features = tripFeatures(dedupe(trips), 'tren', days);
      if (!features.some((f) => f.properties.dia === 'laborable')) {
        throw new Error('Renfe GTFS: no trains in Galicia on the working reference day');
      }
      const times = (Object.keys(FEEDS) as FeedKey[])
        .map((k) => httpDateToIso(raw.lastModified[k]))
        .filter((t): t is string => t !== null)
        .sort();
      return {
        collection: { type: 'FeatureCollection', features },
        // Newest ZIP Last-Modified: when Renfe last regenerated the timetables.
        publishedAt: times.at(-1) ?? null,
      };
    } finally {
      await rm(raw.dir, { recursive: true, force: true });
    }
  },
} satisfies Adapter<Raw>;

export default adapter;
