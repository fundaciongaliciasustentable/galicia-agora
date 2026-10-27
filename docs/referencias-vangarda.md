# Referentes de vangarda en representación xeográfica

Data: 25/10/2026. Obxectivo: escoller que técnicas poden facer de Galicia Agora un xeito novo de ver o territorio, non só un mapa con máis capas. Este documento recolle referentes e valora o encaixe de cada técnica cos datos e as regras do proxecto. Non se constrúe nada sen decisión.

Método: busca de referentes coñecidos e premiados, e comprobación de cada un (ligazón, técnica, licenza do código ou dos datos). O que non se comprobou nunha fonte primaria márcase **non verificado**, como nos informes de fontes.

## 1. Que entendemos por vangarda aquí

Non se trata de efectos, senón de representacións que **responden unha pregunta que un mapa de capas non responde**:
- **Movemento:** o dato flúe ou viaxa (vento, trens, persoas).
- **Escala humana:** cada edificio, cada lugar ou cada persoa simulada, non medias por concello.
- **Comparación inmediata:** mapa e gráfico na mesma imaxe (o que xa fai `/retrato/`).
- **Tempo comprimido:** un día ou un século nunha soa vista.
- **Outros sentidos:** son e relevo físico cando a cor non chega.

Regras do proxecto que filtran todo: nada de terceiros no navegador (bibliotecas empaquetadas e servidas desde o propio sitio, con ADR se son novas); sen datos persoais; licenza verificada antes de publicar; un dato vello nunca parece actual.

## 2. Catálogo

### A. Fluxos animados de partículas
- **Referente:** *earth* de Cameron Beccario ([earth.nullschool.net](https://earth.nullschool.net); código en [github.com/cambecc/earth](https://github.com/cambecc/earth), licenza **MIT**, comprobada no ficheiro LICENSE). Miles de partículas desprázanse sobre un campo de vento interpolado; o vento vese en vez de lerse en frechas.
- **En Galicia Agora:** vento do modelo WRF de MeteoGalicia a 1 km sobre Galicia, animado. Tamén refachos durante un temporal e, máis adiante, correntes nas rías.
- **Datos:** o servidor THREDDS de MeteoGalicia publica saídas WRF de 1 km en NetCDF ([catálogo d04](https://mandeo.meteogalicia.es/thredds/catalog/modelos/WRF_ARW_1KM_HIST/d04/2025/12/catalog.html), uns 30 MB por día). Variables de vento e condicións de reutilización: **non verificadas**. MeteoGalicia xa está en conflito de licenzas (ADR 0005).
- **Técnica:** campo U/V precalculado no pipeline a unha grella lixeira (PNG ou binario) e partículas en canvas ou WebGL propio, sen dependencias novas.
- **Esforzo:** medio. **Impacto:** moi alto, é a imaxe máis recoñecible da lista.

### B. Montañas de poboación e relevo de datos
- **Referentes:** *Human Terrain* de Matt Daniels para The Pudding (2018), que mostra a densidade de poboación mundial como montañas ([Mapbox](https://blog.mapbox.com/3d-mapping-global-population-density-how-i-built-it-141785c91107), [Nature Index](https://www.nature.com/nature-index/news/human-terrain-map-visualization-earth-population-data-three-dimensions)). Tamén os mapas de agullas de poboación e os de liñas tipo «Joy Division» de Alasdair Rae ([Axios](https://www.axios.com/2020/11/29/world-population-density-3d-map), [Spatial.ly vía R-bloggers](https://www.r-bloggers.com/2017/07/joy-division-population-surfaces-and-pioneering-electronic-cartography/)).
- **Por que:** a altura distingue mellor ca a cor. Galicia cunha poboación dispersa en 36.000 lugares é o caso ideal: unha cordilleira de pequenos picos, non catro cidades.
- **En Galicia Agora:** o «relevo humano» de Galicia, e a súa evolución (1950 fronte a 2025) como dúas cordilleiras superpostas.
- **Datos:** grella de poboación de 1 km² do IGE (xa verificada como fonte; **licenza pendente**). A poboación de `entidades-poboacion` está incompleta e non serve.
- **Técnica:** `fill-extrusion` de MapLibre (xa no proxecto) ou liñas de cresta en SVG ou canvas. Sen dependencias novas.
- **Esforzo:** baixo-medio. **Impacto:** alto.

### C. Granularidade extrema: «cada edificio»
- **Referentes:** *A Map of Every Building in America* (NYT, 2018), con todos os edificios do país en negro sobre branco ([Planetizen](https://planetizen.com/node/101043)), e os mapas de resultados por mesa electoral da NYT ([FlowingData](https://flowingdata.com/2021/02/02/precinct-level-map-of-2020-election-results/)).
- **En Galicia Agora:** «Galicia construída», cada edificio coloreado polo seu ano de construción. Vense os núcleos históricos, o *boom* dos 70 e o feísmo, e o baleirado do interior. Tamén os edificios en zona inundable.
- **Datos:** Catastro INSPIRE, edificios por municipio mediante servizo ATOM ([catastro](https://www.catastro.hacienda.gob.es/webinspire/index.html), [datos.gob.es](https://datos.gob.es/catalogo/e05250001-servicio-de-edificios-inspire)). O ano de construción precisa limpeza ([exemplo de Valencia, UV](https://www.uv.es/dataenhance/datasets/2526020039.html)). Licenza: **non verificada**. Volume: moi grande, xerarase con tippecanoe a PMTiles, como xa se fai.
- **Esforzo:** medio-alto, polo volume. **Impacto:** alto. Ningún medio galego o ten.

### D. Simulación: «un día de»
- **Referentes:** *A Day in the Life of Americans* de Nathan Yau ([FlowingData](https://flowingdata.com/2017/05/17/american-workday/)), onde cada punto é unha persoa simulada que cambia de actividade ao longo do día. Tamén a capa *TripsLayer* de deck.gl, con traxectorias animadas co rastro do movemento ([exemplo](https://developers.google.com/maps/documentation/javascript/examples/deckgl-tripslayer)).
- **En Galicia Agora:** «o pulso do transporte público». Todos os trens e autobuses dun día laborable e dun domingo, en dous minutos. O baleiro do rural ás 15:00 vese sen explicalo.
- **Datos:** GTFS de Renfe (xa descargado e verificado) e da rede de buses da Xunta (capa `buses-xunta`). Non hai datos persoais: son horarios.
- **Técnica:** traxectorias interpoladas desde os horarios no pipeline e animación propia en canvas. deck.gl (MIT) evitaríase: é unha dependencia grande.
- **Esforzo:** medio. **Impacto:** moi alto, e conecta con «distancia aos servizos».

### E. Fluxos orixe-destino
- **Referente:** *FlowmapBlue* de Ilya Boyandin ([arxiv](https://www.arxiv.org/pdf/2110.03662); licenza **MIT** segundo o paquete [flowmapblue](https://cran.r-project.org/web/packages/flowmapblue/refman/flowmapblue.html)). Fluxos agregados que se simplifican ao afastar o mapa.
- **En Galicia Agora:** a quen atrae cada vila cabeceira, de onde veñen as persoas que traballan en Vigo, Santiago ou A Coruña, e mobilidade en verán fronte a inverno.
- **Datos:** estudo de mobilidade con telefonía móbil do Ministerio de Transportes, con datos agregados e anonimizados de máis de 13 millóns de usuarios ([esmartcity](https://www.esmartcity.es/2023/01/17/mitma-publica-nuevos-datos-movilidad-mas-precisos-completos-con-tecnologia-big-data)). Licenza, granularidade municipal e formato: **non verificados**. Ollo: a auditoría deixou fóra a «mobilidade derivada de teléfonos» de provedores comerciais. Este é un dato público agregado, polo que cómpre decisión expresa.
- **Esforzo:** medio. **Impacto:** alto.

### F. Isocronas: ata onde chegas
- **Referente:** *Chronotrains*, que mostra ata onde se chega en tren en 1–8 horas desde calquera estación de Europa ([web](https://chronotrains-com.onrender.com/about), [código](https://github.com/chazgorman/chronotrains); licenza do código **non verificada**).
- **En Galicia Agora:** «ata onde chegas en transporte público nunha hora desde a túa parroquia», ou cando chegas ao hospital se saes ás 8:00. É a versión honesta da distancia en liña recta que publicamos hoxe.
- **Datos:** GTFS de Renfe e buses da Xunta e, para o coche, OSM (Geofabrik, ODbL) con OSRM no servidor.
- **Esforzo:** medio-alto, polo cálculo de rutas. **Impacto:** moi alto para o rural.

### G. Mapa e gráfico na mesma imaxe
- **Referente propio:** `/retrato/`, os 313 concellos movéndose entre o mapa e a distribución. O estudo de 119 historias de NYT e Washington Post atopou menos interacción e máis animación co paso ao móbil e ao scroll ([Cartographic Perspectives](https://cartographicperspectives.org/index.php/journal/article/download/2039/2571/14852)). Vai na liña do retrato.
- **Seguintes pasos:** aplicar a mesma técnica a parroquias (3.700 puntos), ao tempo (como cambia un indicador entre 2015 e 2025, cos puntos movéndose) e a correlacións (os puntos colócanse nun gráfico de dispersión, por exemplo envellecemento fronte a distancia ao hospital).
- **Esforzo:** baixo, porque reutiliza o retrato. **Impacto:** alto.

### H. Raias e glifos de tempo
- **Referente:** as raias de quecemento de Ed Hawkins, nas que cada ano é unha raia de cor fronte á media ([ShowYourStripes, CC BY 4.0](https://www.bespacific.com/?p=98906); licenza tomada dunha fonte secundaria, **pendente de confirmar** na web oficial).
- **En Galicia Agora:** as raias de cada estación meteorolóxica con serie longa, cada unha no seu lugar do mapa. Galicia enteira como un mosaico de raias. A técnica tamén vale para a poboación de cada concello desde 1900 ou para a superficie queimada por ano.
- **Datos:** series históricas de MeteoGalicia e AEMET, e padróns históricos do IGE. Descarga puntual; licenzas **non verificadas**.
- **Esforzo:** baixo. **Impacto:** medio-alto, e compártese moito.

### I. Sonificación
- **Referente:** *Two Trains* de Brian Foo (2015): a liña 2 do metro de Nova York convertida en música, onde a renta de cada barrio decide cantos instrumentos soan ([Hyperallergic](https://hyperallergic.com/data-driven-music-to-for-the-disharmony-of-new-yorks-income-inequality)).
- **En Galicia Agora:** a liña de tren Ourense–Lugo–A Coruña ou unha liña de bus rural «soando» a poboación ou o envellecemento dos lugares que atravesa. Tamén serve de accesibilidade para quen non ve o mapa.
- **Técnica:** Web Audio API do navegador, sen dependencias.
- **Esforzo:** baixo. **Impacto:** medio, experimental, pero memorable.

### J. Nubes de puntos LiDAR en 3D
- **Referente:** PNOA-LiDAR do IGN, nubes de puntos LAZ en follas de 2×2 km ([datos.gob.es](https://datos.gob.es/es/catalogo/e00125901-spaignlidarserie2014)). Licenza: unha presentación do IGN de 2019 indica CC BY 3.0 España; a vixente **non está verificada**.
- **En Galicia Agora:** o monte antes e despois dun lume en 3D, a altura do bosque ou unha aldea vista desde o aire.
- **Técnica:** visor de nubes de puntos (Potree ou similar); sería dependencia nova, con ADR.
- **Esforzo:** alto, polo volume e o visor. **Impacto:** alto, pero só para pezas puntuais.

## 3. Valoración

| Técnica | Datos xa no proxecto | Licenza dos datos | Dependencias novas | Esforzo | Impacto |
|---|---|---|---|---|---|
| G. Mapa e gráfico (máis retrato) | Si | Verificada | Non | Baixo | Alto |
| D. Pulso do transporte | Si (GTFS) | Verificada (Renfe) | Non | Medio | Moi alto |
| H. Raias de tempo | Non | Non verificada | Non | Baixo | Medio-alto |
| B. Relevo humano | Non (grella IGE) | Pendente (IGE) | Non | Baixo-medio | Alto |
| A. Vento animado | Non (WRF) | Non verificada | Non | Medio | Moi alto |
| I. Sonificación | Si | Verificada | Non | Baixo | Medio |
| F. Isocronas | Parcial (GTFS) | Verificada / ODbL | Motor de rutas no servidor | Medio-alto | Moi alto |
| C. Cada edificio | Non (Catastro) | Non verificada | Non | Medio-alto | Alto |
| E. Fluxos O-D | Non (Mitma) | Non verificada | Non | Medio | Alto |
| J. LiDAR 3D | Non | Non verificada | Visor 3D | Alto | Alto (puntual) |

## 4. Proposta de orde

1. **D. Pulso do transporte**, porque usa datos que xa temos verificados e é a peza máis rechamante.
2. **G. Retrato ampliado** (parroquias e dispersión), porque reutiliza o retrato.
3. **Fase 0 de licenzas** para A (MeteoGalicia WRF), B (grella IGE) e C (Catastro): unha xornada, co método de sempre.
4. Despois, segundo o resultado das licenzas: **A. Vento** e **B. Relevo humano**.

## 5. Fontes consultadas

- [cambecc/earth, licenza MIT](https://github.com/cambecc/earth)
- [Esri wind-js (derivado de earth)](https://github.com/gijs/wind-js)
- [Mapbox: How I built Human Terrain](https://blog.mapbox.com/3d-mapping-global-population-density-how-i-built-it-141785c91107)
- [Nature Index: Human Terrain](https://www.nature.com/nature-index/news/human-terrain-map-visualization-earth-population-data-three-dimensions)
- [Axios: Alasdair Rae, densidade en 3D](https://www.axios.com/2020/11/29/world-population-density-3d-map)
- [R-bloggers: Joy Division e superficies de poboación](https://www.r-bloggers.com/2017/07/joy-division-population-surfaces-and-pioneering-electronic-cartography/)
- [Planetizen: Every Building in the United States](https://planetizen.com/node/101043)
- [FlowingData: mapa por mesa electoral 2020](https://flowingdata.com/2021/02/02/precinct-level-map-of-2020-election-results/)
- [Catastro INSPIRE](https://www.catastro.hacienda.gob.es/webinspire/index.html)
- [UV: edificios do Catastro con ano de construción](https://www.uv.es/dataenhance/datasets/2526020039.html)
- [FlowingData: A Day in the Life](https://flowingdata.com/2017/05/17/american-workday/)
- [deck.gl TripsLayer](https://developers.google.com/maps/documentation/javascript/examples/deckgl-tripslayer)
- [FlowmapBlue (arxiv)](https://www.arxiv.org/pdf/2110.03662) e [paquete flowmapblue](https://cran.r-project.org/web/packages/flowmapblue/refman/flowmapblue.html)
- [esmartcity: datos de mobilidade do Mitma](https://www.esmartcity.es/2023/01/17/mitma-publica-nuevos-datos-movilidad-mas-precisos-completos-con-tecnologia-big-data)
- [Chronotrains](https://chronotrains-com.onrender.com/about) e [código](https://github.com/chazgorman/chronotrains)
- [Cartographic Perspectives: mapas na NYT e WaPo](https://cartographicperspectives.org/index.php/journal/article/download/2039/2571/14852)
- [ShowYourStripes (vía beSpacific)](https://www.bespacific.com/?p=98906)
- [Hyperallergic: Two Trains](https://hyperallergic.com/data-driven-music-to-for-the-disharmony-of-new-yorks-income-inequality)
- [MeteoGalicia THREDDS, WRF 1 km](https://mandeo.meteogalicia.es/thredds/catalog/modelos/WRF_ARW_1KM_HIST/d04/2025/12/catalog.html)
- [PNOA-LiDAR en datos.gob.es](https://datos.gob.es/es/catalogo/e00125901-spaignlidarserie2014)
