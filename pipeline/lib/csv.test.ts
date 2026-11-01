import { describe, expect, it } from 'vitest';
import { decodeText, latLon, latLonPair, parseDelimited, records } from './csv.ts';

describe('csv helpers', () => {
  it('decodes UTF-8 (BOM removed) and falls back to Latin-1', () => {
    expect(decodeText(Buffer.from('﻿Coruña', 'utf8'))).toBe('Coruña');
    expect(decodeText(Buffer.from('Coruña', 'latin1'))).toBe('Coruña');
  });

  it('parses quoted fields with either separator and skips blank lines', () => {
    expect(parseDelimited('a;"b;c";"d ""e"""\r\n;;\r\n1;2;3', ';')).toEqual([
      ['a', 'b;c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('keys rows by trimmed header and fails on missing columns', () => {
    expect(records('X ;Y\n1;2', ';', ['X'])).toEqual([{ X: '1', Y: '2' }]);
    expect(() => records('X;Y\n1;2', ';', ['Z'])).toThrow(/missing: Z/);
  });

  it('reads coordinates inside Galicia only', () => {
    expect(latLonPair('43.32, -8.52')).toEqual({ lat: 43.32, lon: -8.52 });
    expect(latLonPair('43.32')).toBeNull();
    expect(latLon('42,94', '-9,06')).toEqual({ lat: 42.94, lon: -9.06 });
    expect(latLon('42.94', '9.06')).toBeNull();
  });
});
