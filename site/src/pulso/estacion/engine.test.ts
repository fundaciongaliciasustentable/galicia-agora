import { describe, expect, it } from 'vitest';
import { colourOf } from './engine.ts';

describe('estacion colour scale', () => {
  it('centres on 100 % and clamps the ends', () => {
    expect(colourOf(100)).toBe('#f7f7f2');
    expect(colourOf(20)).toBe('#2c7bb6');
    expect(colourOf(400)).toBe('#d7191c');
    // Halfway between 100 % and 130 %.
    expect(colourOf(115)).toBe('#fad3aa');
  });
});
