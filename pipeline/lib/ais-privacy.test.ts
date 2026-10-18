import { describe, expect, it } from 'vitest';
import { delayMinutes, SMALL_VESSEL_DELAY_MIN } from './ais-privacy.ts';

describe('delayMinutes', () => {
  it('delays fishing, sailing and pleasure craft', () => {
    for (const type of [30, 36, 37]) {
      expect(delayMinutes({ type, lengthM: 80 })).toBe(SMALL_VESSEL_DELAY_MIN);
    }
  });

  it('delays short vessels of any type', () => {
    expect(delayMinutes({ type: 52, lengthM: 18 })).toBe(SMALL_VESSEL_DELAY_MIN);
  });

  it('delays Class B and unclassified vessels', () => {
    expect(delayMinutes({ type: 70, lengthM: 150, classB: true })).toBe(SMALL_VESSEL_DELAY_MIN);
    expect(delayMinutes({})).toBe(SMALL_VESSEL_DELAY_MIN);
    expect(delayMinutes({ type: 70 })).toBe(SMALL_VESSEL_DELAY_MIN);
  });

  it('shows large commercial vessels without delay', () => {
    expect(delayMinutes({ type: 70, lengthM: 190 })).toBe(0);
    expect(delayMinutes({ type: 80, lengthM: 240 })).toBe(0);
  });
});
