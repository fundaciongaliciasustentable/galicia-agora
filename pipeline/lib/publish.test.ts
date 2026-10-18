import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDuration } from './duration.ts';
import { type Attempt, ageStatus, decide, needsAlert, publish } from './publish.ts';
import { validate } from './schemas.ts';

const base = {
  layerId: 'test-layer',
  sourceUrl: 'https://example.org/feed',
  licence: 'CC-BY-4.0',
  attribution: '© Example',
};

function ok(at: string, featureCount = 10, body = '{"type":"FeatureCollection"}'): Attempt {
  return {
    ...base,
    at: new Date(at),
    data: { body, featureCount, publishedAt: '2026-10-18T08:00:00Z' },
  };
}

describe('decide', () => {
  it('accepts a valid first result as fresh', () => {
    const d = decide(ok('2026-10-18T08:05:00Z'), null);
    expect(d.write).toBe(true);
    expect(d.meta.status).toBe('fresh');
    expect(d.meta.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('marks failed (not stale) when there is no previous good file', () => {
    const d = decide({ ...base, at: new Date('2026-10-18T08:05:00Z'), error: 'HTTP 503' }, null);
    expect(d.write).toBe(false);
    expect(d.meta.status).toBe('failed');
  });

  it('keeps the last good file and marks stale on source failure', () => {
    const prev = decide(ok('2026-10-18T08:00:00Z'), null).meta;
    const d = decide({ ...base, at: new Date('2026-10-18T08:10:00Z'), error: 'timeout' }, prev);
    expect(d.write).toBe(false);
    expect(d.meta.status).toBe('stale');
    expect(d.meta.checksum).toBe(prev.checksum);
    expect(d.meta.last_success_at).toBe(prev.last_success_at);
    expect(d.meta.consecutive_failures).toBe(1);
    expect(d.meta.history[0]).toMatchObject({ ok: false, error: 'timeout' });
  });

  it('never overwrites with an empty result', () => {
    const prev = decide(ok('2026-10-18T08:00:00Z'), null).meta;
    const d = decide(ok('2026-10-18T08:10:00Z', 0), prev);
    expect(d.write).toBe(false);
    expect(d.meta.status).toBe('stale');
    expect(d.meta.last_error).toMatch(/empty/);
  });

  it('rejects an anomalous drop in feature count', () => {
    const prev = decide(ok('2026-10-18T08:00:00Z', 95), null).meta;
    const d = decide(ok('2026-10-18T08:10:00Z', 12), prev);
    expect(d.write).toBe(false);
    expect(d.meta.last_error).toMatch(/anomalous drop/);
  });

  it('rejects data that fails schema validation', () => {
    const d = decide({ ...ok('2026-10-18T08:10:00Z'), validationErrors: ['/features bad'] }, null);
    expect(d.write).toBe(false);
    expect(d.meta.last_error).toMatch(/schema validation/);
  });

  it('drops history older than 7 days', () => {
    let meta = decide(ok('2026-10-01T00:00:00Z'), null).meta;
    meta = decide(ok('2026-10-18T00:00:00Z'), meta).meta;
    expect(meta.history).toHaveLength(1);
  });

  it('produces meta.json that matches the schema', async () => {
    const prev = decide(ok('2026-10-18T08:00:00Z'), null).meta;
    const stale = decide({ ...base, at: new Date('2026-10-18T08:10:00Z'), error: 'x' }, prev).meta;
    expect(await validate('meta', prev)).toEqual([]);
    expect(await validate('meta', stale)).toEqual([]);
  });
});

describe('ageStatus and needsAlert', () => {
  const meta = decide(ok('2026-10-18T08:00:00Z'), null).meta;
  const tenMin = parseDuration('PT10M');

  it('turns fresh into stale after stale_after', () => {
    expect(ageStatus(meta, new Date('2026-10-18T08:20:00Z'), 3 * tenMin)).toBe('fresh');
    expect(ageStatus(meta, new Date('2026-10-18T08:31:00Z'), 3 * tenMin)).toBe('stale');
  });

  it('alerts after more than three cycles without success', () => {
    expect(needsAlert(meta, new Date('2026-10-18T08:29:00Z'), tenMin)).toBe(false);
    expect(needsAlert(meta, new Date('2026-10-18T08:31:00Z'), tenMin)).toBe(true);
  });
});

describe('publish (disk)', () => {
  it('keeps the previous data file when the new attempt fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ga-'));
    const dataPath = join(dir, 'data.geojson');
    const metaPath = join(dir, 'meta.json');
    await publish(ok('2026-10-18T08:00:00Z', 10, 'GOOD'), dataPath, metaPath);
    await publish(ok('2026-10-18T08:10:00Z', 0, ''), dataPath, metaPath);
    expect(await readFile(dataPath, 'utf8')).toBe('GOOD');
    const meta = JSON.parse(await readFile(metaPath, 'utf8'));
    expect(meta.status).toBe('stale');
  });

  it('does not leave temp files behind', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ga-'));
    await writeFile(join(dir, 'keep'), '');
    await publish(ok('2026-10-18T08:00:00Z'), join(dir, 'd.json'), join(dir, 'm.json'));
    const { readdir } = await import('node:fs/promises');
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('parseDuration', () => {
  it('parses the subset we use', () => {
    expect(parseDuration('PT10M')).toBe(600_000);
    expect(parseDuration('P1D')).toBe(86_400_000);
    expect(parseDuration('PT1H30M')).toBe(5_400_000);
    expect(() => parseDuration('P')).toThrow();
    expect(() => parseDuration('10m')).toThrow();
  });
});
