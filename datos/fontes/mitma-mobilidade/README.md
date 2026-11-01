# MITMA · Estudos de mobilidade con big data (telefonía móbil)

Fonte para dous mapas: **Galicia en movemento** e **Entradas e saídas das sete cidades**.

**Semáforo: verde.** O dato existe, é aberto, ten hora e concello, e a mostra de Galicia pesa pouco (1,1 MB/día). O período de referencia ten que ser anterior a xullo de 2025 (ver «Quebras»): decidiuse maio de 2025. Os aneis das cidades están decididos (ver ao final) e o cálculo das sete cidades está feito.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Portal | https://www.transportes.gob.es/ministerio/proyectos-singulares/estudios-de-movilidad-con-big-data/opendata-movilidad |
| Servidor de ficheiros | https://movilidad-opendata.mitma.es/ (índice completo en `RSS.xml`, 14.377 ligazóns) |
| Ficheiro usado | `estudios_basicos/por-municipios/viajes/ficheros-diarios/AAAA-MM/AAAAMMDD_Viajes_municipios.csv.gz` |
| Formato | CSV separado por `|`, gzip. Columnas: `fecha, periodo (hora 00–23), origen, destino, distancia, actividad_origen, actividad_destino, estudio_origen_posible, estudio_destino_posible, residencia, renta, edad, sexo, viajes, viajes_km` |
| Zonificación | `zonificacion/relacion_ine_zonificacionMitma.csv` (sección INE → distrito, municipio e GAU de MITMA) |
| Licenza | Licenza de datos abertos do MITMA (3/12/2020), PDF en `LICENCIA de datos abiertos del MITMA 20201203.pdf` no mesmo servidor. Permite uso comercial e non comercial e obras derivadas con outra licenza. |
| Atribución esixida | Datos en bruto: «Datos abiertos MITMA». Datos explotados (o noso caso): **«Basado en datos abiertos MITMA»**, con ligazón a https://www.mitma.es ou á páxina de descarga. Conservar a data de actualización. Non suxerir que o ministerio patrocina a peza. |
| Resolución temporal | Hora (`periodo` 00–23) |
| Resolución territorial | Distritos, municipios ou GAU. En Galicia, a nivel municipal: **313 concellos → 208 zonas**. As sete cidades son zonas propias; 159 concellos rurais van en 54 bloques `_AM` (agrupación de municipios). A nivel distrito hai 291 zonas (A Coruña 10 distritos, Vigo 9, Ferrol e Santiago 6, Lugo, Ourense e Pontevedra 5). |
| Último período publicado | 8/12/2025 (publicado o 23/02/2026) |
| Frecuencia | Mensual ata xuño de 2025 (todos os días). Desde xullo de 2025 só semanas de mostra: 8–10 e 14–17 de agosto, 13–19 de outubro, 6–8 de decembro de 2025. Nada publicado de 2026 a 1/11/2026. |
| Tamaño | Ficheiro nacional municipal: 147–163 MB gzip por día (13–15 millóns de filas). Filtrado a Galicia e agregado a hora × orixe × destino: **1,1–1,2 MB gzip por día** (134.000–148.000 pares). Distritos: 253 MB gzip por día nacional. |
| Privacidade | Datos agregados e anonimizados na orixe. `edad` e `sexo` valen `NA` cando non se dan «por criterios de privacidad». Non hai ningunha fila con menos de 1 viaxe: hai un chan, pero a especificación non publica o limiar. |

## Quebras de serie

A nota do ministerio (`LEEME_CambioMetodología_IndicadoresBigdata_posteriores_a_20250701.pdf`) define tres bloques: feb. 2020–maio 2021, **xan. 2022–xuño 2025** e xullo 2025–actualidade. O cambio de 2025 filtra dispositivos IoT estáticos e sobe as viaxes «lixeiramente», de forma desigual no territorio; non hai un factor de conversión único. Recomendan comparar estruturas (horarios, patróns OD) entre bloques e non volumes. Hai seis días do bloque 2 recalculados coa metodoloxía nova en `estudios_basicos/cambio_metodológico_2025/` para estimar a diferenza.

Ademais, as bases de poboación e renta actualízanse cada 1 de abril.

**Consecuencia:** o mes tipo debe saír do bloque 2 (xan. 2022–xuño 2025), o único con todos os días publicados. Proposta: maio de 2025, sen cambio de hora, sen ponte xeral e lonxe do verán. Ollo: o sábado 17 de maio é Día das Letras Galegas.

## Mostra (`mostra/`)

`python3 -I descargar.py 20250521 20250525` (mércores e domingo), 75 s.

| Ficheiro | Contido |
|---|---|
| `20250521_viaxes_municipios_galicia.csv.gz` | Mércores 21/05/2025, hora × orixe × destino, viaxes con orixe ou destino en Galicia. As zonas de fóra de Galicia van agregadas por provincia (`fora_28` = Madrid). |
| `20250525_viaxes_municipios_galicia.csv.gz` | Domingo 25/05/2025, igual |
| `zonas_municipios_galicia.csv` | Zona MITMA → concellos INE que contén |
| `rexistro.json` | URL, data de descarga, bytes, Last-Modified e contas de cada ficheiro |

O script só usa a biblioteca estándar. Opción `--nivel distritos` para ter os barrios das cidades.

### Primeira lectura (concello estrito, sen aneis)

| Cidade | Mércores: entradas / saídas / internas | Pico de entrada | Domingo: entradas / saídas |
|---|---|---|---|
| A Coruña | 198.965 / 200.375 / 771.092 | 08 h | 141.591 / 128.883 (pico 19 h) |
| Ferrol | 101.364 / 102.138 / 159.182 | 08 h | 72.157 / 71.217 |
| Lugo | 53.502 / 53.760 / 335.090 | 08 h | 49.925 / 42.949 |
| Ourense | 111.274 / 112.070 / 313.814 | 08 h | 94.310 / 86.043 |
| Pontevedra | 116.341 / 117.022 / 232.548 | 08 h | 90.074 / 87.726 |
| Santiago | 144.969 / 145.540 / 345.585 | 08 h | 97.204 / 92.733 |
| Vigo | 195.354 / 195.345 / 947.112 | 08 h | 168.563 / 150.958 (pico 19 h) |

O patrón é coherente (entrada ás 8, saída ás 14 nun mércores; volta ás 19–20 un domingo). Ferrol ten tantas entradas como a metade da súa poboación porque Narón, contiguo, conta como «fóra»: por iso fan falta os aneis.

## Avisos para a peza

- Conta **viaxes**, non persoas. Unha persoa que vai e volve son dúas viaxes.
- Os estudos básicos analizan residentes en España. Os estranxeiros quedan fóra (o ficheiro `residencia` é a provincia INE de residencia). Non se atopou no índice ningún ficheiro con estranxeiros nos estudos básicos.
- O rural sae en bloques: 159 concellos en 54 zonas. Debuxar eses bloques como unha soa área, nunca repartir as viaxes entre os concellos.
- Escala propia por cidade ou porcentaxe sobre residentes (`zonificacion/poblacion.csv`). Non comparar volumes entre cidades.
- Un só día ten anomalías: para a versión final, media de 4 mércores e 4 domingos (8 ficheiros, 9 MB intermedios, uns 80 s por día de descarga).
- O dato preprocesado para o navegador (entradas, saídas e saldo por hora para 7 cidades × 2 tipos de día) son poucos KB. O mapa de fluxos de toda Galicia (208 zonas × 24 h, pares con máis de N viaxes) estimase en 200–500 KB; medir na fase seguinte.
- Actualización automática mensual: **non procede**. A serie nova publícase por semanas soltas e con meses de atraso. A peza será dun período de referencia fixo e a páxina Estado debe dicilo.

## Sete cidades: media de maio de 2025

`python3 -I sete_cidades.py --mercores 20250507 20250514 20250521 20250528 --domingos 20250511 20250518 20250525 20250601`

O domingo 4 de maio (volta da ponte do 1 de maio) substituíuse polo 1 de xuño de 2025, aínda no bloque metodolóxico 2. O nome dos ficheiros segue sendo `maio2025`.

Le os 8 días filtrados (en `bruto/`, fóra do repositorio: 9 MB, uns 80 s de descarga por día con `descargar.py ... --saida bruto`), os aneis de `pipeline/layers/mobilidade-cidades/aneis.json` e a poboación da zonificación MITMA (`zonificacion/poblacion.csv`, só ten `NA` en zonas de Portugal e Francia). O script falla se un anel colle media zona `_AM`.

| Ficheiro | Contido |
|---|---|
| `mostra/sete_cidades_maio2025.json` | 7 cidades × 2 aneis × 2 tipos de día × 24 h: entradas, saídas, saldo e internas (media), residentes e totais por día. **24 KB, 9 KB gzip**: este é o tamaño do dato final para o navegador. |
| `mostra/sete_cidades_maio2025.csv` | O mesmo en táboa plana (equivalente estático da animación) |

Entradas = orixe fóra do anel e destino dentro; saídas, o contrario; internas, as dúas dentro.

### Resultado

| Cidade | Anel | Residentes (MITMA) | Entradas, mércores | % residentes | Presenza extra máxima no día | Entradas, domingo |
|---|---|---|---|---|---|---|
| A Coruña | 0 | 245.468 | 199.696 | 81 % | +20.776 (8 %) | 145.089 |
| A Coruña | 1 | 418.955 | 122.233 | 29 % | +7.782 (2 %) | 125.919 |
| Ferrol | 0 | 64.785 | 102.931 | 159 % | +8.127 (13 %) | 71.220 |
| Ferrol | 1 | 126.788 | 59.178 | 47 % | +3.426 (3 %) | 49.727 |
| Lugo | 0 = 1 | 97.613 | 54.398 | 56 % | +2.424 (2 %) | 47.174 |
| Ourense | 0 | 104.596 | 111.622 | 107 % | +1.686 (2 %) | 88.719 |
| Ourense | 1 | 115.618 | 96.752 | 84 % | 0 | 79.619 |
| Pontevedra | 0 | 83.114 | 117.279 | 141 % | +7.415 (9 %) | 88.337 |
| Pontevedra | 1 | 130.547 | 117.667 | 90 % | +2.261 (2 %) | 99.601 |
| Santiago | 0 | 97.858 | 145.693 | 149 % | +31.908 (33 %) | 96.330 |
| Santiago | 1 | 148.629 | 130.780 | 88 % | +17.747 (12 %) | 105.715 |
| Vigo | 0 | 293.837 | 196.589 | 67 % | +13.402 (5 %) | 158.684 |
| Vigo | 1 | 457.328 | 165.935 | 36 % | +10.553 (2 %) | 156.288 |

«Presenza extra máxima» é o máximo do saldo acumulado ao longo do día (viaxes, non persoas: é unha aproximación). Lecturas:

- O anel 1 fai o que se buscaba: as entradas de Ferrol pasan do 159 % ao 47 % dos residentes ao meter Narón no anel.
- Santiago é a cidade que máis xente gaña no día, en proporción: +33 % no concello, +12 % coa área.
- Ourense case non gaña poboación diúrna (anel 1: o saldo acumulado nunca é positivo). **Revisado o 1/11/2026: é real.** Entre as 5 e as 8 h saen do anel 17.158 viaxes e entran 15.862. O destino principal é o bloque A Merca + San Cibrao das Viñas (4.395 saídas e 2.342 entradas), onde está o polígono industrial de San Cibrao, seguido de Nogueira de Ramuín + O Pereiro de Aguiar. Ourense manda traballadores ao seu cinto industrial ao tempo que recibe os da súa área, e os dous fluxos compénsanse. O IGE dío por outra vía: a taxa de carga diúrna do 2.º trimestre de 2024 é do 102,6 % en Ourense (Lugo 103,4 %, Vigo 102,6 %, A Coruña 105,3 %, Santiago 123,3 %) e do 129,6 % en San Cibrao das Viñas. Se se meten no anel os catro bloques `_AM` veciños (San Cibrao, O Pereiro, Coles, Toén, cos seus compañeiros rurais), a presenza extra máxima queda en 2.100–2.800 viaxes. Non se cambia o anel; a nota de fontes debe explicar que o polo de emprego de Ourense está fóra del.
- **Estabilidade (anel 1):** os catro mércores varían ±2–3 %. Os domingos, ±3–8 % (Santiago o máis estable, Vigo e Ourense os que máis). Co 4 de maio, volta da ponte do 1 de maio, chegaban ao ±10 %: por iso se cambiou polo 1 de xuño.
- Os residentes son os da zonificación MITMA, non o Padrón; a diferenza con INE/IGE debe ir na nota de fontes.

## Aneis das sete cidades (decidido o 1/11/2026)

A zonificación GAU de MITMA (Grandes Áreas Urbanas) serve de punto de partida, pero xunta Vigo e Pontevedra nunha soa área de 14 concellos. Definición aprobada, en dous niveis (códigos INE en `pipeline/layers/mobilidade-cidades/aneis.json`):

- **Anel 0:** só o concello (as sete cidades son zonas MITMA propias en todos os niveis).
- **Anel 1:** concello + área urbana, sempre con zonas MITMA completas (que ningún bloque `_AM` mesture concellos de dentro e de fóra):

| Cidade | Anel 1 | Orixe |
|---|---|---|
| A Coruña | A Coruña, Abegondo, Arteixo, Bergondo, Betanzos, Cambre, Carral, Culleredo, Oleiros, Sada | GAU A Coruña (10) |
| Ferrol | Ferrol, Fene, Mugardos, Narón, Neda | GAU Ferrol (5) |
| Lugo | Lugo | GAU Lugo (1) |
| Ourense | Ourense, Barbadás | GAU Ourense (2). San Cibrao das Viñas, O Pereiro de Aguiar, Toén e Coles non se poden engadir limpos: van en bloques `_AM` con Amoeiro, Nogueira de Ramuín, A Merca e Castrelo de Miño. |
| Pontevedra | Pontevedra, Marín, Poio, Vilaboa | GAU Vigo–Pontevedra, partida |
| Santiago | Santiago de Compostela, Ames, Teo | GAU Santiago (3) |
| Vigo | Vigo, Baiona, Cangas de Morrazo, Gondomar, Moaña, Mos, Nigrán, O Porriño, Redondela, Soutomaior | GAU Vigo–Pontevedra, partida |

Partir a GAU de Vigo–Pontevedra é decisión nosa e hai que dicilo na nota de fontes. Soutomaior podería ir con calquera das dúas.
