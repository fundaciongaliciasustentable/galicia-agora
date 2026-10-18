# Fixtures — concellos-parroquias

Respostas reais do servizo ArcGIS REST do IET / IDEG, recortadas a poucas entidades.

- Fonte: https://ideg.xunta.gal/servizos/rest/services/LimitesAdministrativos/LimitesAdministrativos/MapServer
- Gravadas: 2026-10-18
- `mapserver.json`: `MapServer?f=json` (mostra da Fase 0, sen cambios).
- `concellos-offset0.json`: `12/query` (outSR=4326, maxAllowableOffset=0.0005, geometryPrecision=5, f=geojson); 3 dos 313 concellos.
- `parroquias-offset0.json`: `18/query` resultOffset=0; 3 das 1.000 parroquias da páxina, conservando `exceededTransferLimit: true`.
- `parroquias-page2.json`: as 2 últimas parroquias da última páxina real (resultOffset=3000, 785 entidades, sen `exceededTransferLimit`); nos tests sérvese como segunda páxina (o adaptador avanza o offset no número de entidades recibidas, 3 no fixture recortado).

Licenza: IET «compatible con CC BY 4.0» / abertos.xunta.gal CC BY-SA 4.0 (aplícase CC BY-SA 4.0, ADR 0005).
Atribución: © Instituto de Estudos do Territorio. Xunta de Galicia.
