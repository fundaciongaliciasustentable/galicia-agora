# Fixtures: trafico-balizas-v16

| Ficheiro | Fonte | Gravado |
|---|---|---|
| `datex2_v37.xml` | https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml | 2026-10-24 08:12Z |

Feito a partir das mostras `pipeline/samples/dgt-balizas-v16/v16-espana-2.xml` e
`pipeline/samples/dgt-incidencias/situations-galicia-2.xml` (prefixos ns0–ns5 desas
mostras): cabeceira (`publicationTime` 2026-10-24T10:11:15.501+02:00), as 4 balizas V16
galegas, 2 balizas de fóra de Galicia e 1 incidencia galega que non é V16.

Cambio deliberado: toda referencia `V16_…` substituíuse por `V16_REDACTED-000n`. Non se
gardan identificadores de balizas no repositorio.
