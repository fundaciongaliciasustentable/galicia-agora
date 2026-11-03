// Classes of a bivariate map: tercile cut points and the group (0, 1, 2) of a value.

/** Tercile cut points of the values (the 1/3 and 2/3 quantiles). */
export function terciles(values: number[]): [number, number] {
  const v = [...values].sort((a, b) => a - b);
  const at = (q: number) => {
    const i = (v.length - 1) * q;
    const lo = Math.floor(i);
    return (
      (v[lo] as number) +
      ((v[Math.min(v.length - 1, lo + 1)] as number) - (v[lo] as number)) * (i - lo)
    );
  };
  return [at(1 / 3), at(2 / 3)];
}

export function group(x: number, [t1, t2]: [number, number], invert: boolean): 0 | 1 | 2 {
  const g = x <= t1 ? 0 : x <= t2 ? 1 : 2;
  return (invert ? 2 - g : g) as 0 | 1 | 2;
}
