# CLAUDE.md — Galicia Agora

Mapa público de Galicia con datos abertos. Promotor: Fundación Galicia Sustentable (FGS).

## Estado

Fase 0 (verificación das fontes). Non se constrúe a Fase 1 sen aprobación explícita. Backlog (fases 2–5) só documentado en `docs/roadmap.md`.

## Comandos

| Comando | Que fai |
|---|---|
| `npm test` | Tests (vitest) |
| `npm run lint` | Biome + `tsc --noEmit` |
| `npm run validate` | Valida `pipeline/sources.yaml` e cada `layers/*/layer.yaml` |
| `npm run probe [-- --source=<id>]` | Sonda de frecuencia (escribe en `probe-log/`) |
| `npm run probe -- --summary` | Intervalo medido por fonte a partir do log |
| `npm run ingest [-- --layer=<id>]` | Fase 1 |
| `npm run status` | Estado de cada capa (`data-out/<id>/meta.json`) |
| `npm run dev` / `build` | Fase 1 (Astro en `site/`) |

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
- Identidade visual: ler a skill `galiciasustentable-html` antes de escribir HTML/CSS.
