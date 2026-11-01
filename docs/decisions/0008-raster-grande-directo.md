# 0008 — Rásteres grandes: subida directa ao servidor

- Estado: proposta (2026-11-01), para a ortofoto PNOA (`ortofoto-pnoa`)

## Contexto
A ortofoto do PNOA ata z16 son ~207.000 teselas e ~2,6 GB en WebP. Non cabe na rama `data` (git non é para imaxe de varios GB, e cada cambio quedaría para sempre no historial), nin no traballo de 10 minutos de `update.yml`, nin nun só traballo de Actions (6 h como máximo: a 9 peticións por segundo a descarga leva ~6,4 h).

## Decisión
- Fluxo propio, só manual: `.github/workflows/ortofoto.yml`. Descarga reanudable (caché de teselas en actions/cache; volver lanzalo ata que diga «all tiles fetched»), ≤ 9 peticións/s, User-Agent do proxecto, só teselas que tocan os concellos de Galicia.
- Os PMTiles (cada un < 1,9 GB; z6–14 e z15–16, partidos por zoom ou por columnas se pasan do límite) súbense por FTPS a `data/ortofoto-pnoa/` cos mesmos segredos ca `update.yml`. Nomes co hash do contido: un arquivo novo nunca comparte URL nin caché do navegador co vello; un arquivo igual non se volve subir.
- Antes de publicar compróbase por HTTPS que o servidor responde 206 a unha petición Range e que o tamaño coincide.
- Á rama `data` só van `archives.json` (lista de arquivos, zooms, límites, hash) e `meta.json` (mesma política de fallo ca o resto, `publish.ts`). `prepare.ts` non copia nada: só engade as URL ao catálogo. O despregue de `update.yml` non borra nada que non subise, así que non toca estes arquivos.
- O propio fluxo borra no servidor os PMTiles que xa non están nin no índice publicado nin no anterior.
- `layer.yaml` marca `ingest.workflow`; `npm run ingest` nunca executa estas capas.

## Consecuencias
- Espazo no aloxamento: ~2,6 GB, e o dobre durante unha substitución (ata a seguinte execución).
- Se o IGN voa Galicia de novo, lanzar o fluxo con `fresh` para non reutilizar teselas vellas.
