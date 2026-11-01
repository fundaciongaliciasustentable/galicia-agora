# INE · Alteraciones de los municipios en los Censos de Población desde 1842

Fonte para o mapa **Un século de poboación** (`/pulso/seculo/`, capa `poboacion-seculo`).

**Semáforo: verde.** Dato oficial por municipio e censo desde 1842, coas alteracións explicadas. Sen descarga masiva, pero a consulta por código funciona e é reproducible.

Verificado con descargas reais o 1 de novembro de 2026.

| Campo | Valor |
|---|---|
| Ferramenta | https://www.ine.es/intercensal/ (axuda: https://www.ine.es/alteraciones/alteraciones_municipios_ayuda.pdf) |
| Consulta | `intercensal.do?search=3&codigoProvincia=PP&codigoMunicipio=MMM` (GET, HTML UTF-8). Códigos 001–449 actuais en 1970, 500–899 desaparecidos 1857–1970, 901–999 creados despois de 1970 |
| Formato | HTML: poboación de feito, de dereito e fogares en cada censo, e notas de alteración |
| Licenza | INE, CC BY 4.0 (aviso legal, verificado o 24/10/2026). Cita: «Elaboración propia con datos extraídos del sitio web del INE: www.ine.es» |
| Resolución | Censo (1842–2021; usamos os 13 de 1900 a 2021) · municipio |
| Tamaño | 472 peticións para Galicia (con 1 s de pausa, ~8 min), 340 municipios; serie final ~220 KB |
| Quebras | Poboación de dereito ata 1991 e residente desde 2001; nos primeiros censos a de dereito conta emigrantes ausentes. Cambios parciais de termo non corrixibles |

## Harmonización aos 313 concellos de hoxe

- Absorbidos, fusionados ou renomeados con código novo (16 desaparecidos 1900–1970, Oza-Cesuras, Cerdedo-Cotobade, Neira de Xusá → Baralla): súmanse ao concello actual.
- Segregados despois de 1900 (Rábade, Negueira de Muñiz, Ribeira de Piquín, Mondariz-Balneario, Pontecesures, Cariño, Burela, A Illa de Arousa): sen dato antes de existir; compáranse xunto co concello matriz.
- Galicia harmonizada: 2.076.858 (1900), máximo 2.813.841 (1981), 2.699.398 (2021).

## Mostra (`mostra/`)

`python3 -I descargar.py`: `censos_galicia.csv` (municipio × censo, feito e dereito), `alteracions_galicia.csv` (notas do INE) e `rexistro.json`.
