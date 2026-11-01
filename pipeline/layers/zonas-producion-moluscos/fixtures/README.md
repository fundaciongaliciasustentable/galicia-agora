# Fixtures: zonas-producion-moluscos

Servizo: https://ideg.xunta.gal/servizos/rest/services/IDE_DHGC/PHGC2021_2027_ZProtex_NEuropeo/MapServer (gravado 2026-11-01).

| Ficheiro | Petición |
|---|---|
| `count-zonas.json` | `2/query?where=1%3D1&returnCountOnly=true&f=json` (real: `{"count":84}`; no fixture 3, o tamaño do recorte) |
| `find-zonas.json` | `find?searchText=ES&contains=true&searchFields=EUZPROTCOD&layers=2&returnGeometry=true&sr=4326&maxAllowableOffset=0.0003&geometryPrecision=5&f=json` (318 KB, 84 zonas) recortado a tres: provisional, estacional e clase A, as de xeometría máis curta |
| `count-bateas.json` | `1/query?where=1%3D1&returnCountOnly=true&f=json` (real: `{"count":71}`; no fixture 2) |
| `find-bateas.json` | `find?…&layers=1&…&maxAllowableOffset=0.0001…` (43 KB, 71 polígonos) recortado a dous: clase B e sen clase (código «GAL» incompleto) |

Licenza: aviso legal de Augas de Galicia e do IET (aplícase CC BY-SA 4.0, ADR 0005).
Atribución: Augas de Galicia. Xunta de Galicia.
