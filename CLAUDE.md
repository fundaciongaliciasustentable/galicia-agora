# CLAUDE.md — Galicia Agora

Mapa público de Galicia con datos abertos. Promotor: Fundación Galicia Sustentable (FGS). Enderezo: https://agora.galiciasustentable.org (cartafol `www/galicia-agora` do aloxamento). Enderezo e base en `site/site.config.json`: nunca escribir rutas propias absolutas, usar `asset()` de `site/src/paths.ts`.

## Estado

Fase 1 en curso (aprobada o 18/10/2026 para as capas que non precisan VPS). Backlog (fases 2–5) só documentado en `docs/roadmap.md`.

- Capas feitas: estacions-meteo, calidade-aire, focos-calor, perimetros-queimados, tren, concellos-parroquias, rede-natura, espazos-naturais-galicia, patrimonio.
- Pendentes: caudais (chave mgafos), buses (chave NAP dá 401), zonas de produción (licenza e xeometría de Intecmar), entidades de poboación, avións e buques (VPS, `docs/vps-design.md`; buques ademais sen termos de AISStream).
- Despregue: `update.yml` despregará por FTPS cando existan os segredos `FTPS_*`.

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
