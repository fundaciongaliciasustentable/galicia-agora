// Cloud masking and per-pixel median of a few Sentinel-2 scenes (pure code,
// tested on tiny arrays). Works on one block of pixels at a time.

import { ndviToCode } from './ndvi.ts';

// Scene classification (SCL) of Sentinel-2 L2A:
//  0 no data · 1 saturated or defective · 2 dark area (often topographic shadow)
//  3 cloud shadow · 4 vegetation · 5 not vegetated · 6 water · 7 unclassified
//  8 cloud, medium probability · 9 cloud, high probability · 10 thin cirrus · 11 snow or ice
/** Clear observations: used first. */
export const SCL_CLEAR: ReadonlySet<number> = new Set([4, 5, 6, 11]);
/** Doubtful but not cloud: used only where a pixel has no clear observation at all. */
export const SCL_FALLBACK: ReadonlySet<number> = new Set([2, 7]);

/** Observations per pixel worth having; more scenes are read only to reach this. */
export const TARGET_OBS = 3;

/** Bands of one observation, as reflectance × 10 000 (offset already applied). */
export interface ObsBands {
  red: Int16Array;
  green: Int16Array;
  blue: Int16Array;
  nir: Int16Array;
}

export interface Observation {
  scl: Uint8Array;
  bands: ObsBands;
}

/**
 * Whether a scene's block is worth downloading, from its SCL only: it must add
 * a clear observation to enough pixels that still lack TARGET_OBS, or give the
 * first (even doubtful) value to pixels that have none.
 */
export function worthReading(
  scl: Uint8Array,
  clearCount: Uint8Array,
  fallbackCount: Uint8Array,
  minShare = 0.005,
): boolean {
  let addsClear = 0;
  let fillsGap = 0;
  for (let i = 0; i < scl.length; i++) {
    const c = scl[i] as number;
    const n = clearCount[i] as number;
    if (SCL_CLEAR.has(c)) {
      if (n < TARGET_OBS) addsClear++;
      if (n === 0) fillsGap++;
    } else if (SCL_FALLBACK.has(c) && n === 0 && fallbackCount[i] === 0) fillsGap++;
  }
  return addsClear >= scl.length * minShare || fillsGap >= 50;
}

/** Count what an observation adds, so later scenes can be skipped (see worthReading). */
export function countObservation(
  scl: Uint8Array,
  clearCount: Uint8Array,
  fallbackCount: Uint8Array,
) {
  for (let i = 0; i < scl.length; i++) {
    const c = scl[i] as number;
    if (SCL_CLEAR.has(c)) clearCount[i] = Math.min(255, (clearCount[i] as number) + 1);
    else if (SCL_FALLBACK.has(c))
      fallbackCount[i] = Math.min(255, (fallbackCount[i] as number) + 1);
  }
}

/** Median of the first n values of a scratch array (sorted in place). */
export function medianOf(values: Float64Array, n: number): number {
  for (let i = 1; i < n; i++) {
    const v = values[i] as number;
    let j = i - 1;
    while (j >= 0 && (values[j] as number) > v) {
      values[j + 1] = values[j] as number;
      j--;
    }
    values[j + 1] = v;
  }
  const mid = n >> 1;
  return n % 2
    ? (values[mid] as number)
    : ((values[mid - 1] as number) + (values[mid] as number)) / 2;
}

export interface BlockComposite {
  /** Median reflectance × 10 000 per band; 0 where there is no data. */
  red: Uint16Array;
  green: Uint16Array;
  blue: Uint16Array;
  /** Median NDVI as a byte code (ndvi.ts); meaningful only where valid. */
  ndvi: Uint8Array;
  /** 0 no data · 1 from doubtful observations only · 2 from clear observations. */
  valid: Uint8Array;
  /** Clear observations behind each pixel. */
  count: Uint8Array;
}

/**
 * Per-pixel median over the observations whose SCL class is clear; where none
 * is clear, over the doubtful ones; otherwise no data. Bands are reduced
 * independently and NDVI is the median of each observation's own NDVI.
 */
export function compositeBlock(obs: Observation[], size: number): BlockComposite {
  const out: BlockComposite = {
    red: new Uint16Array(size),
    green: new Uint16Array(size),
    blue: new Uint16Array(size),
    ndvi: new Uint8Array(size),
    valid: new Uint8Array(size),
    count: new Uint8Array(size),
  };
  const pick = new Int32Array(obs.length);
  const s = new Float64Array(obs.length);
  for (let i = 0; i < size; i++) {
    let n = 0;
    for (let k = 0; k < obs.length; k++) {
      if (SCL_CLEAR.has((obs[k] as Observation).scl[i] as number)) pick[n++] = k;
    }
    let quality = 2;
    out.count[i] = n;
    if (n === 0) {
      quality = 1;
      for (let k = 0; k < obs.length; k++) {
        if (SCL_FALLBACK.has((obs[k] as Observation).scl[i] as number)) pick[n++] = k;
      }
    }
    if (n === 0) continue;
    for (const band of ['red', 'green', 'blue'] as const) {
      for (let j = 0; j < n; j++)
        s[j] = (obs[pick[j] as number] as Observation).bands[band][i] as number;
      out[band][i] = Math.max(0, Math.round(medianOf(s, n)));
    }
    for (let j = 0; j < n; j++) {
      const b = (obs[pick[j] as number] as Observation).bands;
      const r = Math.max(0, b.red[i] as number);
      const ni = Math.max(0, b.nir[i] as number);
      s[j] = r + ni > 0 ? (ni - r) / (ni + r) : 0;
    }
    out.ndvi[i] = ndviToCode(medianOf(s, n));
    out.valid[i] = quality;
  }
  return out;
}

/** DN → reflectance × 10 000 with the band's offset (−1000 DN for baseline ≥ 04.00). */
export function toReflectance(
  dn: Uint16Array | Uint8Array,
  scale: number,
  offset: number,
): Int16Array {
  const out = new Int16Array(dn.length);
  const shift = Math.round(offset / scale);
  const k = scale * 10_000;
  for (let i = 0; i < dn.length; i++) {
    const v = dn[i] as number;
    // DN 0 is nodata; the SCL already marks it as class 0, so its value is never used.
    out[i] = v === 0 ? 0 : Math.max(-32768, Math.min(32767, Math.round((v + shift) * k)));
  }
  return out;
}

/** True-colour display curve: reflectance × 10 000 → 0–255 (gamma lifts the darks). */
export const STRETCH_MAX = 2800;
export const STRETCH_GAMMA = 1.7;
export const STRETCH_LUT: Uint8Array = (() => {
  const lut = new Uint8Array(10_001);
  for (let v = 0; v <= 10_000; v++) {
    lut[v] = Math.round(255 * Math.min(1, v / STRETCH_MAX) ** (1 / STRETCH_GAMMA));
  }
  return lut;
})();

export function stretch(v: number): number {
  return STRETCH_LUT[Math.min(10_000, Math.max(0, v))] as number;
}
