# INE · Estatística de Migracións e Cambios de Residencia (EMCR)

Fonte para un mapa de **fluxos de residentes entre concellos**.

**Semáforo: amarelo.** Non existe unha matriz pública concello → concello completa. O INE publica táboas por concello só de entradas e saídas (sen orixe-destino) e matrices só entre provincias e comunidades. Os microdatos anuais si traen municipio de orixe e de destino, pero o INE borra o código dos concellos de menos de 10.000 habitantes: en 2024 só 56 dos 313 concellos galegos levan código, e só o 45,4 % das migracións internas de Galicia ten os dous extremos identificados. A matriz completa existe a nivel de **comarca** (53 comarcas), publicada polo IGE a partir dos ficheiros do INE. Para a matriz concello × concello completa haría que pedila ao INE ou ao IGE como explotación a medida (non solicitada).

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Operación INE | https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177098&idp=1254735573002 (código Tempus `EMCR`, Id 455) |
| Metodoloxía | https://www.ine.es/metodologia/meto_emcr_2023.pdf · ficha: https://www.ine.es/dynt3/metadatos/es/RespuestaDatos.html?oper=455 |
| Táboas INE (Tempus) | Por concello, sen orixe-destino: 69743 inmigracións intermunicipais por municipio de destino, 69745 emigracións intermunicipais por municipio de procedencia, 69767 saldos por municipio, 69696 / 69711 inmigración desde / emigración ao estranxeiro por municipio. Orixe-destino: 69742 interprovincial, 69741 interautonómica. CSV: `https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/{taboa}.csv` (69743 = 21,7 MB para toda España). Lista: `https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/EMCR` |
| Microdatos INE | `https://www.ine.es/ftp/microdatos/emcr/datos_{ano}.zip`, anos 2021–2024. Deseño: `https://www.ine.es/ftp/microdatos/emcr/dr_emcr_Desde2021.xlsx`. O servidor acepta `Range` (HTTP 206): pódese ler un só membro do ZIP. |
| Táboas IGE (mesma fonte) | Operación https://www.ige.gal/web/mostrar_actividade_estatistica.jsp?codigo=0201011004&idioma=gl · 10616 comarca orixe × comarca destino (2021–2024) · 10628 / 10629 emigracións / inmigracións por tipo e concello · 10630 saldos · 10631 por sexo · 10632 / 10633 por idade. Serie EVR 1990–2021 na páxina 2 (`&num_pag=2`): 563 comarca × comarca 1992–2021, 186 / 105 / 109 por concello. API: `https://www.ige.gal/igebdt/igeapi/csv/datos/{taboa}/0:{anos}` |
| Formato | Microdatos: ZIP con TXT de ancho fixo, CSV separado por tabulador (`CSV/EMCR_2024.tab`), R, SAS, SPSS, STATA e Parquet. Táboas: CSV (INE ISO-8859-15 con `;`; IGE ISO-8859-1 con `,`). |
| Variables (microdatos) | `SECU_PER, ORDEN, ANYO, TRIM, TIPO_MIGR (IE/EE/MI), SEXO, PAIS_NACIM, PROVNAC, MUNINAC, TAMUNAC, EDAD, ANAC, PAIS_NACIO, PAIS_PROC_DEST, PROVDEST, MUNIDEST, TAMUDEST, PROVPROC, MUNIPROC, TAMUPROC, PAIS_PROC_DEST_IMPUT` |
| Licenza | INE: CC BY 4.0. Aviso legal (https://www.ine.es/dyngs/AYU/index.htm?cid=125): «Creative Commons Reconocimiento 4.0 (CC BY 4.0)», citando «Fuente: Sitio web del INE: www.ine.es». Condicións dos microdatos: citar «al INE como fuente del dato primario». Táboas do IGE: aviso legal do IGE (Lei 37/2007), «Está prohibido desnaturalizar o sentido da información», cita «Fonte: IGE: https://www.ige.gal». |
| Atribución | «Fonte: INE, Estatística de Migracións e Cambios de Residencia (microdatos 2024). Elaboración: Fundación Galicia Sustentable». Para comarcas: «Fonte: IGE a partir da EMCR do INE». Indicar a data de actualización. |
| Resolución temporal | Ano. Os microdatos traen tamén o **trimestre** do movemento (`TRIM`). As táboas, só ano. |
| Resolución territorial | Táboas: concello (só totais de entrada/saída), comarca × comarca (IGE), provincia × provincia (INE). Microdatos: concello × concello só para concellos de máis de 10.000 hab.; o resto queda como «provincia + tamaño do concello». Desde 2025 o INE engade áreas submunicipais de grandes cidades (non comprobado para Galicia). |
| Último período | 2024. IGE: «Última actualización: 27/2/2026». ZIP 2024 do INE: `Last-Modified` 9/6/2026. 2025: non publicado (data prevista non verificada). |
| Frecuencia | Anual. Ficha do INE: resultados definitivos «12 meses después de su fecha de referencia». |
| Tamaño | ZIP de microdatos: 276 MB (2024), 248 MB (2021). O membro CSV pesa 38 MB comprimido e 228 MB sen comprimir (3,7 millóns de migracións en España). O agregado orixe-destino de Galicia por trimestre: 0,9 MB/ano. Táboa IGE 10616: ~155 KB/ano. |
| Quebras | **2020 → 2021.** Ata 2021 había dúas estatísticas: a EVR (Estatística de Variacións Residenciais, explotación directa das altas e baixas no Padrón; microdatos `https://www.ine.es/ftp/microdatos/varires/datos_{ano}.zip` 1988–2021, táboas IGE desde 1990/1992) e a EM (Estatística de Migracións, 2008–2020). Desde 2021 a EMCR reconstrúe os movementos comparando os censos anuais de poboación do 1 de xaneiro e o historial padroal, polo que é coherente cos censos. A ficha do INE di que só hai serie homoxénea desde 2021 («CC2 = 4»). 2021 está nas dúas: migracións internas Galicia → Galicia, EVR 63.743 e EMCR 63.688 (−0,1 %). A diferenza agregada é pequena, pero o método cambia e non se deben unir sen marcar o corte. Os microdatos da EVR tamén borran os concellos de menos de 10.000 hab. (comprobado no deseño `disreg_vr.xlsx`). |
| Conta movementos ou persoas | **Movementos.** Cada fila dos microdatos é unha migración; `SECU_PER` identifica a persoa dentro do ano e `ORDEN` o número de movemento. En 2024 houbo 66.527 migracións Galicia → Galicia feitas por 63.535 persoas distintas (5.452 segundas, 360 terceiras, 28 cuartas ou máis). |
| Privacidade | Sen datos persoais. Segredo estatístico (Lei 12/1989): microdatos anonimizados, concellos pequenos borrados, idade pechada en 90+. Na mostra só se gardan contas agregadas; o 50 % das celas orixe-destino-trimestre internas de Galicia (2.833 de 5.648) ten menos de 3 migracións. Non publicar celas soltas de 1–2 movementos con detalle de idade ou nacionalidade. |

## Mostra (`mostra/`)

`python3 -I descargar.py` (~25 s). Non baixa o ZIP enteiro: le o directorio central cunha petición `Range`, despois descarga só os 38 MB do membro `CSV/EMCR_2024.tab`, descomprímeo en memoria por bloques e queda coas migracións que entran, saen ou se moven dentro de Galicia. `--ano 2021|2022|2023` para outro ano; `--sen-microdatos` só baixa as táboas do IGE (3 MB).

| Ficheiro | Contido |
|---|---|
| `emcr_2024_od_galicia_trimestre.csv` | Agregado propio dos microdatos 2024: `ano, trimestre, tipo (MI/IE/EE), orixe, orixe_nome, destino, destino_nome, migracions`. Concello con código INE de 5 díxitos; os borrados como `15-T1` (provincia 15, tamaño 1 = non capital ata 10.000 hab.); outra comunidade como `ESP-28`; exterior como `estranxeiro`. |
| `ige_10616.csv` | Comarca orixe × comarca destino, 2021–2024 (EMCR) |
| `ige_563.csv` | Comarca × comarca, 2019–2021 (EVR), para comparar o corte |
| `ige_10628.csv`, `ige_10629.csv` | Emigracións e inmigracións por tipo (mesma comarca, outra comarca, outra provincia, outra comunidade, estranxeiro), todos os concellos, 2021–2024 |
| `dr_emcr_Desde2021.xlsx` | Deseño de rexistro e valores válidos (INE) |
| `rexistro.json` | URL, HTTP, bytes, índice do ZIP e contas |

### Primeira lectura (2024)

- Migracións con orixe ou destino en Galicia: 66.527 dentro de Galicia, 43.083 con outra comunidade, 44.190 chegadas do estranxeiro e 16.460 saídas ao estranxeiro.
- O agregado propio dos microdatos dá 66.527 migracións Galicia → Galicia, a mesma cifra que a táboa 10616 do IGE: a extracción cadra.
- Trimestres: T1 18.360, T2 16.012, T3 16.281, T4 15.874.
- Pares de concellos máis grandes: A Coruña → Oleiros 772, A Coruña → Arteixo 647, Ferrol → Narón 638, A Coruña → Culleredo 595, Santiago → Ames 482. É a coroa metropolitana.

## Proposta de mapa

**Reloxo: anos 2021 → 2024** (catro fotogramas), con opción de **trimestres de 2024** desde os microdatos.

- Capa base: fluxos comarca → comarca (matriz completa, 53 × 53) como liñas curvas con grosor proporcional, e o saldo de cada concello (táboa 10630) como cor de fondo. Cada fotograma é un ano.
- Detalle opcional: arcos concello → concello só entre os 56 concellos de máis de 10.000 hab., cos concellos pequenos agrupados en nós «resto da provincia» e etiquetados como tal.
- Un trimestre por fotograma (T1–T4 de 2024) pode mostrar se hai estacionalidade no cambio de residencia; o salto entre trimestres é pequeno, de modo que non hai que esperar un pulso forte.

O que non pode mostrar: rutas nin días concretos; o fluxo exacto entre dous concellos pequenos; os motivos do cambio; quen vive en dous sitios (só conta o cambio de padrón); nin unir antes de 2021 sen marcar a quebra coa EVR. Son movementos, non persoas: unha persoa pode contar dúas veces no mesmo ano.
