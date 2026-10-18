import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, formatHash, parseHash } from './urlstate.ts';

describe('url state', () => {
  it('round-trips view and layers', () => {
    const s = { zoom: 9.5, lat: 42.88, lon: -8.54, layers: ['tren', 'focos-calor'] };
    const back = parseHash(formatHash(s));
    expect(back.layers).toEqual(s.layers);
    expect(back.zoom).toBeCloseTo(9.5);
    expect(back.lat).toBeCloseTo(42.88);
  });

  it('ignores garbage and out-of-area views', () => {
    expect(parseHash('#map=x/y/z')).toEqual(DEFAULT_STATE);
    expect(parseHash('#map=8/10/10').lat).toBe(DEFAULT_STATE.lat);
    expect(parseHash('#capas=<script>,tren').layers).toEqual(['tren']);
  });
});
