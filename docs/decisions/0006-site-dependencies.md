# 0006 — Dependencias do sitio

- Estado: aceptada (2026-10-18)

| Paquete | Versión | Licenza | Por que | Tamaño no cliente (gzip) |
|---|---|---|---|---|
| astro | 5.18.2 | MIT | Xerador estático previsto no encargo | 0 (só build) |
| maplibre-gl | 6.14.0 | BSD-3-Clause | Mapa vectorial sen servizos externos | 290 KB + worker 144 KB |
| pmtiles | 4.5.0 | BSD-3-Clause | Ler PMTiles por HTTP Range | 7,5 KB |
| @protomaps/basemaps | 5.7.2 | BSD-3-Clause | Estilo do mapa base (xerado no build) | 0 |
| @fontsource/lato | 5.3.0 | OFL-1.1 | Lato autoaloxada | ~23 KB por peso |
| pagefind (dev) | 1.5.2 | MIT | Busca estática de lugares | ~30 KB |

Astro 7 xa existe; mantívose Astro 5 porque é o que fixa o encargo. Actualizar é unha decisión aparte.

Ferramentas fóra de npm: `pmtiles` (BSD-3) e `tippecanoe` (BSD-2), con Homebrew en local e no runner de CI.

Activos de terceiros incluídos no sitio: glifos Noto Sans (OFL) e sprites de protomaps/basemaps-assets (derivados de tangrams/icons, MIT). O mapa base é OpenStreetMap (ODbL) vía Protomaps.
