import { describe, expect, it } from 'vitest';
import { directionAt, tempColour, valueAt, windParticles } from './engine.ts';

const hours = (vals: Record<number, number | null>) =>
  Array.from({ length: 24 }, (_, h) => (h in vals ? (vals[h] ?? null) : 0));

describe('tempo engine', () => {
  it('interpolates between hours and keeps gaps as gaps', () => {
    const h = hours({ 10: 10, 11: 20 });
    expect(valueAt(h, 10 * 3600)).toBe(10);
    expect(valueAt(h, 10.5 * 3600)).toBe(15);
    const gap = hours({ 5: null, 6: null });
    expect(valueAt(gap, 5.2 * 3600)).toBeNull();
  });

  it('turns the wind the short way round', () => {
    const h = hours({ 3: 350, 4: 10 });
    expect(directionAt(h, 3.5 * 3600)).toBeCloseTo(0, 5);
  });

  it('colours cold blue and hot red', () => {
    expect(tempColour(0)).toBe('rgba(49, 54, 149, 1)');
    expect(tempColour(40)).toBe('rgba(165, 0, 38, 1)');
  });

  it('blows particles where the wind goes, and none in calm', () => {
    expect(windParticles(0.1, 0, 0, 1)).toEqual([]);
    // Wind from the north blows south: positive y on screen.
    const ps = windParticles(5, 0, 900, 1);
    const meanY = ps.reduce((a, p) => a + p.dy, 0) / ps.length;
    expect(meanY).toBeGreaterThan(0);
  });
});
