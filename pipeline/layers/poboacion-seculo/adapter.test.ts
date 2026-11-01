import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { harmonise, parsePage, queryUrl, readable } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };

const dir = import.meta.dirname;
const fx = (f: string) => join(dir, 'fixtures', f);
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));

// Real INE answers of 1/11/2026 (scripts removed): Santiago and the two municipalities it
// absorbed (Conxo, Enfesta), Baralla and Neira de Xusá (renamed with a new code), Mondariz and
// Mondariz-Balneario (split off in the 1920s), and the page for a code that does not exist.
const CODES = ['15078', '15500', '15501', '27901', '27036', '36030', '36031', '15099'];
const ctx = () =>
  fixtureContext(
    layer,
    CODES.map((c) => ({
      match: `codigoProvincia=${c.slice(0, 2)}&codigoMunicipio=${c.slice(2)}&`,
      file: fx(`ine_${c}.html`),
    })),
    { env: { GA_PAUSE_MS: '0', INE_CODES: CODES.join(',') } },
  );

describe('poboacion-seculo adapter', () => {
  it('reads an INE answer, and nothing from an unknown code', async () => {
    const santiago = parsePage(await readFile(fx('ine_15078.html'), 'utf8'));
    expect(santiago?.code).toBe('15078');
    expect(santiago?.pop[2021]).toBeGreaterThan(90_000);
    expect(santiago?.note).toMatch(/incorpora a 15500/);
    expect(parsePage(await readFile(fx('ine_15099.html'), 'utf8'))).toBeNull();
  });

  it('brings absorbed, renamed and split municipalities to today’s concellos', async () => {
    const c = ctx();
    const raw = await adapter.fetch(c);
    expect(c.requested[0]).toBe(queryUrl('15078'));
    expect(raw.municipalities).toHaveLength(7);
    const h = new Map(harmonise(raw.municipalities).map((x) => [x.code, x]));
    // Today's concellos only: Conxo, Enfesta and Neira de Xusá are folded in.
    expect([...h.keys()]).toEqual(['15078', '27901', '36030', '36031']);
    const byYear = (m: (typeof raw.municipalities)[number], y: number) => m.pop[y] ?? 0;
    const get = (code: string) =>
      raw.municipalities.find((m) => m.code === code) as (typeof raw.municipalities)[number];
    // Santiago in 1900 = Santiago + Conxo + Enfesta in 1900.
    expect(h.get('15078')?.own[0]).toBe(
      byYear(get('15078'), 1900) + byYear(get('15500'), 1900) + byYear(get('15501'), 1900),
    );
    expect(h.get('15078')?.includes.length).toBe(2);
    // Baralla takes Neira de Xusá's figures before 1981.
    expect(h.get('27901')?.own[0]).toBe(byYear(get('27036'), 1900));
    // Mondariz-Balneario split off in the 1920s: one comparable unit with Mondariz.
    expect(h.get('36031')?.unit).toEqual(['36030', '36031']);
    expect(h.get('36031')?.own[0]).toBeNull();

    const { collection } = await adapter.normalize(raw, c);
    for (const f of collection.features)
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    const balneario = collection.features.find((f) => f.id === '36031')?.properties;
    const mondariz = collection.features.find((f) => f.id === '36030')?.properties;
    // Same unit, same index, every census.
    expect(balneario?.indice_1900).toEqual(mondariz?.indice_1900);
    expect((balneario?.indice_1900 as number[] | undefined)?.[0]).toBe(100);
  });

  it('writes names the way they are said', () => {
    expect(readable('Coruña, A')).toBe('A Coruña');
    expect(readable('Illa de Arousa (A)')).toBe('A Illa de Arousa');
  });
});
