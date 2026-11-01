import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { local, period, windows, windowUrl } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

describe('raios-ano adapter', () => {
  // Real answer of jsonRaios.action for 19–21/12/2025, recorded on 1/11/2026, served for every
  // weekly request of the year (repeats are dropped as duplicates). Expected counts are from a
  // separate Python count with the same box and Europe/Madrid days.
  it('groups the strikes in the box by local day, in time order', async () => {
    const c = fixtureContext(
      layer,
      [{ match: 'jsonRaios.action', file: join(dir, 'fixtures', 'jsonRaios-19-21dec2025.json') }],
      { now: new Date('2026-11-15T10:00:00Z'), env: { GA_PAUSE_MS: '0' } },
    );
    const raw = await adapter.fetch(c);
    expect(raw.weeks).toHaveLength(windows('2025-10-31', '2026-11-01').length);
    const { collection } = await adapter.normalize(raw, c);
    const days = collection.features.map((f) => [f.properties.dia, f.properties.n]);
    expect(days).toEqual([
      ['2025-12-20', 63],
      ['2025-12-21', 135],
      ['2025-12-22', 3],
    ]);
    for (const f of collection.features)
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    const d21 = collection.features[1]?.properties as Record<string, number[]>;
    expect([d21.segundo?.[0], d21.lon?.[0], d21.lat?.[0], d21.ka?.[0]]).toEqual([
      327, -7.814, 41.73, -6,
    ]);
    expect(d21.segundo).toEqual([...(d21.segundo ?? [])].sort((a, b) => a - b));
  });

  it('takes the twelve whole months before the current one', () => {
    expect(period(new Date('2026-11-01T10:00:00Z'))).toEqual({
      from: '2025-11-01',
      to: '2026-10-31',
    });
    expect(period(new Date('2026-01-10T10:00:00Z'))).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('asks in windows of at most seven days', () => {
    const w = windows('2025-11-01', '2025-11-16');
    expect(w).toEqual([
      ['2025-11-01', '2025-11-07'],
      ['2025-11-08', '2025-11-14'],
      ['2025-11-15', '2025-11-16'],
    ]);
    expect(windowUrl(['2025-11-01', '2025-11-07'])).toContain(
      'dataIni=01/11/2025&dataFin=07/11/2025',
    );
    expect(windowUrl(['2025-11-01', '2025-11-01'])).toContain('data=01/11/2025');
  });

  it('reads instants in Galician time', () => {
    expect(local(Date.parse('2025-12-20T23:30:00Z'))).toEqual({ day: '2025-12-21', second: 1800 });
    expect(local(Date.parse('2026-06-20T22:00:05Z'))).toEqual({ day: '2026-06-21', second: 5 });
  });
});
