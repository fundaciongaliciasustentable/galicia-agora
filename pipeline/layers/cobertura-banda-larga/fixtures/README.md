# Fixtures: cobertura-banda-larga

Material real descargado o 2026-10-24 (≈07:40 UTC):

- XLSX: https://digital.gob.es/content/dam/portal-mtdfp/avance-digital/telecomunicacion-e-infraestructuras-digitales/areas_interes/banda-ancha/cobertura/documents/Cobertura_BA_Espa%C3%B1a_2021-2025_MUN_PROV_CCAA_Nacional_datosgob_DEF.xlsx
  (6.546.919 bytes, Last-Modified: Tue, 16 Jun 2026 16:27:24 GMT).
- Páxina: https://digital.gob.es/telecomunicaciones-infraestructuras-digitales/areas-interes/banda-ancha/informacion-cobertura

O XLSX completo (≈6,5 MB) non se garda. En `xlsx/` están membros reais do ZIP, extraídos con
`unzip -p`:

| Ficheiro | Recorte |
|---|---|
| `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `docProps/core.xml` | completos |
| `xl/worksheets/sheet4.xml` (folla `CCAA_%hogar`) | completa |
| `xl/worksheets/sheet2.xml` (folla `Municipio_%hogar`) | cabeceira, fila 1, as dúas primeiras filas de datos (Araba/Álava, para probar o filtro) e as filas de 15 concellos galegos (15001 Abegondo, 15030, 15036, 15078, 15902, 27001, 27028, 27031, 27034 Navia de Suarna, 32001, 32008, 32054, 36038, 36057, 36902 Cerdedo-Cotobade), sen cambiar ningunha fila |
| `xl/sharedStrings.xml` | as 16.365 entradas `<si>` na mesma orde (os índices non cambian); as que non usan sheet2 nin sheet4 recortadas substitúense por `<si/>` |

`informacion-cobertura.html`: só as dúas ligazóns `<a>` a XLSX da páxina de información, copiadas
literalmente dentro dun HTML mínimo.

Os tests montan un ZIP con estes ficheiros usando o `zip` do sistema (se non existe, proban as
funcións de lectura de XML directamente).

Licenza: nota legal do Ministerio (https://digital.gob.es/nota-legal), reutilización citando a fonte.
Atribución: «Fonte: Ministerio para a Transformación Dixital e da Función Pública, cobertura de banda larga».
Sen datos persoais.
