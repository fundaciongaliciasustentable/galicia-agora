# 0009 — Mosaico mensual de Sentinel-2 (satelite-mes e ndvi-mes)

- Estado: proposta (2026-11-01), pendente de aprobar pola FGS

## Contexto
A investigación de novembro (`docs/investigacion-2026-11/outras-capas-e-satelite.md`, sección C) recomenda un mosaico mensual de Galicia desde os COG públicos de Sentinel-2 L2A en AWS, co catálogo STAC de Element84, sen conta. Cada mes son dous arquivos PMTiles de decenas de MB (cor real e NDVI) e quérense gardar 12 meses.

## Decisión
- **Traballo propio**: `.github/workflows/satelite.yml`, o día 3 de cada mes ás 03:00 UTC (e a man cun mes opcional), constrúe o mes anterior con `pipeline/satelite/cli.ts`. As capas levan `ingest.workflow` en `layer.yaml`, como a ortofoto, e `npm run ingest` sáltaas sempre.
- **Método**: por cadro MGRS, ata 8 escenas coa maior parte limpa (`(1 − nodata) × (1 − nubes)`). Por bloque de 512 px a 20 m léese primeiro a clasificación SCL e só se baixan as bandas das escenas que engaden píxeles limpos (ata 3 vistas por píxel). Clases limpas 4, 5, 6 e 11; 2 e 7 só onde non hai ningunha limpa. Mediana por píxel e banda; NDVI como mediana do NDVI de cada vista. Bandas B02, B03, B04 e B08 da vista reducida de 20 m dos COG. O catálogo xa restou o desprazamento de −1000 da liña base 04.00 (`earthsearch:boa_offset_applied: true`) aínda que `raster:bands` siga dicindo `offset −0,1`: comprobado en píxeles reais (vermello da vexetación ≈ 260, é dicir, 0,026), así que nese caso non se volve aplicar. Reproxección a Web Mercator z13, recorte co contorno de Galicia do IGN, z12–z8 por media, teselas WebP.
- **Ferramentas**: lector COG propio (`pipeline/satelite/cog.ts`, Deflate + predictor, peticións Range) e o escritor PMTiles compartido de `pipeline/lib/raster.ts` (`writePmtiles` sobre `pmtilesPreamble`, agora tamén con WebP). Única dependencia nova declarada: `sharp` 0.34.5 (Apache-2.0), que xa estaba instalada como dependencia opcional de Astro, para codificar WebP. Sen GDAL nin Python.
- **Almacenamento e sitio**: o mesmo mecanismo ca a ortofoto (ADR 0008). Os PMTiles **non van á rama `data`**: o traballo sóbeos por FTPS a `data/<id>/<AAAA-MM>-<hash>.pmtiles` (nome co hash do contido, así un mes reconstruído nunca comparte URL nin caché co vello), comproba por HTTPS que se serven con Range (206, tamaño) e só entón garda na rama `data` `archives.json` e `meta.json`. O `archives.json` ten o formato da ortofoto: `archives` co último mes (o que debuxa o mapa, cos mesmos `prepare.ts` e `archiveSourceId`) e, ademais, `months` cos 12 meses do servidor, o último primeiro, con tamaño, escenas e porcentaxe de ocos. Ao final borra no servidor os arquivos que non están nin no índice novo nin no anterior. A lenda di o mes e a parte de Galicia sen vista limpa; o NDVI leva unha rampla de cor (`pipeline/satelite/ndvi.ts`, compartida co construtor); a ligazón de descarga ofrece o mes que se mostra.
- **Ocos**: onde ningunha escena do mes viu o chan sen nubes, a tesela queda transparente; non se enche co mes anterior. Un mes con máis do 90 % de Galicia sen datos non se publica (queda en `meta.json` como intento fallido).
- **Licenza e recorte**: aviso legal dos datos Copernicus Sentinel; atribución «Contén datos Copernicus Sentinel modificados [ano]» co ano do mes mostrado. O recorte non usa os polígonos do IET (CC BY-SA 4.0, que levarían as capas á colección separada, ADR 0005) senón o contorno de Galicia do IGN: WFS INSPIRE de unidades administrativas (`AU_ADMINISTRATIVEUNIT_34120000000`), «AccessConstraints: CC BY 4.0 ign.es» no GetCapabilities (lido o 01/11/2026), simplificado a ~10 m e gardado en `pipeline/satelite/galicia-ign.geojson` (713 KB; `outline.ts` vólveo xerar). A atribución cita o IGN. Colección **ODbL**.

## Proba (setembro de 2026, 01/11/2026, desde a FGS)
- Setembro ten mellor ceo ca outubro (escenas de cadro con < 20 % de nubes: 51 fronte a 16). 136 escenas no mes; escollidas 71 nos 9 cadros MGRS.
- Ocos: 0,0 % de Galicia sen vista limpa (8 escenas por cadro). En inverno espéranse ocos.
- Tamaños (co contorno do IGN): `satelite-mes` 29,8 MB e `ndvi-mes` 52,5 MB (3.489 teselas cada un, z8–z13). Uns 82 MB ao mes; 12 meses ≈ 1,0 GB no servidor.
- Descarga: 2,66 GB lidos dos COG (só os bloques que tocan Galicia e só as escenas que achegan píxeles limpos). Desde a rede da FGS (~1,2 MB/s) levou 36 min; o cálculo, ~4 min de CPU. No runner de GitHub (AWS ↔ Azure) debería quedar moi por debaixo do límite de 3 h.

## Pendente
- Cota de disco do aloxamento: ~1 GB para 12 meses das dúas capas (medido arriba).
- Selector de mes na interface (agora só se mostra o último; os outros quedan no servidor e en `archives.json`, campo `months`).
