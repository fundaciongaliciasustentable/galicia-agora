// Connected V16 beacons active now in Galicia, read from the DGT DATEX II v3.7
// SituationPublication feed (records whose situationRecordCreationReference starts
// with V16_). Shares one download per run with trafico-incidencias.
//
// Privacy (decision of the FGS, 2026-10-24): a V16 beacon marks a private vehicle
// stopped on the road. The layer is live only and never carries anything that lets a
// device be followed:
// - the V16_ reference, the situation id and the record id are read only to filter and
//   are never written, hashed or logged;
// - the feature id is the position within this run (1..n, ordered by road and km), so it
//   says nothing about which beacon it was in the previous run;
// - the start time is floored to 5 minutes, coordinates are rounded to 4 decimals
//   (~10 m) and the km point to 100 m;
// - publish() keeps only the current file; there is no per-device history.

import { type Adapter, type Feature, inGalicia, round } from '../../lib/adapter.ts';
import {
  fetchSituations,
  galicianAnchor,
  readRecords,
  type SituationRecord,
} from '../trafico-incidencias/situations.ts';

export { SITUATIONS_URL as URL } from '../trafico-incidencias/situations.ts';

export const PAD = 0.3;
const FIVE_MIN = 5 * 60_000;

export type Raw = Buffer;

/** Floor an ISO time to 5 minutes. */
export function floor5(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(Math.floor(ms / FIVE_MIN) * FIVE_MIN).toISOString() : null;
}

export function toFeatures(records: SituationRecord[]): Feature[] {
  const rows = records
    .filter((r) => r.v16)
    .map((r) => ({ r, a: galicianAnchor(r) }))
    .filter(
      (x): x is { r: SituationRecord; a: NonNullable<typeof x.a> } =>
        x.a !== null && inGalicia(x.a.lon, x.a.lat, PAD),
    )
    .map(({ r, a }) => ({
      lon: round(a.lon, 4),
      lat: round(a.lat, 4),
      properties: {
        estrada: r.road,
        pk: a.pk === null ? null : round(a.pk, 1),
        concello: a.concello,
        provincia: a.provincia,
        desde: floor5(r.start),
      },
    }));

  // Order by public fields only, so the index carries no information from the source ids.
  rows.sort(
    (x, y) =>
      String(x.properties.estrada ?? '').localeCompare(String(y.properties.estrada ?? '')) ||
      (x.properties.pk ?? 0) - (y.properties.pk ?? 0) ||
      x.lon - y.lon ||
      x.lat - y.lat,
  );

  return rows.map((row, i) => ({
    type: 'Feature',
    id: i + 1,
    geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
    properties: row.properties,
  }));
}

const adapter = {
  fetch: (ctx) => fetchSituations(ctx),
  async normalize(raw, _ctx) {
    const { records, publishedAt } = await readRecords(raw);
    return {
      collection: { type: 'FeatureCollection', features: toFeatures(records) },
      publishedAt,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
