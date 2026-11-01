import { describe, expect, it } from 'vitest';
import { crossings, elevation, localDay, madridOffset, shade, sunAt } from './engine.ts';

// Santiago de Compostela, plaza do Obradoiro.
const SANTIAGO: [number, number] = [-8.5446, 42.8805];
const hhmm = (ms: number) => {
  const d = new Date(ms + madridOffset(ms) * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

describe('sol engine', () => {
  it('knows the Galician clock, summer and winter', () => {
    expect(madridOffset(Date.UTC(2026, 5, 21, 12))).toBe(120);
    expect(madridOffset(Date.UTC(2026, 11, 21, 12))).toBe(60);
    const { start, end } = localDay('2026-06-21');
    expect(start).toBe(Date.UTC(2026, 5, 20, 22));
    expect(end - start).toBe(24 * 3_600_000);
    // Clock change: 25 October 2026 has 25 hours.
    const ch = localDay('2026-10-25');
    expect(ch.end - ch.start).toBe(25 * 3_600_000);
  });

  // Reference: NOAA solar calculator table for 42.8805 N, 8.5446 W, 2026, Europe/Madrid
  // (gml.noaa.gov/grad/solcalc/table.php, read on 1/11/2026), within 2 minutes.
  it('puts sunrise and sunset in Santiago where NOAA does', () => {
    const june = localDay('2026-06-21');
    const s = crossings(...SANTIAGO, june.start, june.end);
    expect(Math.abs(hhmm(s.rise as number) - (6 * 60 + 56))).toBeLessThanOrEqual(2);
    expect(Math.abs(hhmm(s.set as number) - (22 * 60 + 16))).toBeLessThanOrEqual(2);
    const dec = localDay('2026-12-21');
    const w = crossings(...SANTIAGO, dec.start, dec.end);
    expect(Math.abs(hhmm(w.rise as number) - (9 * 60 + 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(hhmm(w.set as number) - (18 * 60 + 3))).toBeLessThanOrEqual(2);
    const mar = localDay('2026-03-20');
    const q = crossings(...SANTIAGO, mar.start, mar.end);
    expect(Math.abs(hhmm(q.rise as number) - (7 * 60 + 38))).toBeLessThanOrEqual(2);
    expect(Math.abs(hhmm(q.set as number) - (19 * 60 + 46))).toBeLessThanOrEqual(2);
  });

  it('has the sun highest at solar noon, not at 12:00', () => {
    const noon = Date.UTC(2026, 5, 21, 12, 39); // ~14:39 CEST in Santiago
    const e = elevation(sunAt(noon), ...SANTIAGO);
    expect(e).toBeGreaterThan(70);
    expect(e).toBeLessThan(71);
  });

  it('darkens through the twilights', () => {
    expect(shade(10)).toBe(0);
    expect(shade(-3)).toBeLessThan(shade(-9));
    expect(shade(-9)).toBeLessThan(shade(-15));
    expect(shade(-15)).toBeLessThan(shade(-30));
  });
});
