// A whole-Galicia image of one month (the "Galicia respirando" page fades between them): the
// zoom PREVIEW_ZOOM tiles of the mosaic stitched into one WebP, cut to the bbox. Web Mercator,
// like the tiles; `bounds` gives the lon/lat of its edges so the page can place it.
//
// Small (~1,000 px wide, a few hundred KB), so it lives in the data branch next to the index,
// and also exists for months whose tiles are not on the server (built with --preview-only).

import sharp from 'sharp';
import type { Bbox, Tile } from '../lib/raster.ts';

export const PREVIEW_ZOOM = 9;
const TILE = 256;

const worldX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z * TILE;
const worldY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z * TILE;
};

export interface Preview {
  webp: Buffer;
  width: number;
  height: number;
  /** [west, south, east, north] of the image edges. */
  bounds: [number, number, number, number];
}

export async function previewImage(
  tiles: Array<Tile & { data: Buffer }>,
  bbox: Bbox,
  z = PREVIEW_ZOOM,
): Promise<Preview> {
  const left = Math.floor(worldX(bbox.west, z));
  const right = Math.ceil(worldX(bbox.east, z));
  const top = Math.floor(worldY(bbox.north, z));
  const bottom = Math.ceil(worldY(bbox.south, z));
  const width = right - left;
  const height = bottom - top;
  const layers = tiles
    .filter((t) => t.z === z)
    .map((t) => ({ input: t.data, left: t.x * TILE - left, top: t.y * TILE - top }));
  if (layers.length === 0) throw new Error(`preview: no tiles at zoom ${z}`);
  // Composite onto a canvas larger than the cut, then extract it (sharp needs inputs inside).
  const pad = TILE;
  const canvas = await sharp({
    create: {
      width: width + 2 * pad,
      height: height + 2 * pad,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers.map((l) => ({ ...l, left: l.left + pad, top: l.top + pad })))
    .png()
    .toBuffer();
  const webp = await sharp(canvas)
    .extract({ left: pad, top: pad, width, height })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  return { webp, width, height, bounds: [bbox.west, bbox.south, bbox.east, bbox.north] };
}
