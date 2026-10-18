# 0001 — Stack

- Estado: aceptada (2026-10-18)

## Contexto
Sitio público estático, sen terceiros no navegador, aloxado en Dinahosting por FTPS. Pipeline de datos en GitHub Actions (repo público: minutos gratuítos). Procesos sempre activos (avións, buques) nun VPS pendente de aprobación.

## Decisión
- Sitio: Astro 5 estático + TypeScript + MapLibre GL JS + PMTiles; Pagefind para buscar lugares. Mapa base PMTiles de OSM, glifos, sprites e tipografías autoaloxados.
- Pipeline: TypeScript en Node 24 (un só toolchain co sitio). `fetch` nativo. Dependencias: `yaml` (ISC), `ajv` + `ajv-formats` (MIT), e en desenvolvemento `tsx`, `vitest`, `@biomejs/biome`, `typescript`.
- Procesos pesados (GDAL, tippecanoe, pmtiles) en CI e documentados no `Makefile`; en local con Homebrew.
- Repositorio fóra de OneDrive (`~/Proxectos/galicia-agora`).

## Consecuencias
Unha soa linguaxe para pipeline e sitio. As ferramentas xeoespaciais non son dependencias npm: hai que instalalas no runner.
