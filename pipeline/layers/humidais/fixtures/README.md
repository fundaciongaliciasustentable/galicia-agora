# Fixtures: humidais

| Ficheiro | Fonte | Gravado |
|---|---|---|
| `page0.json` | https://ideg.xunta.gal/servizos/rest/services/LugaresProtexidos/ENC_InventarioZonasHumidas/MapServer/0/query?resultOffset=0&resultRecordCount=1000&where=1%3D1&outFields=COD_IZHG%2CNOM_IZHG%2CTIP_IZHG%2CCODELEM%2CNOMELEM%2CSUPELEM%2CPUBL_DOG&outSR=4326&maxAllowableOffset=0.0002&geometryPrecision=5&f=geojson | 2026-11-01 |
| `page1.json` | o mesmo con `resultOffset=1000` | 2026-11-01 |

Respostas reais (1.000 elementos con `exceededTransferLimit: true`, 745 KB; e 170 sen el, 86
KB) recortadas: a primeira a dous elementos (un con nome de elemento e outro sen el), a
segunda a un. Como a primeira páxina recortada ten dous elementos, o adaptador pide a
segunda con `resultOffset=2`; a proba serve `page1.json` nesa petición.

Licenza: IET «compatible con CC BY 4.0» / abertos.xunta.gal CC BY-SA 4.0 (aplícase CC BY-SA 4.0, ADR 0005).
Atribución: © Instituto de Estudos do Territorio. Xunta de Galicia.
