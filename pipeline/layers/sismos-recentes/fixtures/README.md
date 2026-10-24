# Fixtures: sismos-recentes

| Ficheiro | Fonte | Gravado |
|---|---|---|
| `emsc-30d.json` | https://www.seismicportal.eu/fdsnws/event/1/query?starttime=2026-09-24…&minlatitude=41.5&maxlatitude=44.5&minlongitude=-10.5&maxlongitude=-6.5&format=json&limit=500 | 2026-10-24 07:09Z |

Resposta real completa (verificación da Fase 1b): 50 eventos, 47 con solución do IGN e 3 da EMSC,
28 con profundidade 0 km (fixada). O caso «sen eventos» (HTTP 204) próbase cun corpo baleiro.

Licenza: CC BY 4.0 (https://www.seismicportal.eu/terms.html). Prohibida a copia masiva da base sen
permiso escrito; este fixture é unha mostra pequena para tests.
Atribución: EMSC-CSEM / Instituto Geográfico Nacional (solucións IGN).
