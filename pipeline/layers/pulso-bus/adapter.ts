// Every Xunta bus on a working day and on a Sunday, as timed trajectories for the /pulso/
// animation. Same NAP GTFS and download as buses-xunta (key in the ApiKey header, never
// logged); see ../pulso-tren/gtfs-trips.ts for the trajectory model. Straight lines between
// consecutive stops follow the roads closely enough at this scale; shapes.txt (~389 MB) is
// not read.

import { rm } from 'node:fs/promises';
import type { Adapter } from '../../lib/adapter.ts';
import busesXunta, {
  KEY_ENV,
  napUpdatedAt,
  PAD,
  type Raw,
  redact,
} from '../buses-xunta/adapter.ts';
import { readTrips, referenceDays, tripFeatures } from '../pulso-tren/gtfs-trips.ts';

const adapter = {
  fetch: (ctx) => busesXunta.fetch(ctx),

  async normalize(raw, ctx) {
    const key = ctx.env[KEY_ENV]?.trim() || undefined;
    try {
      const days = referenceDays(ctx.now);
      const trips = await readTrips(raw.zipPath, {
        days,
        pad: PAD,
        label: 'NAP Xunta',
        lineName: (short, long, id) => (long || short || id).replace(/\s+/g, ' ').trim(),
      });
      const features = tripFeatures(trips, 'bus', days);
      if (!features.some((f) => f.properties.dia === 'laborable')) {
        throw new Error('NAP Xunta GTFS: no buses on the working reference day');
      }
      return {
        collection: { type: 'FeatureCollection', features },
        publishedAt: napUpdatedAt(raw.meta, ctx.now),
      };
    } catch (err) {
      throw new Error(redact(err instanceof Error ? err.message : String(err), key));
    } finally {
      await rm(raw.dir, { recursive: true, force: true });
    }
  },
} satisfies Adapter<Raw>;

export default adapter;
