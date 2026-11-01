# MODIS MOD13Q1 · NDVI de Galicia cada 16 días

Fonte para o mapa **O verde do ano**.

**Semáforo: amarelo.** Hai un camiño sen chave nin conta (espello de Microsoft Planetary Computer, COG con lectura por rangos) e a licenza de NASA é CC0. Amarelo porque o espello ten ocos: en 2025 faltan os compostos do 12 de xullo ao 1 de novembro (Terra e Aqua) e en 2024 faltan dous de Terra; a orixe oficial (LP DAAC) ten todo pero pide conta Earthdata. Copernicus Land (NDVI 300 m) tamén pide conta.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Produto | MOD13Q1 v6.1 (Terra) e MYD13Q1 v6.1 (Aqua), índices de vexetación 16 días, 250 m. Tesela MODIS h17v04 (cobre toda Galicia). |
| Acceso sen conta | STAC `https://planetarycomputer.microsoft.com/api/stac/v1/search?collections=modis-13Q1-061&bbox=-9.35,41.8,-6.7,43.8` · token SAS anónimo `https://planetarycomputer.microsoft.com/api/sas/v1/token/modiseuwest/modis-061-cogs` (dura ~1 h) · COG `https://modiseuwest.blob.core.windows.net/modis-061-cogs/MOD13Q1/17/04/{AAAADDD}/{id}_250m_16_days_NDVI.tif?{token}`. Sen token o blob responde 409 «Public access is not permitted». |
| Acceso oficial | NASA CMR (metadatos, sen conta): `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=MOD13Q1&version=061&...`. Descarga en `data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/...`: 302 a `urs.earthdata.nasa.gov` (conta Earthdata). Non se creou. |
| Copernicus Land (descartado por agora) | CLMS NDVI 300 m 10 días V3 (`clms_ndvi_global_300m_10daily_v3_cog` no STAC de CDSE, desde 2014-01-21, último 2026-10-11): metadatos abertos, pero a descarga (`download.dataspace.copernicus.eu`) dá 401 sen conta CDSE e o COG é global (1,25 GB por data). Os antigos `globalland.vito.be` non responden. |
| Formato | GeoTIFF optimizado para nube: int16, deflate, sen predictor, teselas internas 512×512, 4.800×4.800 píxeles, proxección sinusoidal MODIS (esfera R = 6.371.007,181 m), dúas vistas reducidas (2.400 e 1.200 px). Lese só co `struct` e `zlib` da biblioteca estándar. |
| Escala | NDVI = valor × 0,0001; −3000 = sen dato. Hai tamén banda `pixel_reliability` e `VI_Quality` (non baixadas na mostra). |
| Licenza | NASA Earthdata Data Use Guidance: «data provided from a NASA-led mission are licensed as Creative Commons Zero (CC0)», co pedido de citar. Condicións propias do Planetary Computer: non verificadas (a páxina `/terms` só carga con JavaScript). |
| Atribución | «MODIS MOD13Q1 v6.1, NASA LP DAAC (doi:10.5067/MODIS/MOD13Q1.061), vía Microsoft Planetary Computer» |
| Resolución temporal | Composto de 16 días; Terra e Aqua desfasados 8 días (co par, un composto cada 8 días) |
| Resolución territorial | 231,7 m (nivel 0); 463 m (nivel 1); 927 m (nivel 2) |
| Último período | Composto Terra 2026-09-30 a 2026-10-15 (no espello; en CMR non comprobado para 2026) |
| Frecuencia | Cada 16 días por satélite, con ~16–20 días de atraso (o composto do 30/9 produciuse o 17/10) |
| Tamaño | NDVI da tesela enteira: 16,5 MB por composto. Recorte do bbox de Galicia en int16: 1,9 MB a 250 m, 0,49 MB a 463 m, 124 kB a 927 m. A mostra enteira baixou 6,3 MB de teselas comprimidas en 71 peticións. Un ano a 250 m: ~45 MB en int16. |
| Quebras | Ocos do espello (arriba). En 2024 o mesmo composto aparece dúas veces (2024-05-08 e 2024-11-16, reprocesados): o script colle o de produción máis recente. Terra e Aqua están ao final da vida útil (data de fin non verificada); a continuidade sería VIIRS (VNP13A1, 500 m), non verificada. |
| Privacidade | Ningunha |

Aviso lateral atopado: o banner de NASA Earthdata di que «Delivery of new Suomi NPP data ceases on Nov. 2, 2026». Afecta a VIIRS S-NPP de `datos/fontes/nasa-firms`, non a MODIS.

## Mostra (`mostra/`)

`python3 -I descargar.py` (80 s, 71 peticións). Opcións: `--ano`, `--nivel` (0, 1, 2), `--satelite MYD13Q1`, `--nivel-ultimo`, `--sen-ultimo`.

| Ficheiro | Contido |
|---|---|
| `ndvi_2024_nivel2.i16` + `.json` | 21 compostos Terra de 2024 a 927 m, recorte 241×257 do bbox de Galicia, int16 little endian apilados; o JSON trae datas, xeotransformación sinusoidal e media de NDVI |
| `ndvi_ultimo_nivel1.i16` + `.json` | Composto 2026-09-30 a 463 m (481×513) |
| `rexistro.json` | Hora UTC, URL sen o token, rango pedido e bytes de cada petición |

Por que 2024 e non 2025: o espello non ten os compostos de verán e outono de 2025 (CMR si os lista). O recorte é o rectángulo do bbox: inclúe parte de Asturias, León, Zamora, norte de Portugal e mar (o mar é −3000).

### Primeira lectura

NDVI medio dos píxeles con valor positivo do recorte en 2024: mínimo 0,59 (18 de febreiro), máximo 0,75 (25 de xuño e 11 de xullo), baixada a 0,69 o 28 de agosto e recuperación a 0,74 en outubro. A vista a 927 m confirma a silueta de Galicia e as manchas escuras de xaneiro (nubes ou neve) na montaña oriental.

## Límites

- Un composto de 16 días colle o mellor píxel do período: non é unha data concreta. Hai que ler `pixel_reliability` para marcar nubes e neve.
- 250 m mestura usos: unha leira, un eucaliptal e unha estrada caben no mesmo píxel.
- NDVI non distingue especies: un eucaliptal e unha carballeira poden ter o mesmo verde.
- O espello pode ter ocos sen aviso: comparar sempre co listado de CMR antes de pechar un ano.
- Vista reducida: método de remostraxe non verificado (para cifras, usar o nivel 0).

## Proposta de mapa

**O verde do ano** (`/pulso/verde/`): Galicia en cor de NDVI, 23 fotogramas do ano (un cada 16 días), co pulso da primavera, o baixón do verán no interior de Ourense e o retorno no outono; un modo «diferenza coa media 2015–2024» resaltaría as secas e os lumes (cruzar coa capa de focos de FIRMS). O que non pode mostrar: o día exacto, a especie ou o uso do solo, nin detalle de leira; os ocos do espello ficarían en branco, nunca interpolados.
