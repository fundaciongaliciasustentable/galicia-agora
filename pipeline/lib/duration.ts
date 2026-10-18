// Minimal ISO-8601 duration parser for the subset used in layer.yaml (PnDTnHnMnS).

const RE = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

export function parseDuration(iso: string): number {
  const m = RE.exec(iso);
  if (!m || iso === 'P' || iso.endsWith('T')) throw new Error(`Invalid duration: ${iso}`);
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  return ((Number(d) * 24 + Number(h)) * 60 + Number(min)) * 60_000 + Number(s) * 1000;
}
