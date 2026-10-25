// MITECO SNCZI flood hazard, fluvial, return period 100 years (WMTS PNG tiles).
// Tiles inside the Galicia bbox are self-hosted as one raster PMTiles archive;
// fully transparent tiles are dropped (the WMTS answers them with a blank PNG).

import { GALICIA_BBOX } from '../../lib/adapter.ts';
import { type WmtsRasterOptions, wmtsRasterAdapter } from '../../lib/raster.ts';

export const WMTS_LAYER = 'NZ.Flood.FluvialT100';

export const TILE_URL =
  'https://wmts-snczi.idee.es/wmts/riesgos-naturales/inundaciones?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  `&LAYER=${WMTS_LAYER}&STYLE=default&FORMAT=image/png&TILEMATRIXSET=GoogleMapsCompatible` +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

/** Tests override the pacing; the defaults are what the ingest uses. */
export function create(over: Partial<WmtsRasterOptions> = {}) {
  return wmtsRasterAdapter({
    tileUrl: TILE_URL,
    bbox: GALICIA_BBOX,
    minzoom: 6,
    maxzoom: 13,
    name: 'inundacion-perigo-t100',
    description: 'SNCZI, peligrosidad por inundación fluvial T = 100 años (ARPSI), Galicia',
    concurrency: 4,
    delayMs: 100,
    logEvery: 500,
    ...over,
  });
}

export default create();
