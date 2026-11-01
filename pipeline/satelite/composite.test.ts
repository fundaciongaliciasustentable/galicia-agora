import { describe, expect, it } from 'vitest';
import {
  compositeBlock,
  countObservation,
  medianOf,
  type Observation,
  stretch,
  toReflectance,
  worthReading,
} from './composite.ts';
import { codeToNdvi, ndviColour, ndviToCode } from './ndvi.ts';

/** One observation of n pixels: SCL classes and one value per band. */
function obs(scl: number[], red: number[], nir: number[], green = red, blue = red): Observation {
  return {
    scl: Uint8Array.from(scl),
    bands: {
      red: Int16Array.from(red),
      green: Int16Array.from(green),
      blue: Int16Array.from(blue),
      nir: Int16Array.from(nir),
    },
  };
}

describe('medianOf', () => {
  it('handles odd, even and single counts', () => {
    expect(medianOf(Float64Array.from([5, 1, 3]), 3)).toBe(3);
    expect(medianOf(Float64Array.from([4, 1, 3, 2]), 4)).toBe(2.5);
    expect(medianOf(Float64Array.from([7, 99]), 1)).toBe(7);
  });
});

describe('compositeBlock', () => {
  // Pixel 0: three clear looks and a cloud. Pixel 1: only a cloud shadow and a
  // dark-area look (fallback). Pixel 2: cloud everywhere. Pixel 3: one clear look.
  const looks = [
    obs([4, 3, 9, 8], [100, 900, 900, 900], [300, 900, 900, 900]),
    obs([4, 2, 9, 4], [200, 500, 900, 400], [600, 700, 900, 800]),
    obs([5, 9, 10, 9], [150, 900, 900, 900], [450, 900, 900, 900]),
    obs([9, 9, 8, 0], [5000, 900, 900, 0], [5000, 900, 900, 0]),
  ];
  const c = compositeBlock(looks, 4);

  it('takes the median of clear observations and ignores clouds', () => {
    expect(c.red[0]).toBe(150);
    expect(c.valid[0]).toBe(2);
    expect(c.count[0]).toBe(3);
    // NDVI per look: 0.5, 0.5, 0.5 → 0.5.
    expect(codeToNdvi(c.ndvi[0] as number)).toBeCloseTo(0.5);
  });

  it('falls back to doubtful classes only where nothing is clear', () => {
    expect(c.valid[1]).toBe(1);
    expect(c.red[1]).toBe(500);
  });

  it('leaves no data where every look is cloud', () => {
    expect(c.valid[2]).toBe(0);
    expect(c.red[2]).toBe(0);
  });

  it('uses a single clear look as is', () => {
    expect(c.valid[3]).toBe(2);
    expect(c.red[3]).toBe(400);
    expect(codeToNdvi(c.ndvi[3] as number)).toBeCloseTo(1 / 3, 2);
  });
});

describe('worthReading', () => {
  it('reads a scene that adds clear pixels where they are still missing', () => {
    const clear = new Uint8Array(1000);
    const fallback = new Uint8Array(1000);
    const scl = new Uint8Array(1000).fill(9);
    expect(worthReading(scl, clear, fallback)).toBe(false);
    scl.fill(4, 0, 10);
    expect(worthReading(scl, clear, fallback)).toBe(true);
  });

  it('skips a scene once every pixel has enough clear looks', () => {
    const scl = new Uint8Array(1000).fill(4);
    const clear = new Uint8Array(1000);
    const fallback = new Uint8Array(1000);
    for (let k = 0; k < 3; k++) countObservation(scl, clear, fallback);
    expect(worthReading(scl, clear, fallback)).toBe(false);
  });

  it('reads a doubtful look only for pixels that have nothing yet', () => {
    const scl = new Uint8Array(1000).fill(7);
    const clear = new Uint8Array(1000);
    const fallback = new Uint8Array(1000);
    expect(worthReading(scl, clear, fallback)).toBe(true);
    countObservation(scl, clear, fallback);
    expect(worthReading(scl, clear, fallback)).toBe(false);
  });
});

describe('toReflectance', () => {
  it('applies the −1000 DN offset of processing baseline 04.00+', () => {
    const r = toReflectance(Uint16Array.from([0, 1000, 1500, 11000]), 0.0001, -0.1);
    expect([...r]).toEqual([0, 0, 500, 10000]);
  });

  it('leaves older scenes without offset unchanged', () => {
    expect([...toReflectance(Uint16Array.from([500]), 0.0001, 0)]).toEqual([500]);
  });
});

describe('display', () => {
  it('stretches reflectance monotonically into 0–255', () => {
    expect(stretch(-5)).toBe(0);
    expect(stretch(0)).toBe(0);
    expect(stretch(500)).toBeGreaterThan(stretch(250));
    expect(stretch(2800)).toBe(255);
    expect(stretch(20000)).toBe(255);
  });

  it('codes NDVI in one byte and paints it along the ramp', () => {
    expect(ndviToCode(-1)).toBe(0);
    expect(ndviToCode(1)).toBe(200);
    expect(ndviToCode(5)).toBe(200);
    expect(codeToNdvi(ndviToCode(0.43))).toBeCloseTo(0.43);
    expect(ndviColour(0.8)).toEqual([0x23, 0x68, 0x3a]);
    expect(ndviColour(-1)).toEqual(ndviColour(-0.2));
  });
});
