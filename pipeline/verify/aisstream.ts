// Phase 0 check of AISStream: connect for a while over the Galician coast and
// print AGGREGATE statistics only. No positions, names or MMSIs are printed or
// stored: CI logs of a public repo are public, and redistribution terms are
// not confirmed.
//
//   AISSTREAM_API_KEY=... tsx pipeline/verify/aisstream.ts [seconds]

import { delayMinutes } from '../lib/ais-privacy.ts';

// Galician coast and shelf: [[lat, lon], [lat, lon]] corners.
const BBOX = [
  [41.8, -10.5],
  [44.3, -7.0],
];

interface Vessel {
  type?: number;
  lengthM?: number;
  classB: boolean;
  positions: number;
}

async function main() {
  const key = process.env.AISSTREAM_API_KEY;
  if (!key) throw new Error('AISSTREAM_API_KEY is not set');
  const seconds = Number(process.argv[2] ?? 180);

  const vessels = new Map<number, Vessel>();
  const byType = new Map<string, number>();
  let messages = 0;
  let errorMsg: string | null = null;

  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [BBOX] }));
  });
  ws.addEventListener('message', async (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
    const msg = JSON.parse(raw) as {
      MessageType?: string;
      MetaData?: { MMSI?: number };
      Message?: Record<string, Record<string, unknown>>;
      error?: string;
    };
    if (msg.error) {
      errorMsg = msg.error;
      return;
    }
    messages++;
    const t = msg.MessageType ?? 'unknown';
    byType.set(t, (byType.get(t) ?? 0) + 1);
    const mmsi = msg.MetaData?.MMSI;
    if (!mmsi) return;
    const v = vessels.get(mmsi) ?? { classB: false, positions: 0 };
    if (t === 'PositionReport' || t.includes('ClassB')) v.positions++;
    if (t.includes('ClassB')) v.classB = true;
    const body = msg.Message?.[t];
    if (t === 'ShipStaticData' && body) {
      v.type = Number(body.Type);
      const d = body.Dimension as { A?: number; B?: number } | undefined;
      const len = (d?.A ?? 0) + (d?.B ?? 0);
      if (len > 0) v.lengthM = len;
    }
    vessels.set(mmsi, v);
  });

  const closed = new Promise<void>((resolve) => ws.addEventListener('close', () => resolve()));
  await Promise.race([closed, new Promise((r) => setTimeout(r, seconds * 1000))]);
  ws.close();

  const all = [...vessels.values()];
  const withType = all.filter((v) => v.type !== undefined).length;
  const withLength = all.filter((v) => v.lengthM !== undefined).length;
  const delayed = all.filter((v) => delayMinutes(v) > 0).length;

  console.log(`AISStream check over ${seconds}s, Galician coast bbox`);
  if (errorMsg) console.log(`Server error: ${errorMsg}`);
  console.log(`messages: ${messages}`);
  console.log(`message types: ${JSON.stringify(Object.fromEntries(byType))}`);
  console.log(`distinct vessels: ${all.length}`);
  console.log(`  with ShipStaticData type: ${withType}`);
  console.log(`  with length: ${withLength}`);
  console.log(`  Class B: ${all.filter((v) => v.classB).length}`);
  console.log(`  would be delayed by the small-vessel rule: ${delayed}`);
  if (messages === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
