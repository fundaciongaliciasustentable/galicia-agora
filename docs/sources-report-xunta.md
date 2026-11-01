# Informe de fontes, lote de mapas abertos da Xunta (01/11/2026)

Doce capas novas con datos da Xunta de Galicia: IDEG (servizos ArcGIS REST do IET, de Augas de Galicia e da AXI) e ficheiros de abertos.xunta.gal (`ficheiros-web.xunta.gal/abertos/...`). Cada endpoint chamouse de verdade o 01/11/2026 co User-Agent do proxecto; as entradas están en `pipeline/sources.yaml` (bloque «Lote de mapas abertos da Xunta») e as respostas recortadas, nos `fixtures/` de cada capa.

Todas van á **colección CC BY-SA 4.0** con `odbl_compatible: doubt` (ADR 0005): os ficheiros de abertos declaran CC BY-SA 4.0; os servizos do IDEG teñen o aviso do IET («compatible con CC- BY 4.0 INT») e, os de Augas e a AXI, ademais o aviso xeral da Xunta (cita e sen desnaturalizar). Ningún ten confirmación escrita.

## Capas feitas

| Capa | Fonte | Entidades | Coidados |
|---|---|---|---|
| `praias` | IDEG `CubertaTerrestre/Clasificacion_PRAIAS/0` | 987 | Sen bandeira azul: o campo B_AZUL non ten ano e o CSV de 2026 non casa ben por posición (29 de 118) |
| `desfibriladores` | abertos 0604, CSV do 061 | 2.357 | Sen `solicitante`; fóra 8 domicilios; texto baleiro se repite o nome dunha persoa (18) |
| `sendas-paisaxe` | IDEG `sendas/sendas/0` e `sendas/Camiño_do_Litoral/0` | 318 | Sen pendente (sen unidade) nin fichas PDF (sen URL) |
| `imd-estradas` | IDEG `AXI/MapaTrafico/7` (IMD 2025) | 1.138 | A IMD é estimación: cada treito leva o ano do último aforo; sen estacións de aforo |
| `zonas-bano` | IDEG `IDE_DHGC/PHGC2021_2027_ZProtex_NEuropeo/4` | 442 | `query` sen xeometría: lese con `find`; fóra 16 de baixa; sen calidade da auga |
| `zonas-producion-moluscos` | a mesma, subcapas 2 e 1 | 84 + 71 | Clase do plan, non o estado diario do Intecmar |
| `inundacion-costeira` | IDEG `IDE_DHGC/D2007_60_MapasInundablesCosteiros/3` e `/4` | 56 | Só 28 ARPSI; estudo SNCZI de 2014, ciclo 2015–2021 |
| `estado-masas-auga` | IDEG `IDE_DHGC/PHGC2021_2027_Estado/1–5` | 494 | Só Galicia-Costa; sen subterráneas; ríos encadeados e simplificados |
| `humidais` | IDEG `LugaresProtexidos/ENC_InventarioZonasHumidas/0` | 1.170 | Inventario non é protección; tipoloxía sen lenda |
| `centros-infancia` | abertos 0298, KML do RUEPSS | 575 | Sen correos, teléfonos nin horarios; titular só se é organización (84 baleiros) |
| `puntos-limpos` | abertos 0303, CSV | 151 | Datos de marzo de 2025; sen teléfonos, xestor nin custo |
| `bibliotecas` | abertos 0230, CSV do directorio da RBG | 471 | Fóra 15 sen as dúas coordenadas; sen teléfonos nin correos |

## Achados técnicos

- **IDEG sen xeometría en `query`.** As subcapas 1, 2 e 4 de `PHGC2021_2027_ZProtex_NEuropeo` (e as do plan 2015–2021) devolven `geometry: null`. A operación estándar `find` si dá as formas; o lector (`pipeline/lib/arcgis.ts`) compara o número de resultados co reconto de `query` para non publicar unha descarga truncada.
- **Ríos en anacos.** As masas de auga fluviais chegan en centos de segmentos de dous puntos; encadéanse e simplifícanse (Douglas–Peucker) antes de publicar: de 1,6 MB a ~850 KB.
- **CSV mesturados.** Latin-1 (061), Windows-1252 (puntos limpos), UTF-8 con BOM (bibliotecas, praias); coordenadas en dúas columnas ou «lat,lon» nunha soa. Lector común en `pipeline/lib/csv.ts`.

## Fóra deste lote

- `montes-vecinais`: licenza pendente de decisión da FGS.
- `camaras-meteo`: cargaría imaxes de terceiros no navegador.
- `toponimia-menor`: 538.222 topónimos; precisa teselas vectoriais.
- Bandeira azul 2026: precisa un cruce manual ou unha fonte con código de praia.
