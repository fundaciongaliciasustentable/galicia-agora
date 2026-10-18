# Rendemento

Medido o 18/10/2026 sobre `npm run build` (tamaños con gzip -9; o servidor pode comprimir algo distinto).

## JavaScript inicial

| Recurso | Cando se carga | Tamaño | gzip |
|---|---|---|---|
| `MapApp…js` (código propio do mapa) | Ao abrir o mapa | 12 KB | 5 KB |
| `maplibre-gl…js` | Importación dinámica ao abrir o mapa | 1.076 KB | 290 KB |
| `index…js` (pmtiles) | Importación dinámica ao abrir o mapa | 19 KB | 7,5 KB |
| `maplibre-gl-worker.mjs` | Worker de MapLibre | 508 KB | 144 KB |
| Pagefind UI | Ao abrir o mapa, despois do resto | ~30 KB | — |

O peso está en MapLibre. `/estado`, `/fontes` e `/sobre` non levan JavaScript.

## Datos

- O mapa base (`basemap/galicia.pmtiles`, 137 MB) descárgase por peticións HTTP Range: o navegador só pide as teselas que se ven.
- Unha capa desactivada non fai ningunha petición. As fontes engádense ao mapa na primeira activación.
- As capas de polígonos de máis de 1 MB sérvense como PMTiles: concellos e parroquias (1,7 MB), Rede Natura (2,4 MB), espazos naturais (0,2 MB). O GeoJSON completo segue dispoñible como descarga.
- A táboa accesible usa `table.json`, sen xeometría.

## Tipografía

Source Sans 3 (400, 400 cursiva, 600 e 700), subconxuntos latin e latin-ext en woff2, servidos desde o propio sitio; o navegador só descarga os pesos e subconxuntos que usa a páxina. Corpo a 18 px, como pide a skill v4.1.

Primeiro debuxado do mapa: uns 6–8 s no navegador de proba en local (cargar MapLibre e o índice do PMTiles). Pendente de medir en produción.
