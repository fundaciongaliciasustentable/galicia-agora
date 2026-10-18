# Fixtures — patrimonio

Respostas reais do servizo ArcGIS REST do PBA, capa 2 «BIC. Elementos (xuño 2026)»:
https://ideg.xunta.gal/servizos/rest/services/PBA/Afeccions_PatrimonioCultural/MapServer/2/query
(`where=1=1&outFields=*&outSR=4326&orderByFields=OBJECTID&f=geojson`).

| Ficheiro | Gravado | Contido |
|---|---|---|
| `bic-page1.geojson` | 2026-10-18 (Fase 0) | Consulta real con `resultRecordCount=5`: OBJECTID 1–5, `exceededTransferLimit: true`. Sen modificar. |
| `bic-page2.geojson` | 2026-10-18 | Recorte dunha consulta real completa (664 elementos): 139 elementos a partir do OBJECTID 6, escollidos para cubrir todas as categorías e intereses. Sen `exceededTransferLimit`, para simular a última páxina. Atributos sen modificar. |

Os tests serven estes ficheiros como dúas páxinas (`resultOffset=0` e `resultOffset=5`).

Licenza: dobre declaración da Xunta (CC BY-SA 4.0 en abertos.xunta.gal; «compatible con CC BY 4.0» no IET).
Aplícase a máis restritiva, CC BY-SA 4.0 (ADR 0005): https://abertos.xunta.gal/condicions-de-uso
Atribución: «Xunta de Galicia. Plan Básico Autonómico (PBA), afeccións do patrimonio cultural».
Sen chaves nin datos persoais.
