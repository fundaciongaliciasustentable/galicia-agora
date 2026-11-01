# Fixtures: zonas-bano

| Ficheiro | Fonte | Gravado |
|---|---|---|
| `count.json` | https://ideg.xunta.gal/servizos/rest/services/IDE_DHGC/PHGC2021_2027_ZProtex_NEuropeo/MapServer/4/query?where=1%3D1&returnCountOnly=true&f=json | 2026-11-01 |
| `find.json` | https://ideg.xunta.gal/servizos/rest/services/IDE_DHGC/PHGC2021_2027_ZProtex_NEuropeo/MapServer/find?searchText=ES&contains=true&searchFields=EUZPROTCOD&layers=4&returnGeometry=true&sr=4326&maxAllowableOffset=0.0002&geometryPrecision=5&f=json | 2026-11-01 |

`find` real (458 zonas, 474 KB) recortado a cinco, as de xeometría máis curta de cada caso:
marítima, continental, continental dada de baixa (2020) e as dúas zonas que comparten
código (unha delas de baixa en 2016). O reconto real era `{"count":458}`; no fixture ponse
5 para que coincida co recorte; `count-real.json` garda o reconto real para probar o fallo por truncado.

Licenza: aviso legal de Augas de Galicia e do IET (aplícase CC BY-SA 4.0, ADR 0005).
Atribución: Augas de Galicia. Xunta de Galicia.
