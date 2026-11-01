# CLAUDE.md — Mapas Galicia Sustentable

Mapa público de Galicia con datos abertos. Promotor: Fundación Galicia Sustentable (FGS). Enderezo: https://mapas.galiciasustentable.org (cartafol `www/subdominios/mapas` do aloxamento; antes agora.galiciasustentable.org en `www/galicia-agora`). Enderezo e base en `site/site.config.json`: nunca escribir rutas propias absolutas, usar `asset()` de `site/src/paths.ts`.

## Estado

Fase 1 en curso (aprobada o 18/10/2026 para as capas que non precisan VPS). Backlog (fases 2–5) só documentado en `docs/roadmap.md`.

- Capas feitas (21): estacions-meteo, calidade-aire, raios, avisos-aemet, avisos-meteogalicia, focos-calor, perimetros-queimados, caudais-rios, tren, buses-xunta, gasolineiras, puntos-recarga, bicis-arteixo, aeroportos, concellos-parroquias, indicadores-concellos, cobertura-banda-larga, sismos-recentes, rede-natura, espazos-naturais-galicia, patrimonio.
- Lote Xunta (2026-11, colección CC BY-SA 4.0, informe en `docs/sources-report-xunta.md`): praias, desfibriladores, sendas-paisaxe, imd-estradas, zonas-bano, zonas-producion-moluscos, inundacion-costeira, estado-masas-auga, humidais, centros-infancia, puntos-limpos, bibliotecas. Lector común de IDEG en `pipeline/lib/arcgis.ts`; CSV de abertos en `pipeline/lib/csv.ts`. Proposta de seguintes capas en `docs/investigacion-2026-11/proposta.md`.
- Mapas animados, serie «O pulso de Galicia» baixo /pulso/ (índice en `site/src/pulso/series.ts`; código en `site/src/pulso/`; fase 0 en `datos/FONTES.md`): feitos /pulso/transporte/ (antes /pulso/, as ligazóns vellas redirixen), /pulso/cidades/ (capa mobilidade-cidades) /pulso/movemento/ (capa mobilidade-fluxos), as dúas capas estáticas de MITMA, maio de 2025, /pulso/tempo/ (capa estática meteo-dia, MeteoGalicia, 21/05/2025 en hora local, e modo «Últimas 24 horas» coa capa meteo-24h, cada hora) e /pulso/lume/ (capa estática focos-agosto-2025, NASA FIRMS, colección CC BY-SA por usar os polígonos dos concellos). e /pulso/estacion/ (capa poboacion-estacional, IGE 9043 e 9046, 2025 provisional con 2024 de referencia, debuxada sobre as teselas de concellos-parroquias). Engadidas despois (lista do documento de fase 0): /pulso/aire/ (capa aire-24h, cada hora) e /pulso/seculo/ (capa estática poboacion-seculo, INE 1900–2021 harmonizado) e /pulso/lonxas/ (capa estática lonxas-2025, Consellería do Mar, colección CC BY-SA; posicións das lonxas do NGBE do IGN en `lonxas.json`). Segunda tanda (fase 0 en `datos/FONTES.md`): /pulso/sol/ (cálculo solar no navegador, sen capa), /pulso/lostregos/ (capa raios-ano, mensual), e tres mapas de concellos no tempo cunha vista e un cliente comúns (`site/src/pulso/concellos/specs.ts`): /pulso/vida/ (nacementos-mortes), /pulso/pisos/ (vut-mensual) e /pulso/escolas/ (escolas-concello). Despois, /pulso/construcion/ (capa construcion-edificios, Edificios INSPIRE do Catastro: só contas por cela de 250 m, ano e uso, porque a licenza do Catastro só deixa difundir información transformada; colección separada; ~600 MB de ZIP, cada 180 días; os anos de recheo de cada concello van en gris). Pulso das redes (investigación en `docs/investigacion-2026-11/pulso-redes.md`): /pulso/atencion/ (capa atencion-wikipedia, vistas diarias gl + es do artigo de cada concello, CC0, artigos lidos de Wikidata en `artigos.json`), /pulso/noticias/ (capa galicia-noticias, GDELT DOC 2.0, consultas revisadas á man en `consultas.json`, 9 concellos por hora; aínda sen `ready` porque o GDELT bloqueou a IP nas probas) e /pulso/bluesky/ (capa bluesky-galego, só contadores: mostra horaria do Jetstream para o galego e busca semanal das sete cidades). As dúas últimas gardan o seu propio histórico con `ctx.readPrevious()` (ADR 0010). OSM (ohsome) quedou fóra por lento. O índice /pulso/ é un mapa cun selector que carga cada pulso en modo `?embed`. As capas só de pulso van en `SERIES_LAYERS` (`site/src/map/styles.ts`).
- Capas por concello (`geometry: none` + `join` + `indicators`): debúxanse sobre os polígonos de concellos-parroquias; comparación con Galicia como índice (escala en proporcións, log2) ou diferenza en puntos, sempre co valor orixinal ao lado.
- Pendentes: zonas de produción (Intecmar), avións e buques (VPS de Dinahosting, acceso SSH pendente; buques sen termos de AISStream), condicionais de `docs/sources-report-1b.md` (METAR, boias Copernicus, BiciCoruña, satélites CelesTrak, antenas OpenCelliD, cámaras DGT).
- Despregue: `update.yml` desprega por FTPS a `www/subdominios/mapas` (segredo `FTPS_DIR`; o usuario FTP entra na raíz do aloxamento). Manifesto `.deploy-manifest.json` no servidor para subir só o que cambia.

## Comandos

| Comando | Que fai |
|---|---|
| `npm test` | Tests (vitest) |
| `npm run lint` | Biome + `tsc --noEmit` |
| `npm run validate` | Valida `pipeline/sources.yaml` e cada `layers/*/layer.yaml` |
| `npm run ingest [-- --layer=<id>] [-- --force]` | Descarga as capas que tocan (ou unha) en `data-out/` |
| `npm run status` | Estado de cada capa; sae con 3 se algunha precisa alerta |
| `npm run catalog` | Escribe `data-out/catalog.json` |
| `make basemap assets` | Mapa base PMTiles de Galicia, glifos e sprites en `build/` |
| `npm run dev` / `npm run build` | Prepara `site/public`, Astro, Pagefind |
| `npm run audit` | Falla se o sitio construído carga algo doutro orixe |
| `npm run probe [-- --summary]` | Sonda de frecuencia da Fase 0 |

## Regras non negociables

- Nada de terceiros no navegador: nin scripts, nin fontes, nin imaxes, nin mapa base externo. Todo do mesmo orixe (tamén glifos e sprites de MapLibre). Sen cookies nin analítica.
- Sen datos persoais. Buques pequenos con atraso (15–30 min).
- Ningunha capa sen licenza verificada, citada e visible. Ver `docs/licences.md`.
- Un dato vello nunca parece actual: `fresh` / `stale` / `failed`. Nunca sobrescribir con baleiro nin con datos inválidos (`pipeline/lib/publish.ts`).
- Non inventar endpoints, esquemas nin licenzas. O que non se comprobou cunha chamada real é «non verificado».
- Preguntar antes de gastar diñeiro, engadir servizos de terceiros, cambiar licenzas ou recoller datos persoais.
- Chaves só en segredos de CI ou no servidor; nunca no bundle.

## Convencións

- Código, comentarios e commits en inglés. Interface en galego (raíz) e castelán (`/es/`). Documentación interna en galego.
- «sustentable» / «sustentabilidade», nunca «sostible» (agás nomes oficiais). «Leira Experimental», nunca «Finca Experimental».
- Sen recheo nin marcadores de IA («fundamental», «crucial», «robusto», «holístico», «innovador», «transformador», «intrincado», «Non é X, é Y»).
- Unha capa = `pipeline/layers/<id>/` con `layer.yaml` (esquema en `pipeline/schema/layer.schema.json`), `adapter.ts` (fetch → normalize → validate → write), tests sobre fixtures reais.
- HTTP sempre con `pipeline/lib/http.ts` (User-Agent identificable, backoff, peticións condicionais).
- Commits pequenos, un por capa. Cada dependencia nova xustifica tamaño, licenza e mantemento no commit.
- Decisións en `docs/decisions/NNNN-titulo.md` (ADR curto).
- Identidade visual: skill `galiciasustentable-html` v4.1, perfil «divulgación e técnico» (Source Sans 3 autoaloxada en títulos, corpo e interface; corpo a 18 px; cifras tabulares nas táboas) e pé estándar da FGS (`site/src/components/Footer.astro`) con logo servido desde o propio sitio.
