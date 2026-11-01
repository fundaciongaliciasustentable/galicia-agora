// /pulso/estacion/ model: the colour scale of the load rate.

/** Diverging scale centred on 100 % (as many people as residents). */
export const RATE_STOPS: Array<[number, string]> = [
  [60, '#2c7bb6'],
  [85, '#abd9e9'],
  [100, '#f7f7f2'],
  [130, '#fdae61'],
  [180, '#d7191c'],
];

/** Colour of a rate on the diverging scale (linear between stops). */
export function colourOf(v: number, stops: Array<[number, string]> = RATE_STOPS): string {
  const hex = (h: string) => [1, 3, 5].map((k) => Number.parseInt(h.slice(k, k + 2), 16));
  const first = stops[0] as [number, string];
  const last = stops[stops.length - 1] as [number, string];
  if (v <= first[0]) return first[1];
  if (v >= last[0]) return last[1];
  for (let k = 1; k < stops.length; k++) {
    const [v1, c1] = stops[k] as [number, string];
    const [v0, c0] = stops[k - 1] as [number, string];
    if (v <= v1) {
      const f = (v - v0) / (v1 - v0);
      const a = hex(c0);
      const b = hex(c1);
      return `#${a
        .map((x, j) =>
          Math.round(x + ((b[j] as number) - x) * f)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
    }
  }
  return last[1];
}
