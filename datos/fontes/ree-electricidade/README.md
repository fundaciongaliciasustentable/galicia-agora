# Red Eléctrica · REData (balance eléctrico de Galicia)

Fonte para o mapa **Electricidade hora a hora**.

**Semáforo: vermello para «hora a hora»; amarelo para unha versión mensual.** REData non dá Galicia por horas nin por días: só **mes e ano**, de xaneiro de 2011 a agosto de 2026. O horario existe só para o conxunto nacional (demanda cada 5 minutos) e ESIOS, que ten series «por CCAA», pide chave (403 sen ela; non se pediu). Ademais, o aviso legal de REE só permite publicar «con fines informativos y no con finalidad comercial» e non cede a reutilización: compatible con amosalo no noso sitio, incompatible coa base ODbL e con CC BY.

Verificado con chamadas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| API | https://apidatos.ree.es/{lingua}/datos/{categoría}/{widget}?start_date&end_date&time_trunc[&geo_trunc=electric_system&geo_limit=ccaa&geo_ids=N]. JSON:API, sen chave. Documentación: https://www.ree.es/es/apidatos |
| Galicia | `geo_ids=17` (con `geo_limit=ccaa`). Comprobado co balance de 2024: id 17 = hidráulica 10,1 TWh, eólica 8,9 TWh, demanda 13,9 TWh; id 14 = Navarra (demanda 4,7 TWh); id 20 = La Rioja (1,5 TWh). O despregable da páxina de documentación usa outros números (Galicia = 20): non son `geo_ids`. |
| Granularidade para Galicia | `demanda/evolucion`: hora 400, día 400, mes 200. `generacion/estructura-generacion`: hora 400, día 500, mes 200. `balance/balance-electrico`: hora 400, día **200 pero devolve un só valor mensual**, mes 200. Erro tipo: «Los datos solicitados no están disponibles en este momento». |
| Nacional | `demanda/demanda-tiempo-real` sen xeo: 288 valores por día (cada 5 min; real, prevista e programada). `demanda/evolucion` diaria nacional: 200. `generacion/estructura-generacion` horaria nacional: 400. |
| Período Galicia | Mensual desde 2011-01 (2008–2010 dan 500) ata 2026-08 (188 meses). `last-update` dos meses de 2025: 11/05/2026. |
| Conceptos | Hidráulica, Eólica, Solar fotovoltaica, Otras renovables, Residuos renovables e non renovables, Carbón, Fuel + Gas, Ciclo combinado, Cogeneración, Turbinación e Consumo bombeo, Entrega e Carga batería (desde 2025-11), Saldo almacenamiento, **Saldo de intercambios** (negativo = Galicia exporta), Demanda en b.c. (barras de central). Unidade MWh. |
| Autoconsumo | REE avisa en ree.es que Xeración, Demanda e Balance «no incluyen la energía generada estimada por las instalaciones de autoconsumo» (só o vertido á rede). A fotovoltaica de Galicia sae en 2–3 GWh ao mes. |
| ESIOS | `https://api.esios.ree.es/indicators/1293` sen chave: 403. `/archives`: 403. A lista `/indicators` respondeu 200 unha vez (1.982 indicadores, entre eles «Serie estadística generación … por CCAA», ids 2445–2455, 10519–10522, 10573–10578, e potencia instalada 1475–1491) e despois 403. Granularidade e cobertura deses indicadores: **non verificado, precisa chave**. Decide o usuario. |
| Por central | REData non ten desagregación por central. ESIOS publica programas por unidade de programación, pero con chave: non verificado. Non se atopou fonte aberta horaria por parque eólico ou encoro. |
| Licenza | Non hai licenza propia na páxina da API. Aviso legal de REE (https://www.ree.es/es/aviso-legal, 5.1): o usuario pode «publicarlo en su página web o crear materiales corporativos o académicos siempre que sea con fines informativos y no con finalidad comercial», mencionando a REE como fonte, sen alterar nin desnaturalizar e indicando a data da última actualización; sen logotipos. Fóra diso, prohíbese expresamente a «reproducción, transformación, distribución, comunicación pública, puesta a disposición, extracción, reutilización» sen autorización escrita. Non verificado se ese aviso cobre `apidatos.ree.es` (é o único texto atopado). |
| Compatibilidade | Non comercial e sen cesión de reutilización: **non** compatible con ODbL nin CC BY. Coincide co rexistro de `pipeline/sources.yaml` (`ree-redata`, 24/10/2026). Amosar no noso sitio: si, con cita e data. Ofrecer o dato descargable na base aberta: non, sen autorización escrita. |
| Atribución | «Fonte: Red Eléctrica (REData), balance eléctrico de Galicia; datos actualizados o {last-update}.» |
| Resolución | Mes · Galicia enteira (unha soa forma). |
| Tamaño | 188 meses × ata 19 conceptos = 3.005 filas, 143 KB en CSV. Unha capa final cabe en menos de 50 KB. |
| Privacidade | Agregado autonómico, sen datos persoais. |

## Mostra (`mostra/`)

`python3 -I descargar.py` (35 peticións, ~55 s).

| Ficheiro | Contido |
|---|---|
| `balance_galicia_mensual.csv` | Balance mensual de Galicia 2011-01 a 2026-08 en formato longo: mes; grupo; concepto; MWh. 3.005 filas. |
| `rexistro.json` | Sondas de granularidade por widget, estado por ano, ESIOS sen chave, cláusula do aviso legal e todas as peticións. |

### Primeira lectura

| Ano | Demanda | Eólica | Hidráulica | Carbón | Ciclo comb. | Saldo intercambios |
|---|---|---|---|---|---|---|
| 2011 | 20,0 TWh | 7,4 | 6,2 | 8,1 | 2,2 | −6,3 |
| 2013 | 19,9 | 9,5 | 9,6 | 9,4 | 1,2 | −12,5 |
| 2017 | 19,9 | 6,9 | 3,3 | 10,8 | 1,8 | −6,1 |
| 2021 | 17,6 | 9,6 | 7,7 | 0,5 | 3,7 | −6,3 |
| 2022 | 13,8 | 9,7 | 4,1 | 0,9 | 5,1 | −8,1 |
| 2024 | 13,9 | 8,9 | 10,1 | 0,0 | 2,1 | −8,8 |
| 2025 | 13,7 | 8,6 | 8,4 | 0,0 | 2,6 | −7,0 |
| 2026 (xan–ago) | 10,7 | 5,0 | 5,0 | 0,0 | 1,6 | −1,6 |

- Galicia exporta case todos os meses: só 10 de 188 teñen saldo importador (xuño e agosto de varios anos, abril–xuño de 2026).
- O carbón cae de 12,3 TWh (2012) a cero; último mes con carbón: outubro de 2023.
- A hidráulica oscila co ano hidrolóxico: 3,3 TWh en 2017 fronte a 10,1 en 2024.
- A demanda baixa de 17,6 TWh (2021) a 13,8 (2022) e en 2026 volve subir (xaneiro de 2026: 1,62 TWh fronte a 1,31 en xaneiro de 2025). A causa probable é a gran industria electrointensiva; non verificado.
- Máximo mensual de demanda: marzo de 2018 (1,87 TWh); mínimo: agosto de 2026 (1,01 TWh).

## Proposta de mapa

Co dato que hai, o mapa é **mensual** e dunha soa forma: Galicia. Proposta: o contorno de Galicia **respira** coa demanda de cada mes (2011–2026); dentro, a mestura de xeración como bandas que enchen a forma (eólica, hidráulica, carbón, ciclo, cogeneración); e unha frecha cara ao leste que engrosa co saldo exportador. O espectador ve o fin do carbón, os anos secos e chuviosos e a caída da demanda de 2022. Como contrapunto opcional, unha franxa co pulso horario **nacional** (demanda cada 5 min), rotulada como España, non Galicia.

O que non pode mostrar:
- **Horas nin días** en Galicia. Para iso fai falta ESIOS con chave (e comprobar que as series por CCAA son horarias) ou un permiso de REE.
- **Onde** se xera: nin parques nin encoros, só o total autonómico.
- **A quen** se exporta: o saldo é neto co resto do sistema; non separa Portugal do resto de España.
- **O autoconsumo**, que non está nos datos.
- **Redistribuír o dato** na base aberta: a licenza non o permite sen autorización escrita.
