# Parques eólicos con data de posta en servizo

Fonte para o mapa **Os muíños chegan** (parques eólicos ano a ano).

**Semáforo: amarelo.** A data existe nun rexistro oficial de libre reutilización (MITECO, Electra), pero sen coordenadas nin tecnoloxía: os parques eólicos hai que sacalos polo nome e situalos cruzando con OpenStreetMap (ODbL) ou coa capa de aeroxeradores da IDEG (licenza non declarada). O cruce por nome acerta só en parte e OSM case non ten `start_date`.

Verificado con descargas reais o 1 de novembro de 2026.

## O que xa sabía o repo

`pipeline/sources.yaml`, entrada `eolica` (IDEG, `RecursosEnerxeticos/enerxia_eolica_v2/MapServer`): 5.152 aeroxeradores «en funcionamento, autorizados ou en obras» e 327 nomes de parque, sen MW, sen promotor, sen data e sen licenza declarada. Deixou `parques-eolicos` reservado «para cando exista un rexistro oficial». Electra é ese rexistro, aínda que incompleto para o mapa.

## Ficha

| Campo | MITECO · Electra | OpenStreetMap (Overpass) |
|---|---|---|
| URL | https://energia.serviciosmin.gob.es/Electra/descargarExcelProduccion.aspx (ficha en datos.gob.es: `e05068001-registro-de-productores-de-energia-electrica`) | https://overpass-api.de/api/interpreter |
| Formato | XLSX de 5,3 MB, follas «Instalaciones» (71.727 filas) e «Fases» (72.554 filas). O CSV (`descargarCSVProduccion.aspx`, 4,2 MB) só trae a primeira folla: sen potencia nin datas. | JSON de Overpass |
| Campos | `INSTALACION, POTENCIANETA, POTENCIABRUTA` (kW, coma decimal), `FECHAPUESTASERVICIO, FECHAALTAINSTALACION, FECHABAJA, FECHAALTAPROVISIONAL, ALTAREGISTROOPENDATA, NumeroFase, NumeroRegistro, Autonomia` | `power=plant` + `plant:source=wind` (centro) e `power=generator` + `generator:source=wind`; `name, start_date, operator, plant:output:electricity`… |
| Tecnoloxía | Non hai columna. Filtro por nome (`P.E.`, `PE`, `PARQUE EOLICO`, `AEROGENERADOR`…). | Etiqueta explícita |
| Localización | Só comunidade autónoma | Punto (centro do parque ou cada aeroxerador) |
| Licenza | A páxina de Electra di que o proxecto existe «para su libre reutilización». Licenza específica non atopada (o campo `license` da ficha en datos.gob.es vai baleiro). Por defecto aplican as condicións xerais da AGE (RD 1495/2011): citar a fonte, non desnaturalizar, indicar a data de actualización. | ODbL 1.0: «You are free to copy, distribute, transmit and adapt our data, as long as you credit OpenStreetMap and its contributors», e os derivados van coa mesma licenza. |
| Atribución | «Fonte: Ministerio para a Transición Ecolóxica, Electra (Rexistro de produtores de enerxía eléctrica), actualizado o 27/01/2026» | «© Colaboradores de OpenStreetMap, ODbL» |
| Resolución temporal | Día de posta en servizo por fase | `start_date` cando alguén o mapeou |
| Resolución territorial | Ningunha por baixo da comunidade | Punto |
| Último período | `ALTAREGISTROOPENDATA` = 27/01/2026; último parque galego con data: 2025 | Base OSM de 2026-11-01T10:36:51Z |
| Frecuencia | Non declarada (a última carga é de xaneiro de 2026) | Continua |
| Tamaño | Galicia: 1.320 filas de «Fases», 161 kB en CSV | 173 parques e 4.079 aeroxeradores, 349 kB en CSV |
| Privacidade | Non revisada fóra dos eólicos (nomes de instalación) | Ningunha |

## Mostra (`mostra/`)

`python3 -I descargar.py` (2 min; unha consulta a Overpass e unha descarga de Electra). Os puntos de OSM fóra dos concellos de `data-out/concellos-parroquias/data.geojson` descártanse (o bbox colle Asturias, León e Portugal).

| Ficheiro | Contido |
|---|---|
| `osm_eolica_galicia.csv` | 173 parques e 4.079 aeroxeradores con concello e etiquetas |
| `electra_fases_galicia.csv` | As 1.320 fases galegas de Electra, coa columna engadida `nome_eolico` (1/0) |
| `rexistro.json` | Consulta Overpass, URL, bytes, Last-Modified e contas |

### Primeira lectura

- Electra, Galicia, filtro por nome: 213 fases eólicas, 4.068 MW netos. 54 sen data de posta en servizo (teñen `FECHAALTAINSTALACION`, que se pode usar como aproximación identificada) e 4 con data de baixa.
- Fases por ano de posta en servizo: 1995–2003 entre 0 e 7 ao ano; pico 2004–2007 (13, 18, 10, 24); baixada 2010–2018 (0–5); repunte 2019 (17); 2020–2025, 1–5 ao ano.
- OSM: 173 parques (165 con nome, 124 con potencia), só 13 con `start_date`; ningún dos 4.079 aeroxeradores ten `start_date`.
- Cruce de proba por nome normalizado (sen «Parque eólico», «P.E.», artigos e acentos): 78 dos 165 parques de OSM con nome casan exactamente cun nome de Electra. O resto difire por ampliacións, fases, repotenciacións ou grafía («Adraño (As Paxareiras II-B)» fronte a «P. E. DE PAXAREIRAS II B (ADRAÑO)»).

## Límites

- O filtro por nome pode deixar fóra parques rexistrados co nome da empresa e meter algunha instalación que non sexa eólica: revisar a man as ~200 filas.
- Unha instalación ten varias fases (ampliacións, repotenciacións): o mapa debe contar parques, non filas.
- Sen coordenadas oficiais. A localización vén de OSM (ODbL: a capa resultante sería ODbL) ou da IDEG (licenza non declarada, pendente de preguntar).
- INEGA: non se atopou listado aberto por parque (xa o dicía `sources.yaml`). O seu informe de potencia eléctrica en PDF non se descargou nesta rolda: non verificado.
- RAIPRE: o rexistro estatal publícase precisamente como Electra; non hai outra descarga aberta.

## Proposta de mapa

**Os muíños chegan** (`/pulso/vento/`): un punto por parque (centro de OSM) que acende no ano da súa primeira posta en servizo segundo Electra, co tamaño pola potencia; un contador de MW acumulados ao lado, de 1995 a 2025, e as repotenciacións marcadas cando unha fase nova substitúe a vella. O que non pode mostrar: aeroxeradores individuais no tempo (sen data), parques sen par no cruce (irían nunha lista aparte, sen punto) nin os parques en tramitación (iso é a capa da IDEG, que é outra historia).
