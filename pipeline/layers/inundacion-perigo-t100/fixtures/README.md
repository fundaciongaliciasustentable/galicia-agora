# Fixtures (real responses, SNCZI WMTS, NZ.Flood.FluvialT100, GoogleMapsCompatible)

- `tile-t100-z12-x1958-y1515.png`: TILEMATRIX=12&TILEROW=1515&TILECOL=1958 (Ourense, Miño). Recorded 2026-10-24, Last-Modified 11 Mar 2026.
- `tile-t100-z12-x1990-y1530.png`: TILEMATRIX=12&TILEROW=1530&TILECOL=1990. Recorded 2026-10-25, Last-Modified 11 Mar 2026. East of the Galicia bbox: the test checks it is never requested.
- `tile-blank.png`: TILEMATRIX=12&TILEROW=1500&TILECOL=1900, a tile with no flood zone. The service answers 200 with this 662-byte fully transparent 256×256 RGBA PNG (no 404).
