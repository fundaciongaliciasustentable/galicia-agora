# Fixtures — rede-natura

Respostas reais do WFS do IEPNB (MITECO, Banco de Datos de la Naturaleza).

- Fonte: https://geoserver.iepnb.es/geoserver/RN2000/ows
- Gravadas: 2026-10-18
- `getcapabilities.xml`: `GetCapabilities` WFS 2.0.0 (mostra da Fase 0, sen cambios).
- `getfeature-galicia.json`: `GetFeature` de `RN2000:rn2000_2024`, outputFormat=application/json,
  srsName=EPSG:4326, propertyName=id_ref,nombre,ids_ccaa_filtro,desc_figura,superficie_ha,geom,
  CQL_FILTER=ids_ccaa_filtro LIKE '%11%'. A resposta real tiña 76 espazos (34 MB); recortouse a
  4 espazos pequenos (Banco de Galicia ZEPA e LIC, Illas Cíes, Veiga de Ponteliñares) e
  axustáronse `numberMatched`/`numberReturned`/`totalFeatures` a 4.

Licenza: aviso legal do MITECO (reutilización citando a fonte).
Atribución: Fuente: MITECO, Banco de Datos de la Naturaleza.
