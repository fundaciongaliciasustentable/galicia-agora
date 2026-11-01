// NDVI colour ramp, shared by the tile builder (pipeline) and the map legend
// (site/src/map/styles.ts) so both always say the same thing.

/** [NDVI, colour] stops: water and bare ground in greys and browns, vegetation in greens. */
export const NDVI_STOPS: ReadonlyArray<readonly [number, string]> = [
  [-0.2, '#4f6d84'],
  [0, '#b9ad97'],
  [0.2, '#e3dba8'],
  [0.4, '#a9c86a'],
  [0.6, '#5c9c48'],
  [0.8, '#23683a'],
  [1, '#0e3f22'],
];

function hex(c: string): [number, number, number] {
  const n = Number.parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear interpolation along NDVI_STOPS; values outside the stops take the end colours. */
export function ndviColour(v: number): [number, number, number] {
  const first = NDVI_STOPS[0] as readonly [number, string];
  const last = NDVI_STOPS[NDVI_STOPS.length - 1] as readonly [number, string];
  if (!(v > first[0])) return hex(first[1]);
  if (v >= last[0]) return hex(last[1]);
  for (let i = 1; i < NDVI_STOPS.length; i++) {
    const [b, cb] = NDVI_STOPS[i] as readonly [number, string];
    if (v <= b) {
      const [a, ca] = NDVI_STOPS[i - 1] as readonly [number, string];
      const t = (v - a) / (b - a);
      const x = hex(ca);
      const y = hex(cb);
      return [0, 1, 2].map((k) =>
        Math.round((x[k] as number) + t * ((y[k] as number) - (x[k] as number))),
      ) as [number, number, number];
    }
  }
  return hex(last[1]);
}

/** NDVI stored in one byte: code = round((ndvi + 1) × 100), 0–200. */
export function ndviToCode(v: number): number {
  return Math.round((Math.max(-1, Math.min(1, v)) + 1) * 100);
}

export function codeToNdvi(code: number): number {
  return code / 100 - 1;
}

/** Colour of every byte code (0–200, then clamped), for fast tile painting. */
export const NDVI_LUT: Uint8Array = (() => {
  const lut = new Uint8Array(256 * 3);
  for (let c = 0; c < 256; c++) lut.set(ndviColour(codeToNdvi(Math.min(c, 200))), c * 3);
  return lut;
})();
