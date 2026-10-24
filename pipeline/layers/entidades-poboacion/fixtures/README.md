# Fixtures — entidades-poboacion

Respostas reais do servizo ArcGIS REST do IET / IDEG, gravadas o 2026-10-24.

- Fonte: https://ideg.xunta.gal/servizos/rest/services/PBA/EntidadesPoboacion_PBA/MapServer
- `mapserver.json`: `MapServer?f=json`, recortado ás claves que usa o adaptador (descrición, documentInfo, capas).
- `query-offset0.geojson` e `query-page2.geojson`: entidades reais dunha consulta `0/query` (outSR=4326, f=geojson) por OBJECTID/COD_IGRP, escollidas para cubrir todos os tipos (LU, ED, EN, EH, END, NU, PU), un código repetido co mesmo nome (`15022050099` «A Manguela», dúas veces) e o único COD_IGRP mal formado do conxunto (`150780099`, Mallou de Arriba). A primeira páxina conserva `exceededTransferLimit: true` para probar a paxinación.
- `count.json`: forma real de `returnCountOnly=true` (o valor real era 36.190), axustado a 12, o número de entidades dos fixtures.

Licenza: IET «compatible con CC BY 4.0» / abertos.xunta.gal CC BY-SA 4.0 (aplícase CC BY-SA 4.0, ADR 0005).
Atribución: © Instituto de Estudos do Territorio. Xunta de Galicia (PBA).
