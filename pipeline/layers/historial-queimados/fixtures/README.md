# Fixtures — historial-queimados

Real responses from Copernicus EFFIS (WFS 2.0, "EFFIS - OGC/WFS Test Service"), recorded with the
GaliciaAgora User-Agent.

- `wfs_capabilities.xml`: GetCapabilities recorded on 2026-10-18 (07:46 UTC) from
  https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=GetCapabilities
  Trimmed: the `<FeatureType>` blocks for `ms:modis.ba.poly.2016` and `.2018`–`.2024` were removed
  so the test only requests the two recorded years. Everything else is unchanged (the original
  lists 2016–2025 plus `season`, `month`, `week`, `today`).
- `modis_ba_poly_2017_galicia.geojson` and `modis_ba_poly_2025_galicia.geojson`: GetFeature recorded
  on 2026-10-24 from
  https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=GetFeature&version=2.0.0&typeNames=ms:modis.ba.poly.YYYY&outputFormat=geojson&bbox=41.8,-9.35,43.8,-6.7,urn:ogc:def:crs:EPSG::4326
  Trimmed to a few features (re-serialised without indentation; properties and coordinates
  unchanged; `numberMatched` still shows the full count: 182 in 2017, 544 in 2025):
  - 2017: five Galician features, one per province plus id 11138 (Carballeda de Avia), whose
    geometry is a GeometryCollection (MultiPolygon + MultiLineString); two outside Galicia
    (Alto Minho, Zamora).
  - 2025: six Galician features (including two of 0–1 ha and id 285659, the latest LASTUPDATE in
    Galicia that year); three outside Galicia (Alto Tâmega MultiPolygon, León, and Alto Minho
    id 288116 with the latest LASTUPDATE of the whole response).

Licence: CC BY 4.0, © European Union (https://forest-fire.emergency.copernicus.eu/about-effis/data-license).
Attribution: © European Union, Copernicus EFFIS (JRC).
