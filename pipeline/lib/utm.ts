// Inverse transverse Mercator on GRS80 (ETRS89 UTM → lon/lat), for sources that only ship
// projected coordinates. Snyder's series (USGS PP 1395, eq. 8-18 to 8-25): sub-metre inside
// a zone and a few metres at 6° from the central meridian, which is where Galicia falls in
// zone 30N. Good enough for centroids and points; not for survey work.

const A = 6378137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const DEG = 180 / Math.PI;

/** ETRS89 / UTM northern-hemisphere easting and northing (m) to [lon, lat] in degrees. */
export function utmToLonLat(easting: number, northing: number, zone: number): [number, number] {
  const lon0 = ((zone - 1) * 6 - 180 + 3) / DEG;
  const x = easting - 500000;
  const m = northing / K0;
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const c1 = EP2 * cos1 ** 2;
  const t1 = tan1 ** 2;
  const n1 = A / Math.sqrt(1 - E2 * sin1 ** 2);
  const r1 = (A * (1 - E2)) / (1 - E2 * sin1 ** 2) ** 1.5;
  const d = x / (n1 * K0);
  const lat =
    phi1 -
    ((n1 * tan1) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * EP2 - 3 * c1 ** 2) * d ** 6) / 720);
  const lon =
    lon0 +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * EP2 + 24 * t1 ** 2) * d ** 5) / 120) /
      cos1;
  return [lon * DEG, lat * DEG];
}

/**
 * [lon, lat] in degrees to UTM northern-hemisphere [easting, northing] (m) in the given zone.
 * Forward series of the same source (Snyder eq. 8-9 to 8-13). Sentinel-2 grids are on WGS 84,
 * whose ellipsoid differs from GRS80 by 0.1 mm in the semi-minor axis: the same formulas serve.
 */
export function lonLatToUtm(lon: number, lat: number, zone: number): [number, number] {
  const lon0 = ((zone - 1) * 6 - 180 + 3) / DEG;
  const phi = lat / DEG;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * sin ** 2);
  const t = tan ** 2;
  const c = EP2 * cos ** 2;
  const a = (lon / DEG - lon0) * cos;
  const m =
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi));
  const x =
    K0 *
    n *
    (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t ** 2 + 72 * c - 58 * EP2) * a ** 5) / 120);
  const y =
    K0 *
    (m +
      n *
        tan *
        (a ** 2 / 2 +
          ((5 - t + 9 * c + 4 * c ** 2) * a ** 4) / 24 +
          ((61 - 58 * t + t ** 2 + 600 * c - 330 * EP2) * a ** 6) / 720));
  return [x + 500000, y];
}
