# Turismo de Galicia · Vivendas de uso turístico por concello e mes (REAT)

Fonte para o mapa **Pisos turísticos**.

**Semáforo: verde.** O directorio do REAT que usa a capa `vut-concello` non ten data de alta, pero a mesma páxina de Turismo de Galicia publica a **serie mensual** do rexistro: establecementos, habitacións e prazas por mes × concello × tipo desde 2017, coas vivendas de uso turístico desde xuño de 2017 (primeiro mes con VUT na serie). Non é unha reconstrución: as dúas copias antigas do directorio que garda o Internet Archive (01/03/2025 e 01/06/2026) dan exactamente o número da serie neses meses (26.487 e 27.888), e a serie ten meses con baixadas. Polo tanto non ten o sesgo de supervivencia. Condición: a licenza é a do conxunto 0022 de abertos.xunta.gal (CC BY-SA 4.0), que remite a esa páxina; o ficheiro non leva licenza propia.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Conxunto | Rexistro de Empresas e Actividades Turísticas (REAT), Turismo de Galicia. Páxina: https://aei.turismo.gal/es/rexistro-de-empresas-e-actividades-turisticas («Serie mensual de alojamientos turísticos · Fuente Turismo de Galicia», CSV e XLSX). Catálogo: https://abertos.xunta.gal/catalogo/cultura-ocio-deporte/-/dataset/0022/rexistro-empresas-actividades-turisticas |
| Descarga | `https://descargascdn.xunta.gal/interno/smarxa/REAT_Serie_Mensual.csv` (e `.xlsx`). Sen chave. |
| Formato | CSV `;`, Latin-1, cabeceira na primeira liña. 11,1 MB, 152.292 filas. |
| Campos | `TEMPO` (`AAAAMmm`), `CODCON` (código INE do concello), `CONCELLO`, `CODPROV`, `PROVINCIA`, `TIPO` (8 tipos: hoteis, pensións, turismo rural, apartamentos, vivendas turísticas, vivendas de uso turístico, albergues, campamentos), `ESTABLECEMENTOS`, `HABITACIONS`, `PRAZAS` |
| Licenza | abertos.xunta.gal, conxunto 0022: «Creative Commons BY SA 4.0» (lido hoxe na páxina; o RDF declara `dct:license` https://creativecommons.org/licenses/by-sa/4.0/deed.gl). As ligazóns do conxunto levan á páxina do AEI, que lista a serie mensual (comprobado hoxe). Mesmo razoamento ca `vut-concello`. Colección CC BY-SA. |
| Atribución | «Fonte: Turismo de Galicia, Rexistro de Empresas e Actividades Turísticas (REAT), serie mensual, CC BY-SA 4.0» |
| Resolución temporal | Mes (2017M01–2026M10, 118 meses; VUT desde 2017M06) |
| Resolución territorial | Concello (304 con VUT en outubro de 2026), co código INE actual (p. ex. 36902 Cerdedo-Cotobade) |
| Último período | 2026M10 (28.338 VUT, igual ao directorio con data de referencia 01/10/2026) |
| Frecuencia | Mensual |
| Tamaño | 11,1 MB o ficheiro enteiro; só VUT, 1,0 MB en CSV |
| Quebras | Concellos sen VUT nun mes non teñen fila (é cero, non falta). Fusións de concellos (Cerdedo-Cotobade, Oza-Cesuras) xa co código novo. Conta inscricións, non vivendas alugadas. Distinto tipo «Vivendas turísticas» (220 hoxe no directorio, outro tipo do rexistro): non sumar sen avisar. |
| Directorio (`vut-concello`) | `reat_directorio-alojamientos_esp.csv`: 18 columnas, **ningunha con data de alta nin de baixa**. A sinatura (`VUT-CO-013616`) é correlativa por provincia: dá a orde de inscrición pero non a data. Hoxe viven 9.780 das 13.616 sinaturas da Coruña, 13.197 de 17.618 en Pontevedra, 4.285 de 5.066 en Lugo e 1.073 de 1.784 en Ourense (o resto deu de baixa ou non chegou a usarse). Reconstruír o crecemento co directorio actual perdería as baixas: entre o 01/03/2025 e hoxe saíron 2.701 VUT e entraron 4.552. Con esta serie non fai falta. |
| INE (alternativa) | Estatística experimental «Viviendas turísticas en España» (VTE), táboa 39363 por municipio: `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/39363?tv=433:382508&tv=433:382510&tv=3:72&nult=30&tip=AM` (31,5 MB, toda España; 317 códigos galegos, incluídos concellos xa fusionados). 13 períodos: agosto e febreiro de 2020 a 2024, despois novembro de 2024, maio e novembro de 2025, maio de 2026 (cambio de datas de referencia anunciado polo INE). Mide anuncios nas tres plataformas principais por web scraping, non o rexistro. Licenza: aviso legal do INE (https://www.ine.es/dyngs/AYU/index.htm?cid=125), «Creative Commons Reconocimiento 4.0 (CC BY 4.0)». |
| IGE | Non revisado nesta ronda. |
| Privacidade | Unha VUT é un domicilio. A serie xa vén agregada por concello. A mostra do directorio só garda contas por bloque de 1.000 sinaturas, sen nomes, enderezos, teléfonos nin correos. |

## Mostra (`mostra/`)

`python3 -I descargar.py` (11 peticións, ~1 min): serie mensual, directorio actual, as dúas copias do Internet Archive, a táboa do INE e as dúas licenzas.

| Ficheiro | Contido |
|---|---|
| `reat_serie_mensual_vut.csv` | Só VUT: mes, código INE, concello, VUT, habitacións, prazas (29.965 filas) |
| `ine_vte_galicia.csv` | INE VTE, concellos galegos, vivendas e prazas, 13 períodos |
| `reat_sinaturas_vivas_por_bloque.csv` | Sinaturas VUT vivas hoxe por provincia e bloque de 1.000 números |
| `rexistro.json` | Peticións, resumo, comparación coas copias do Internet Archive |

### Primeira lectura

- VUT inscritas en Galicia (outubro de cada ano): 3.620 (2017), 7.107, 9.397, 11.875, 13.799, 16.507, 20.920, 25.488, 28.383 (2025) e 28.338 (2026). Máximo en setembro de 2025 (28.539); desde entón seis meses con baixadas (−399 en xaneiro de 2026).
- Maior crecemento entre outubro de 2019 e outubro de 2026: Sanxenxo 1.666 → 3.304, Vigo 337 → 1.962, A Coruña 355 → 1.308, Vilagarcía 114 → 633, O Grove 295 → 809, Foz 281 → 767.
- Supervivencia no directorio: das primeiras 1.000 sinaturas da Coruña seguen vivas 710; do bloque 11.000–11.999, 891. A orde é a de inscrición, pero sen data.
- INE: 17.361 vivendas anunciadas en maio de 2026 fronte ás 27.759 inscritas no REAT ese mes. A serie do INE baixa de 19.996 (maio de 2025) a 15.236 (novembro de 2025); coincide no tempo co rexistro único estatal de alugueiros de curta duración, pero a causa non está comprobada.

## Proposta de mapa

Coroplético por concello con reloxo de **meses** (xuño de 2017 → outubro de 2026): VUT por 1.000 habitantes (poboación do IGE de cada ano, como `vut-concello`) e un contador de Galicia. Vese o peso das Rías Baixas e da Mariña ao comezo e a subida das cidades (desde 2019 Vigo multiplica por seis e A Coruña por catro). Como capa de contraste, os puntos semestrais do INE (anuncios en plataformas), sempre separados e explicados: rexistro e anuncios non miden o mesmo. O mapa non pode mostrar cantas vivendas se alugan de verdade nin cantos días, nin a oferta sen inscribir; e un concello que baixa pode ser limpeza do rexistro, non menos pisos.
