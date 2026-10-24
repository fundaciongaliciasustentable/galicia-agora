# Fixtures: buses-xunta

`gtfs.zip` (≈2 KB) é un GTFS reducido feito a partir das mostras reais do GTFS dos autobuses
da Xunta descargado do NAP (https://nap.transportes.gob.es/api/Fichero/download/1584, conxunto
1386, actualizado o 16/10/2026) polo fluxo `verify-keys` (`nap`), gardadas en
`pipeline/samples/nap-bus-xunta/gtfs/` (non se suben ao repositorio).

| Ficheiro do ZIP | Orixe |
|---|---|
| `agency.txt` | Real, completo. |
| `routes.txt` | Real: 8 filas sen modificar (rutas 81490011, 81530011, 81530012, 116640011, 102310012, 102640011, 102640012, 116120011). |
| `trips.txt` | Real: ata 2 viaxes por cada unha desas rutas, tomadas de `trips-head.txt` (as primeiras 2.000 filas de `trips.txt`). |
| `calendar.txt` | Real: só os `service_id` desas viaxes. |
| `stops.txt` | Real: 12 paradas sen modificar. |
| `stop_times.txt` | **Construído para o test.** A mostra non inclúe `stop_times.txt` (202 MB). As secuencias usan `trip_id` e `stop_id` reais, escollendo as paradas cuxo nome coincide cos extremos do nome longo da ruta (p. ex. «Ribeira E.A.» e «Noia E.A.»); as horas son inventadas. Dúas paradas (SP36862, SP19945) quedan sen viaxes adrede. |

As filas reais conservan o texto orixinal (BOM incluído); os finais de liña normalizáronse a CRLF.

Licenza: licenza de datos abertos do MITRAMS (https://nap.transportes.gob.es/licencia-datos).
Atribución: Fonte: Xunta de Galicia, vía Punto de Acceso Nacional (MITRAMS). Powered by MITRAMS.
Sen chaves nin datos persoais.
