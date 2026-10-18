import { describe, expect, it } from 'vitest';
import { measuredInterval, type ProbeLine } from './cli.ts';

const line = (at: string, hash: string, source_ts: string | null = null): ProbeLine => ({
  at,
  ok: true,
  status: 200,
  last_modified: null,
  etag: null,
  hash,
  source_ts,
  bytes: 1,
  ms: 1,
});

describe('measuredInterval', () => {
  it('measures the median gap between content changes', () => {
    const lines = [
      line('2026-10-18T08:00:00Z', 'a'),
      line('2026-10-18T08:10:00Z', 'b'),
      line('2026-10-18T08:20:00Z', 'b'),
      line('2026-10-18T08:30:00Z', 'c'),
      line('2026-10-18T08:40:00Z', 'd'),
    ];
    // changes at :10, :30, :40 -> gaps 20, 10 -> median (upper) 20
    expect(measuredInterval(lines)).toEqual({ changes: 3, medianMin: 20 });
  });

  it('prefers the source timestamp over the body hash', () => {
    const lines = [
      line('2026-10-18T08:00:00Z', 'a', 't1'),
      line('2026-10-18T08:10:00Z', 'b', 't1'),
      line('2026-10-18T08:20:00Z', 'c', 't2'),
    ];
    expect(measuredInterval(lines).changes).toBe(1);
  });
});
