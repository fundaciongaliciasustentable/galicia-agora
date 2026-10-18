import { describe, expect, it } from 'vitest';
import { validate } from './schemas.ts';

const layer = {
  id: 'caudais-rios',
  title: { gl: 'Caudais dos ríos', es: 'Caudales de los ríos' },
  theme: 'auga-mar',
  operator: { name: 'Augas de Galicia', url: 'https://augasdegalicia.xunta.gal' },
  source_url: 'https://example.org/feed',
  licence: {
    spdx: 'CC-BY-4.0',
    text_url: 'https://example.org/licence',
    verified_at: '2026-10-18',
    odbl_compatible: true,
  },
  attribution: '© Augas de Galicia',
  update_frequency: { declared: 'PT10M' },
  geometry: 'point',
  output: 'geojson',
  auth: { required: false },
  privacy_notes: 'Sen datos persoais.',
  stale_after: 'PT30M',
  style: { kind: 'circle', color_token: '--c-auga' },
  table: { fields: ['nome'] },
};

describe('layer schema', () => {
  it('accepts a complete layer', async () => {
    expect(await validate('layer', layer)).toEqual([]);
  });

  it('requires env_var when auth is required', async () => {
    const errs = await validate('layer', { ...layer, auth: { required: true } });
    expect(errs.join()).toMatch(/env_var/);
  });

  it('rejects unknown themes and bad ids', async () => {
    expect(await validate('layer', { ...layer, theme: 'outros' })).not.toEqual([]);
    expect(await validate('layer', { ...layer, id: 'Caudais_Rios' })).not.toEqual([]);
  });

  it('rejects a layer without licence', async () => {
    const { licence: _, ...rest } = layer;
    expect((await validate('layer', rest)).join()).toMatch(/licence/);
  });
});
