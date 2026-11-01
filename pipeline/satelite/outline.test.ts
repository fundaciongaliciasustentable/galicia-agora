import { describe, expect, it } from 'vitest';
import { loadOutline, parseGmlPolygons, simplifyPolygons, simplifyRing } from './outline.ts';

const GML = `<au:geometry><gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::4326">
<gml:surfaceMember><gml:Polygon gml:id="a"><gml:exterior><gml:LinearRing>
<gml:posList>42 -9 42 -8 43 -8 43 -9 42 -9</gml:posList></gml:LinearRing></gml:exterior>
<gml:interior><gml:LinearRing><gml:posList>42.4 -8.6 42.4 -8.4 42.6 -8.4 42.4 -8.6</gml:posList>
</gml:LinearRing></gml:interior></gml:Polygon></gml:surfaceMember>
<gml:surfaceMember><gml:Polygon gml:id="b"><gml:exterior><gml:LinearRing>
<gml:posList>43.5 -7.5 43.5 -7.4 43.6 -7.4 43.5 -7.5</gml:posList></gml:LinearRing></gml:exterior>
</gml:Polygon></gml:surfaceMember></gml:MultiSurface></au:geometry>`;

describe('IGN outline', () => {
  it('reads GML polygons in lat/lon order as GeoJSON [lon, lat] rings with holes', () => {
    const p = parseGmlPolygons(GML);
    expect(p).toHaveLength(2);
    expect(p[0]?.[0]?.[1]).toEqual([-8, 42]);
    expect(p[0]).toHaveLength(2);
    expect(p[1]?.[0]).toHaveLength(4);
  });

  it('simplifies rings within the tolerance and keeps them closed', () => {
    const ring = [
      [0, 0],
      [0.5, 0.00001],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    const s = simplifyRing(ring, 0.001);
    expect(s).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });

  it('drops polygons whose outer ring collapses', () => {
    const tiny = [
      [
        [0, 0],
        [0.00001, 0],
        [0, 0.00001],
        [0, 0],
      ],
    ];
    expect(simplifyPolygons([tiny], 0.001)).toHaveLength(1);
    const line = [
      [
        [0, 0],
        [0.5, 0],
        [1, 0],
        [0.5, 0.000001],
        [0, 0],
      ],
    ];
    expect(simplifyPolygons([line], 0.001)).toHaveLength(0);
  });

  it('ships an outline of Galicia', async () => {
    const polys = await loadOutline();
    expect(polys.length).toBeGreaterThan(100);
    const lons = polys.flatMap((p) => (p[0] ?? []).map((c) => c[0] as number));
    expect(Math.min(...lons)).toBeGreaterThan(-9.4);
    expect(Math.max(...lons)).toBeLessThan(-6.6);
  });
});
