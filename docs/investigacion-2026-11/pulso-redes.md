# Pulso das redes sociais: fontes avaliadas (Mapas Galicia Sustentable)

Investigación do 01/11/2026. Chamadas reais de só lectura con `curl`/Python/Node desde este Mac, sen contas nin chaves. Ficheiros de proba en
`/private/tmp/claude-501/-Users-perezgulin-Library-CloudStorage-OneDrive-FundacionGaliciaSustentable-00-FGS-00-PROXECTOS-zz-Axenda-Rural-AGADER/16f9ae49-029c-455f-91e5-6b956a0592c1/scratchpad/research/social/`.

Restricións aplicadas: nada de datos persoais (sen nomes de usuario, sen publicacións individuais, sen localizacións de persoas); só agregados por concello/comarca/lugar e tempo con limiares mínimos; descarga no servidor (GitHub Actions) e publicación como ficheiros estáticos; ningún script de terceiros no navegador; só usos que permitan os termos; nada de pago sen preguntar.

## Resumo

| Fonte | Estado HTTP verificado | Agregado por concello e día | Historia 12 meses | Custo | Veredicto |
|---|---|---|---|---|---|
| Wikipedia, vistas de páxina (gl + es) | 200 | Si (vistas/día por artigo) | Si, desde 07/2015 | 0 € | **GO** |
| GDELT DOC 2.0 (noticias) | 200 (429 se >1 petición/5 s) | Si (artigos/día e ton por consulta) | Si: devolveu 335 días con `timespan=12m` (a doc. di 3 meses) | 0 € | **GO** (con desambiguación) |
| GDELT GKG/Events en bruto (15 min) | 200 | Si (lugares xeocodificados ADM1 SP58) | Si, pero ~35.000 ficheiros/ano | 0 € | Condicional (só para o futuro, en continuo) |
| Bluesky, `searchPosts` (AppView) | 200 en `api.bsky.app`; 403 en `public.api.bsky.app` | Si (`hitsTotal` por consulta e día) | Si (probado nov. 2025) | 0 € | **Condicional** (moito ruído de nomes; bo para galego e cidades) |
| Bluesky, Jetstream (tempo real) | 426 en HTTP (=WebSocket correcto); mostra de 45 s OK | Só total por lingua (`langs`), sen lugar | Repetición histórica precisa chave | 0 € | Condicional (contador de galego en vivo) |
| Mastodon (mastodon.gal) | 200 | Non (volume moi pequeno); só total semanal da instancia | 12 semanas (`/instance/activity`), 7 días por cancelo | 0 € | Non para concellos; condicional para un indicador semanal, pedindo permiso á admin |
| OpenStreetMap, edicións | API 0.6: 200 (máx. 100 changesets/consulta, con nomes de usuario); ohsome: 200 metadatos, datos ata 27/07/2026, consulta lenta | Si (contribucións e editores distintos por polígono e mes/día) | Si (ohsome) con ~3 meses de atraso | 0 € | **Condicional/GO** (ODbL) |
| Wikimedia Commons, fotos xeolocalizadas | 200 (ás veces `cirrussearch-too-busy`) | Teoricamente; na práctica ~10–20 fotos/ano por concello | Si | 0 € | Non para diario; como moito anual |
| Flickr | 200 con erro `Invalid API Key` | Contas por bbox e data | Si | Chave gratuíta (non comercial); Pro para algúns usos | Condicional (precisa chave e revisar termos) |
| Reddit (r/galicia) | 403 sen OAuth | Pouco útil (non hai lugar) | Limitado | Gratuíto non comercial con chave; resto, acordo | Non |
| X/Twitter | 401 sen credenciais | Si (Counts) | Si (Counts: All) | De pago: 0,005–0,010 $/petición | Non (sen pagar); custo estimado abaixo |
| Google Trends | Sen API pública (alpha con solicitude); robots.txt prohibe `/trends/explore?` | Só provincia/comunidade, índice relativo | 5 anos (alpha) | — | Non (agás se aceptan na alpha) |
| Meta Content Library (FB/IG) | Só investigadores, en sala limpa | Non se pode publicar o dato en bruto | — | Taxas da sala limpa (non verificadas) | Non |
| TikTok Research API | Só académicos/entidades sen ánimo de lucro de investigación (UE) | — | — | Gratuíto se aproban | Non (fóra de propósito: publicación en mapa) |
| Strava Metro | Só socios (administracións, planificadores) | Fluxos agregados | — | Gratuíto para socios | Non aberto; só se un concello/Xunta o comparte |

---

## 1. Bluesky (AT Protocol)

**Endpoints verificados**
- `GET https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=Lalín&limit=5` → **200**, sen autenticación.
- `https://public.api.bsky.app/...searchPosts` → **403** (Cloudflare). Usar `api.bsky.app`.
- Parámetros `since`, `until`, `lang`, `sort=latest` funcionan; a resposta trae `hitsTotal` (tope **10.000**). `q=*` → 400.
- Mostras (hits 01/11/2025–01/11/2026): Cuntis 520 (gl 27), Silleda 631 (gl 39), Guitiriz 203 (gl 21), "A Mezquita" 116, Boiro 1.497 (gl 48), "Santiago de Compostela" 9.019 (gl 489), Vigo ≥10.000 (gl 4.668). Vigo un día (30/10/2026): 188. Ourense un día: 71 (e 48 o 15/11/2025, polo que hai historia de 12 meses).
- Ruído: "Mos" e "Ares" ≥10.000 (palabras noutras linguas); "Verín" 5.519 (sospeitoso, posiblemente coincidencias sen acentos). "Concello de Mos" baixa a 171.
- `q=e&lang=gl` dun día = 237–241 hits; non é un total fiable de posts en galego (depende do buscador).
- **Xeolocalización**: os rexistros `app.bsky.feed.post` non teñen campo de posición (campos vistos: `text`, `createdAt`, `langs`, `facets`, `embed`). Na mostra de Jetstream, 0 de 2.092 posts tiñan algo semellante. Non hai xeotags: o lugar só pode saír do texto.
- **Jetstream** `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post` → mostra de 45 s (domingo noite): 2.092 posts (≈4 millóns/día), 65 en `es`, **1 en `gl`** (≈1.900/día estimado, moi ruidoso). A repetición histórica (`jetstream-replay`) pide chave de API nas chamadas HTTP; o fío en directo non.

**Agregado posible**
- (a) Total diario de posts con `langs` = `gl` (Jetstream en vivo: un traballo de Actions conectado uns minutos cada hora, extrapolado; ou o fluxo completo nun servidor propio).
- (b) Mencións/día por concello con `searchPosts` + `hitsTotal`, só para concellos con nome inequívoco, entre comiñas e cunha lista de exclusión ("Mos", "Ares", "Oza", "Rois", "Cee", "Baña", "Lousame"...: usar "Concello de X" ou X + Galicia). Custo de recheo: 313 × 365 ≈ 114.000 peticións → con 3.000/5 min, ~3 h repartidas en varias execucións; mellor por semana (16.000 peticións).

**Rate limits**: 3.000 peticións / 5 min por IP en todos os endpoints (https://bsky.network/docs/rate-limits/).

**Termos**
- Developer Guidelines (https://bsky.network/docs/developer-guidelines/): "All services must have a method for deleting content a user has requested to be deleted." Ao publicar só contas agregadas non gardamos contido; non hai cláusula que prohiba publicar estatísticas agregadas.
- ToS (https://bsky.social/about/support/tos): os posts son públicos e pódense amosar noutras apps do AT Protocol.

**Privacidade**: risco baixo se non gardamos texto, DIDs nin URIs; contar ao vóo e descartar. Limiar: non publicar concello-día < 5 (agrupar en semana ou "<5"). Risco de reidentificación nun concello pequeno con 1–2 posts/día: por iso hai que agregar por semana/comarca.

**Veredicto: CONDICIONAL.** Válido para "Bluesky en galego" (total diario) e mencións das 7 cidades + cabeceiras de comarca con nome inequívoco. Non vale para o mapa dos 313 concellos sen moita limpeza.

## 2. Mastodon (instancias galegas)

**Endpoints verificados** (mastodon.gal; `social.galician.gal` e `masto.galiza.social` non existen, 000)
- `/api/v2/instance` → 200: 322 usuarios activos/mes, lingua `gl`.
- `/api/v1/instance/activity` → 200: estados por semana (12 semanas): 1.870, 2.107, 1.943...
- `/api/v1/timelines/public?local=true` → 200: 40 estados cobren ~24 h.
- `/api/v1/tags/galiza` → 200: historial de usos e contas dos últimos **7 días** só.
- `/api/v2/search?type=statuses` sen chave → 200 pero a busca de texto completo require sesión.
- Cabeceiras: `x-ratelimit-limit: 300` (por 5 min).

**Agregado posible**: só o total semanal de publicacións da instancia (xa agregado pola propia instancia) e, como moito, usos diarios de 5–10 cancelos (#galiza, #compostela...). As mencións de concellos serían 0–1 por día: non pasan o limiar.

**Termos/normas**: regras de mastodon.gal (`/api/v1/instance/rules`) e política de privacidade (`/api/v1/instance/privacy_policy`) non din nada sobre recollida por terceiros; a cultura do fediverso rexeita a recollida sen consentimento. Calquera uso pide consultar á admin (@nekerafa) antes.

**Veredicto: NON** para mapa por concello. **Condicional** para un número semanal "actividade en mastodon.gal" se a admin o aproba.

## 3. Wikipedia: vistas de páxina (Wikimedia Analytics API)

**Endpoints verificados**
- `GET https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/gl.wikipedia/all-access/user/Lal%C3%ADn/daily/20251101/20261031` → **200**, 365 días ata o 31/10/2026 (onte). Lalín: gl 1.756 vistas/ano, es 26.706.
- Mensual desde 07/2015 → 200 (historia ~11 anos).
- Correspondencia concello ↔ artigo: Wikidata SPARQL con `wdt:P772` (código INE de 5 díxitos) → **317 códigos** (313 actuais + 4 fusionados: Oza, Cesuras, Cerdedo, Cotobade), todos con artigo en gl e en es.
- Mostra de 12 concellos (ano): gl 364–1.889 vistas (mediana diaria 0–4); es 2.799–33.891 (mediana diaria 7–82). Negueira de Muñiz: gl 759/ano, con días a 0 (a API omite os días a 0: só 356 elementos).

**Agregado posible**: vistas/día por concello (gl, es e suma), agente `user` (exclúe bots coñecidos; tamén existe `automated`). Índice relativo á media anual do propio concello para ver picos (festas, sucesos, eleccións, lume). Actualización diaria (o dato do día D aparece o D+1).

**Rate limits e uso**: User-Agent identificativo obrigatorio ("Clients making requests without a User-Agent header may be blocked without notice"); límites segundo identidade (https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html). 2 × 317 peticións/día, sen problema. Alternativa a granel: https://dumps.wikimedia.org/other/pageview_complete/.

**Licenza**: "Data provided by the API is available under the CC0 1.0 license" (access-policy anterior); o README dos dumps: "All Analytics datasets are available under the Creative Commons CC0 dedication."

**Privacidade**: nula a nivel persoal (contas agregadas por Wikimedia, que xa aplica a súa política). Coidado: as vistas non son "de onde está o lector" senón "que lugar atrae atención". Redireccións non se suman (contar só o título canónico; opcionalmente sumar redireccións principais).

**Veredicto: GO.** É a mellor fonte: aberta, CC0, 313/313 cobertura, 12 meses (e 10 anos), diaria.

## 4. GDELT

**Endpoints verificados**
- DOC 2.0 `https://api.gdeltproject.org/api/v2/doc/doc?query=%22Lalín%22&mode=timelinevolraw&format=json&timespan=12m` → **200**, 335 días (desde 07/11/2025), 458 artigos para Lalín. Con `sourcelang:spanish` Rianxo: 47.
- `mode=timelinetone` → **429** ao repetir antes de 5 s: "Please limit requests to one every 5 seconds".
- GEO 2.0 `api/v2/geo/geo` → **404** (servizo retirado).
- Ficheiros en bruto: `https://data.gdeltproject.org/gdeltv2/lastupdate.txt` e `lastupdate-translation.txt` → 200 (cada 15 min; GKG ~2,9 MB zip en inglés, ~5,2 MB zip traducido). En 4 ficheiros traducidos dunha mañá laborable (1 h): 23 liñas con `SP58` (Galicia) con nome e coordenadas (Pontevedra, Camariñas, Ferrol, Ourense, Fisterra...). Nos ficheiros en inglés: 0. Hai erros de xeocodificación (p. ex. "Ribeira" en 42,92 −7,80).
- Historia en bruto: lista mestra desde 2015 (`masterfilelist.txt`).

**Agregado posible**: artigos/día que mencionan cada concello (DOC, `timelinevolraw`), ton medio diario (`timelinetone`) e, en continuo, conta de lugares xeocodificados en Galicia (GKG traducido) por concello (punto en polígono).
Custo de recheo DOC: 313 consultas × 5 s ≈ 26 min por modo (volume e ton ≈ 1 h): cabe nun traballo de Actions.

**Termos** (https://www.gdeltproject.org/about.html): "available for unlimited and unrestricted use for any academic, commercial, or governmental use of any kind without fee" e "You may redistribute, rehost, republish, and mirror any of the GDELT datasets in any form. However, any use or redistribution of the data must include a citation to the GDELT Project and a link to this website".

**Privacidade**: medios de comunicación, non persoas; publicar só contas e ton. Non publicar titulares/URL (cuestión de dereitos de autor dos medios, non de privacidade).

**Riscos**: nomes ambiguos (Mos, Ares, Oza, Cee, Rois, Ribeira, Boiro ok...), cobertura sesgada a grandes medios; a doc. oficial di 3 meses de xanela, aínda que hoxe devolve ~11 meses: gardar o histórico nós desde o primeiro día.

**Veredicto: GO** con lista de consultas revisada á man (comiñas, "Concello de X", `sourcecountry:spain`).

## 5. Plataformas pechadas ou de pago

- **Google Trends**: sen API pública. Hai unha "Google Trends API Alpha" con solicitude (https://developers.google.com/search/apis/trends: "We're now accepting applications for alpha testers"; 5 anos, rexións e subrexións). `trends.google.com/robots.txt` di `Disallow: /trends/explore?` e os termos de Google (https://policies.google.com/terms) prohiben "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files...)". Bibliotecas tipo pytrends = scraping contra termos. **Non** (opcional: solicitar a alpha; a granularidade sería provincia, non concello).
- **Reddit**: `reddit.com/r/galicia/about.json` sen OAuth → **403**. Data API Terms (https://redditinc.com/policies/data-api-terms, 3.1): "If you are interested in using the Data APIs for commercial purposes, research in excess of rate limits, or for any use that is not expressly permitted ... you will need to enter into a separate agreement with Reddit." Precisa conta e app rexistrada; r/galicia non ten lugar por post. **Non**.
- **X/Twitter**: `api.x.com/2/tweets/counts/recent` → **401**. Prezos actuais por uso (https://docs.x.com/x-api/getting-started/pricing): "Counts: Recent $0.005 per request", "Counts: All $0.010 per request", "Posts: Read $0.005 per resource", tope de 3 millóns de lecturas/mes. Estimación só con Counts (sen ler posts): recheo 313 concellos × 12 meses ≈ 3.800 peticións ≈ **38 $** unha vez; diario 313 × 0,005 $ ≈ 1,6 $/día ≈ **47 $/mes**. Precisa conta de pago e aceptar o Developer Agreement (restrinxe redistribución de contido; contas agregadas son o uso máis defendible, pero hai que revisalo). **Non sen aprobación de gasto**.
- **Meta Content Library (Facebook/Instagram)** (https://developers.facebook.com/docs/content-library-and-api): só investigadores aprobados; a API "supports data analysis in Python and R in Meta's Secure Research Environment, a secure digital cleanroom". Non permite sacar datos para un mapa público automatizado. **Non**.
- **TikTok Research API** (https://developers.tiktok.com/products/research-api/): "Academic institutions in the U.S., EEA, UK, Canada, or Switzerland; or Not-for-profit and/or independent research institution, organization, association, or body in the EU". A FGS podería ser elixible como entidade sen ánimo de lucro, pero é para investigación, non para un panel público con actualización. `open.tiktokapis.com/v2/research/video/query/` → 404 sen token. **Non** (como moito, un estudo puntual).

## 6. Outros sinais abertos e agregados

- **OpenStreetMap, actividade de edición**.
  - API 0.6 `https://api.openstreetmap.org/api/0.6/changesets?bbox=...&time=...` → 200, pero máx. 100 por consulta e inclúe nomes de usuario (non publicar).
  - **ohsome** (HeiGIT) `https://api.ohsome.org/v1/metadata` → 200; datos ata **27/07/2026** (≈3 meses de atraso). `contributions/count` e `users/count` por bbox/polígono e período: unha consulta con período fóra de rango → 404 explicativo; unha consulta mensual válida (Lalín, 07/2025–07/2026) non respondeu en máis de 5 min (servizo lento: facelo por lotes e de noite).
  - Alternativas: ficheiro de changesets (`changesets-latest.osm.bz2`, **8,9 GB**, semanal) para o recheo, e replicación de changesets (`planet.openstreetmap.org/replication/changesets/state.yaml`, minuto a minuto) para o continuo.
  - Licenza: ODbL (atribución "© OpenStreetMap contributors"; https://ohsome.org/copyrights). As contas agregadas son un "Produced Work"; se publicamos a táboa de contas como base de datos, mellor publicala baixo ODbL.
  - Privacidade: contar editores distintos, nunca nomes; limiar ≥3 editores por concello-mes.
  - **Condicional/GO**: "Galicia cartografada": edicións e editores por concello e mes.
- **Wikimedia Commons, fotos xeolocalizadas**: `list=geosearch` → 200 (unha vez `cirrussearch-too-busy-error`), radio máx. 10 km, 500 resultados. Arredor de Lalín (10 km): 212 ficheiros en total, 13 subidos en 2025. Moi pouco para un sinal diario. Licenzas variadas por ficheiro, pero as contas son metadatos. **Non** para diario; posible capa anual.
- **Flickr**: `flickr.photos.search` sen chave → `Invalid API Key`. Precisa conta e chave (gratuíta para uso non comercial). Termos (https://www.flickr.com/help/terms/api): eliminar dentro de 24 h a información que pida o dono e reflectir os cambios a privado. Contar fotos por bbox e data de captura é viable, pero a xeolocalización é de persoas concretas: só contas por concello-mes con limiar ≥10 e sen IDs. **Condicional** (precisa chave; volume a verificar).
- **Strava Metro** (https://metro.strava.com/): "access to Strava Metro is free of charge" para administracións e planificadores, previa solicitude de colaboración; non é aberto nin republicable sen acordo. **Non** (agás convenio cun concello ou coa Xunta).

---

## Capas propostas

### A. «Atención en Wikipedia» — /pulso/atencion/ (GO, prioridade 1)
- **Fonte**: Wikimedia Analytics API, `per-article`, `agent=user`, gl.wikipedia + es.wikipedia; correspondencia INE → artigo por Wikidata (P772), gardada en `datos/` e revisada á man (títulos de es con "(Pontevedra)", etc.).
- **Método**: traballo diario en Actions (≈634 peticións, uns segundos), recheo inicial de 12 meses (e, se se quere, mensual desde 2015). Ficheiro estático por concello-día: `gl`, `es`, `total`. Indicadores: vistas por 1.000 habitantes; índice = vistas do día / mediana móbil de 28 días do concello (resalta picos); ranking semanal.
- **Mapa**: mapa animado de 365 días sobre os polígonos de concellos (como /pulso/vida/), con escala de índice e liña temporal de Galicia; modo "onte".
- **Limiares**: non hai risco persoal; por estabilidade estatística pintar o índice só se a mediana de referencia ≥ 3 vistas/día (se non, agregar en semanas).
- **Licenza**: CC0; citar "Wikimedia Foundation, vistas de páxina".

### B. «Galicia nas noticias» — GDELT (GO, prioridade 2)
- **Fonte**: GDELT DOC 2.0 `timelinevolraw` e `timelinetone` por concello (consulta revisada: `"Nome"` + `sourcecountry:spain` ou "Concello de Nome" nos ambiguos), 1 petición cada 5 s.
- **Método**: recheo de ~11 meses unha vez (≈1 h), despois actualización diaria dos últimos 3 días (313 × 2 × 5 s ≈ 50 min; ou só volume a diario e ton semanal). Gardar o histórico nós porque a API só garante 3 meses. Opcional: proceso continuo do GKG traducido (15 min) para puntos xeocodificados SP58, agregados por concello e día.
- **Mapa**: burbullas por concello (artigos/día) e cor por ton medio; animación semanal.
- **Limiares**: ton só se ≥ 5 artigos na xanela; nada de titulares nin URL.
- **Termos**: libre con cita e ligazón a gdeltproject.org.

### C. «Bluesky en galego» (CONDICIONAL, prioridade 3)
- **Fonte**: Jetstream en directo (sen chave) para o total de posts con `langs` ∋ `gl` (e `es` como referencia), e `searchPosts` + `hitsTotal` para mencións de 7 cidades + cabeceiras de comarca con nome inequívoco.
- **Método**: traballo horario en Actions que escoita 10 min (estimación horaria; ou fluxo completo nun servidor propio, que sería fase de VPS); recheo de 12 meses só para as mencións por `searchPosts` (por día para cidades, por semana para o resto). Non gardar texto, DIDs nin URIs: só contadores.
- **Mapa/gráfica**: liña diaria "posts en galego en Bluesky" + mapa de comarcas por mencións semanais.
- **Limiares**: ≥ 10 mencións por unidade-semana para pintar; ≥ 5 para concello-día nas cidades; "<5" no resto.
- **Advertencia no mapa**: a lingua é a que marca a app de quen publica (autodeclarada) e Bluesky non ten xeolocalización: é "de que lugares se fala", non "onde se publica".

**Descartadas para o mapa**: Mastodon (pouco volume; consultar a admin para un dato semanal), Reddit, X (de pago, ~47 $/mes + 38 $ de recheo), Google Trends (sen API aberta; alpha por solicitude), Meta e TikTok (só investigación en sala limpa), Strava Metro (só socios), Commons (pouco volume). OSM (ohsome) queda como posible capa mensual «Galicia cartografada» (ODbL, ≥3 editores).
