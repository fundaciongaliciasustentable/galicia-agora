# Ocupación hoteleira por mes · INE (EOH), Turismo de Galicia e INE (móbiles)

Fonte para o mapa **Ocupación hoteleira por mes e por concello**.

**Semáforo: amarelo.** A ocupación hoteleira mensual **por concello non existe**. A Enquisa de ocupación hoteleira (EOH) do INE dá mes a mes só 10 «puntos turísticos» galegos e 4 «zonas turísticas»; a Axencia de Turismo de Galicia publica a mesma enquisa con 11 puntos (engade Ferrol) e 14 áreas, e enche meses que o INE oculta por segredo. O único dato mensual para os 313 concellos é outra cousa: **turistas contados por teléfonos móbiles** (INE, estatística experimental), que non mide hoteis nin conta os galegos que viaxan dentro da súa provincia.

Verificado con descargas reais o 1 de novembro de 2026.

## Que unidade mensual existe de verdade

| Fonte | Unidade | Unidades galegas | Desde | Último mes | Medidas | Ocos |
|---|---|---|---|---|---|---|
| INE EOH, táboas 2078 e 2076 | Punto turístico (concello) | 10: A Coruña, Santiago, Lugo, Ribadeo, Viveiro, Ourense, O Grove, Pontevedra, Sanxenxo, Vigo | 2005-01 (Pontevedra só desde 2024-01; Lugo e Ourense sen dato en 2011) | 2026-09 | Viaxeiros e noites por residencia; establecementos, prazas, cuartos, grao de ocupación (prazas, cuartos, fin de semana), persoal | Inverno de Viveiro, O Grove, Sanxenxo e Ribadeo con «.»/«..»: p. ex. Viveiro só ten 138 dos 261 meses |
| INE EOH, táboas 2039 e 2013 | Zona turística | 4: Rías Altas, Costa da Morte, Rías Baixas, A Mariña Lucense | 1999-01 | 2026-09 | As mesmas | Case completas (3–4 meses con «.» por zona en 2020) |
| Turismo de Galicia, `EOH_Puntos.csv` | Punto turístico | 11: os 10 do INE + **Ferrol** | 2015-01 | 2026-09 (2026 provisional) | As mesmas, en galego | 201 valores baleiros; enche meses ocultos polo INE |
| Turismo de Galicia, `EOH_Xeodestinos.csv` | «Área turística» | 14, aniñadas (as 4 zonas do INE + 10 áreas máis) | 2012-01 | 2026-09 (2026 provisional) | As mesmas, con decimais (estimacións) | Ningún oco |
| INE, turismo con móbiles, táboa 53464 | Concello de destino principal | **313** (302–313 con dato cada mes; 312 desde 2025) | 2019-07 | 2026-08 | Turistas residentes en España que veñen **doutra provincia** | 14 valores en segredo en toda a serie |
| INE, turismo con móbiles, táboa 52048 | Concello de destino principal | 313 na dimensión; 160–308 con dato cada mes; 3 nunca (Beade, Pontedeva, Vilar de Santos) | 2019-07 | **2025-12** (a táboa non trae 2026) | Turistas residentes no estranxeiro | Moitos concellos pequenos baleiros no inverno |
| IGE, táboa 1826 | Concello | 313 | 2003 (sen 2014–2016) | 1/1/2026 | Establecementos, cuartos e prazas por tipo (orixe: Turismo de Galicia) | Anual, é capacidade e non ocupación. 200 concellos teñen polo menos un hotel en 2026 |

Non hai táboa do IGE coa EOH por concello e mes. O IGE ten «Indicadores de noites por destinos» (táboa 6327: 18 destinos, **anual**, 2011–2024, con porcentaxe de noites en xullo e agosto), non mensual.

Outras fontes revisadas e descartadas para este mapa: INE «Ocupación en alojamientos turísticos» (OAT, plataformas dixitais): só 4 puntos galegos (A Coruña, Santiago, Sanxenxo, Vigo) e 2 zonas, comprobado na táboa anual 48431 (2018–2025); a mensual non se descargou. INE «Viviendas turísticas» (táboa 39363, por municipio, desde 2020): stock de vivendas, non ocupación; periodicidade non comprobada.

## Ficha

| Campo | Valor |
|---|---|
| INE EOH | Operación EOH (id 238 na API Tempus, código 30235). Táboas en `https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/{2078,2076,2039,2013}.csv` (CSV `;`, UTF-8 con BOM, toda España, 5–16 MB cada unha) |
| Composición das zonas INE | Nota metodolóxica de 2009 (https://www.ine.es/daco/daco42/ocuphotel/notaeoh_09.pdf): Costa da Morte 12 concellos (Arteixo … Corcubión), Rías Altas 15 (Mañón … A Coruña), A Mariña Lucense 8 (O Vicedo … Ribadeo), Rías Baixas 31 (Carnota … A Guarda); 66 en total. **Non verificado que siga igual hoxe.** |
| Turismo de Galicia | https://aei.turismo.gal/es/ocupacion-rentabilidad → `https://descargascdn.xunta.gal/interno/smarxa/{EOH_Puntos,EOH_Xeodestinos,ConcellosGalicia_UTF8}.csv` (tamén `.xlsx`; ademais EOH_Categorias, EOH_Orixe, EOH_CaminoSantiago, *_Rendibilidade con ADR e RevPAR, e as mesmas áreas para cámpings, apartamentos e turismo rural). CSV `;`, ISO-8859-1, coma decimal. Last-Modified 23/10/2026. |
| Composición das 14 áreas | **Non publicada** nos ficheiros. `ConcellosGalicia_UTF8.csv` asigna cada un dos 313 concellos a 14 «áreas turísticas», 18 subáreas e 31 xeodestinos, pero os seus nomes non son os 14 do ficheiro EOH (só coinciden Costa da Morte, Mariña Lucense, Rías Altas, Rías Baixas, Ribeira Sacra, Manzaneda-Trevinca e Terras de Ourense e Allariz). As 14 do EOH solápanse: suman 2.525.381 noites en agosto de 2025 fronte a 1.628.780 de Galicia. Oito delas (Rías Altas, Rías Baixas, Costa da Morte, Mariña Lucense, Lugo Central, Ribeira Sacra, Terras de Santiago-Deza e Ourense) suman 1.628.966, Galicia ±0,01 %: parecen unha partición, pero hai que pedirlle a lista a Turismo de Galicia. |
| INE móbiles | Operación «Medición del turismo interno interprovincial a partir de la posición de los teléfonos móviles» (TMOV_I) e «… receptor» (TMOV_R). API Tempus: `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/53464?tv=19:{id}&…&tv=96:16473` (ata 25 concellos por chamada; a táboa enteira dá «No puede mostrarse por restricciones de volumen»). Ids dos concellos en `VALORES_GRUPOSTABLA/53464/111556`. |
| Definición (móbiles) | Nota do INE (https://www.ine.es/prensa/experimental_moviles_turismo_interno.pdf): fonte «los tres grandes operadores de telefonía móvil»; turistas «residentes en España que viajan una provincia diferente de su provincia de residencia, según el destino principal de su viaje»; destino principal = onde se pasan máis noites; o turista cóntase no mes en que remata a viaxe; publícase o municipio «siempre que los resultados sean significativos». Inclúe calquera aloxamento (segundas vivendas, familia), non só hoteis. |
| Licenza INE | Aviso legal (https://www.ine.es/dyngs/AYU/index.htm?cid=125): «Creative Commons Reconocimiento 4.0 (CC BY 4.0)»; cita «Elaboración propia con datos extraídos del sitio web del INE: www.ine.es» se hai tratamento. |
| Licenza Turismo de Galicia | Aviso legal (https://aei.turismo.gal/es/aviso-legal): reutilización «para fines comerciales y no comerciales» con dúas condicións: «Queda prohibida en cualquier circunstancia a desnaturalización del contenido» e «El usuario queda obligado a citar la fuente». Remite a abertos.xunta.gal, onde **non atopei** estes ficheiros nesta ronda (licenza CC non verificada). Os datos de base son do INE. |
| Licenza IGE (1826) | Aviso legal do IGE, como en `ige-nacementos-mortes`. |
| Atribución proposta | «Fonte: INE, Encuesta de Ocupación Hotelera, e Axencia de Turismo de Galicia (aei.turismo.gal)»; para o modo móbiles: «Fonte: INE, Medición del turismo a partir de teléfonos móviles (estatística experimental)» |
| Resolución temporal | Mes |
| Privacidade | Agregados. As celas pequenas xa as oculta o INE; Turismo de Galicia publica algunhas que o INE oculta (ver abaixo): non mostrar establecementos nin persoal nun punto con 1–3 hoteis abertos. |

## Mostra (`mostra/`)

`python3 -I descargar.py` (~40 peticións e 45 MB lidos, ~1 min). Le as series enteiras para medir a cobertura (en `rexistro.json`) pero só garda desde `--desde` (2024 por defecto) para quedar en 1,9 MB.

| Ficheiro | Contido |
|---|---|
| `ine_eoh_puntos_galicia_desde2024.csv` | Táboas 2078 e 2076 filtradas aos 10 puntos galegos, formato longo |
| `ine_eoh_zonas_galicia_desde2024.csv` | Táboas 2039 e 2013, as 4 zonas galegas |
| `turismogalicia_eoh_puntos_desde2024.csv` | 11 puntos, residencia total |
| `turismogalicia_eoh_xeodestinos_desde2024.csv` | 14 áreas, residencia total |
| `turismogalicia_concellos_areas.csv` | 313 concellos con área, subárea, xeodestino e camiños de Santiago |
| `ine_turismo_moviles_concellos_desde2024.csv` | 313 concellos × mes: turistas doutra provincia e turistas estranxeiros |
| `ige_1826_aloxamentos_2026.csv` | Establecementos, cuartos e prazas por tipo e concello, 1/1/2026 |
| `rexistro.json` | URL, bytes, períodos, unidades, contas de valores ocultos e concellos con dato por mes |

## Primeira lectura

- Grao de ocupación por prazas (Turismo de Galicia, xaneiro → agosto de 2025): Viveiro 12,7 → 79,7 %; Ribadeo 13,9 → 69,8 %; Sanxenxo 27,6 → 79,8 %; O Grove 20,2 → 78,8 %; A Coruña 35,7 → 80,2 %; Santiago 34,2 → 75,3 %; Ourense 39,1 → 61,5 %. Zonas do INE en agosto de 2025: Costa da Morte 74,0 %, Rías Baixas 72,7 %, A Mariña Lucense 69,7 %, Rías Altas 68,7 % (xaneiro: 8,3 %, 23,7 %, 16,0 % e 27,8 %).
- Turismo de Galicia e INE coinciden onde os dous publican: noites de agosto de 2025 na Coruña 136.338 e en Sanxenxo 236.894 nos dous; as 4 zonas, idénticas ao centésimo. Pero Turismo de Galicia dá **Sanxenxo, xaneiro de 2025: 6.462 noites**, onde o INE pon «.». A metodoloxía de 2009 do INE di que en Galicia hai «estratos exhaustivos de las cuatro provincias», o que suxire un convenio coa Xunta; non verificado.
- Móbiles, agosto de 2025, turistas doutra provincia: Sanxenxo 99.964, Vigo 70.369, A Coruña 59.022, Santiago 46.783, O Grove 34.717. Mínimos: Beade 83, Vilar de Santos 153, San Amaro 162. Navia de Suarna, sen hoteis na EOH: 474 en xaneiro e 1.549 en agosto.
- Os símbolos «.» e «..» do INE indican dato non publicado; o significado exacto de cada un (segredo ou falta de mostra) non o comprobei.
- O INE ten táboas por puntos que empezan en 2025 (75197 e 75198), coa mesma estrutura (a primeira fila, Vitoria-Gasteiz 2026M09, ten o mesmo valor); non revisei se substitúen as vellas.

## Proposta de mapa

O mapa honesto ten dous modos e non mestura medidas:

1. **«Ocupación hoteleira» (EOH)**, 2015–2026, mes a mes: os 11 puntos de Turismo de Galicia como círculos no concello (cor = grao de ocupación por prazas; tamaño = prazas estimadas), e as 4 zonas do INE como fondo tenue cos seus 66 concellos (lista de 2009, por verificar). O resto de Galicia, en gris e rotulado «sen enquisa por concello». Os meses ocultos van baleiros, non interpolados. Se Turismo de Galicia entrega a composición das 14 áreas, poden substituír as 4 zonas e cubrir toda Galicia.
2. **«Turistas por concello» (móbiles)**, 2019-07–2026-08, 313 concellos: coropleta de turistas doutra provincia por cada 100 habitantes, cos estranxeiros á parte ata 2025-12. Rótulo fixo: «Turistas con móbil, non ocupación hoteleira; non conta quen viaxa dentro da súa provincia».

O que **non** pode ensinar: a ocupación dos hoteis de 302 concellos (non hai enquisa por concello e 113 concellos nin teñen hotel); turismo rural, cámpings e apartamentos por concello (as súas enquisas só chegan a áreas); os veciños de Vigo que pasan o verán en Sanxenxo (mesma provincia, fóra do dato de móbiles); o mes real da estadía no modo móbiles (cóntase ao final da viaxe).
