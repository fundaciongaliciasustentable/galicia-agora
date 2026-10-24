# Fixtures: avisos-aemet

| Ficheiro | Fonte | Gravado |
|---|---|---|
| `CAP_AFAC71_ATOM.xml` | https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC71_ATOM.xml | 2026-10-24 07:16Z |
| `cap-AFAZ711501COCO2422.xml` | https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/Z_CAP_C_LEMM_20261024063710_AFAZ711501COCO2422.xml | 2026-10-24 07:16Z |
| `cap-verde-AFAZ71VV71GAGA2623.xml` | `Z_CAP_C_LEMM_20261023215001_AFAZ71VV71GAGA2623.xml`, dentro de https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/Z_CAP_C_LEMM_20261024063710_AFAC71.tar.gz | 2026-10-24 07:16Z |

Respostas reais completas (verificación da Fase 1b). O feed tiña dúas entradas: o estado completo
(tar.gz, que o adaptador ignora) e un aviso amarelo de costeiros. O terceiro ficheiro é un CAP de
nivel verde (galernas, sen aviso) extraído a man do tar.gz para probar o descarte; o adaptador non
le tar.gz.

Licenza: nota legal da AEMET (https://www.aemet.es/es/nota_legal), reutilización citando a AEMET.
Atribución: © AEMET. Información elaborada pola Axencia Estatal de Meteoroloxía.
