# Fixtures: vento-wrf

Respostas reais do THREDDS de MeteoGalicia gravadas o 2026-11-04 (≈06:40 UTC), sen cambios:

- `catalog.xml`: `https://thredds.meteogalicia.gal/thredds/catalog/wrf_2d_04km/fmrc/files/catalog.xml`.
- `dds.txt`: `…/dodsC/wrf_2d_04km/fmrc/files/20261104/wrf_arw_det_history_d03_20261104_0000.nc4.dds`.
- `coords.txt`, `u.txt`, `v.txt`: o mesmo ficheiro en OPeNDAP ASCII, recortado na petición a 10 × 10
  puntos do centro de Galicia (`[60:1:69][60:1:69]`) e, para u e v, aos pasos 0 e 3 h
  (`[0:3:3]`). A capa pide a malla enteira e 25 pasos.
