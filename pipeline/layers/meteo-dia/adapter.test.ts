import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { DAY, localHour, windows } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real responses recorded on 1/11/2026: three stations of the list, and both 12-hour windows
// of Santiago-EOAS (10124) for the local day. Every station is served the same two windows,
// so only 10124 matches its own id; the other two must be dropped, not filled with its data.
const ctx = () =>
  fixtureContext(
    layer,
    [
      { match: 'listaEstacionsMeteo', file: fx('listaEstacionsMeteo.json') },
      { match: 'dataIni=20%2F05%2F2025+22%3A00', file: fx('horario_10124_a.json') },
      { match: 'dataIni=21%2F05%2F2025+10%3A00', file: fx('horario_10124_b.json') },
    ],
    { env: { GA_PAUSE_MS: '0' } },
  );

describe('meteo-dia adapter', () => {
  it('asks for the UTC windows of the local day', () => {
    expect(windows('2025-05-21')).toEqual(['20/05/2025 22:00', '21/05/2025 10:00']);
    // In winter the local day starts at 23:00 UTC.
    expect(windows('2025-01-15')).toEqual(['14/01/2025 23:00', '15/01/2025 11:00']);
    expect(localHour('2025-05-20T22:00:00')).toEqual({ day: '2025-05-21', hour: 0 });
    expect(localHour('2025-05-21T21:00:00')).toEqual({ day: '2025-05-21', hour: 23 });
  });

  it('turns the recorded windows into 24 local hours for Santiago', async () => {
    const c = ctx();
    const raw = await adapter.fetch(c);
    expect(c.requested).toHaveLength(1 + 3 * 2);
    const { collection } = await adapter.normalize(raw, c);
    expect(collection.features.map((f) => f.properties.id)).toEqual([10124]);
    const p = collection.features[0]?.properties as Record<string, unknown>;
    expect(validateWithSchema(schema, p)).toEqual([]);
    const ta = p.ta as number[];
    expect(ta).toHaveLength(24);
    // 22:00 UTC on the 20th is 00:00 local on the 21st; 21:00 UTC is 23:00 local.
    expect(ta[0]).toBe(16);
    expect(ta[23]).toBe(13.5);
    expect((p.rs as number[])[0]).toBe(0);
    // Sun up at 11:00 local (09:00 UTC).
    expect((p.rs as number[])[11]).toBe(324);
    expect(p.dia).toBe(DAY);
  });
});
