# Fixtures: estado-masas-auga

Servizo: https://ideg.xunta.gal/servizos/rest/services/IDE_DHGC/PHGC2021_2027_Estado/MapServer (gravado 2026-11-01).

`layerN.json`: `N/query?resultOffset=0&resultRecordCount=1000&where=1%3D1&outFields=COD_MASA%2CNOM_MASA%2CNATURALEZA%2CETOTAL%2CEECO%2CEQUIM&outSR=4326&maxAllowableOffset=<t>&geometryPrecision=5&f=geojson`
con t = 0.0003 para N = 2 (costeiras, 29) e 0.0002 para 4 (portos, 7), 3 (transición, 22) e 1
(lagos, 24); t = 0.0005 para 5 (ríos, 412; 1,6 MB). Recortadas á entidade de xeometría máis
curta de cada subcapa, e en ríos a tres: unha peor que bo, unha que non alcanza o bo estado
químico e unha en moi bo estado ecolóxico. O código ES01450 (Punta Langosteira) está en
costeiras e en portos.

Licenza: aviso legal de Augas de Galicia e do IET (aplícase CC BY-SA 4.0, ADR 0005).
Atribución: Augas de Galicia. Plan hidrolóxico Galicia-Costa 2021–2027. Xunta de Galicia.
