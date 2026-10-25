# Fixtures: comercio-servizos-osm

| Ficheiro | Fonte | Gravado |
|---|---|---|
| `galicia-sample.osm` | https://download.geofabrik.de/europe/spain/galicia-latest.osm.pbf (replicación 2026-10-24T20:20:51Z) | 2026-10-25 |
| `concellos-sample.geojson` | `data-out/concellos-parroquias/data.geojson` (capa publicada, 2026-10-22) | 2026-10-25 |

`galicia-sample.osm`: 11 obxectos reais e os nodos que referencian, sacados con
`osmium getid -r galicia.osm.pbf n1838992725 n1428601768 n5469472519 n1838992766 n2405451923
n2405451918 n4944409973 n1999312165 w26100054 w827065030 r11506841 -o galicia-sample.osm`.
Inclúe un comercio baleiro (`shop=vacant`), unha lonxa fóra do polígono de Sanxenxo (dentro da
tolerancia), un restaurante de Valença (Portugal) e un supermercado multipolígono. O PBF de
proba xérase no test con `osmium cat` e a cabeceira `osmosis_replication_timestamp`.

`concellos-sample.geojson`: Ribadeo, Sanxenxo e Tui (nivel concello).

Licenzas: OSM ODbL 1.0 (© Colaboradores de OpenStreetMap); concellos CC BY-SA 4.0 (IET, Xunta
de Galicia), só para os tests.
