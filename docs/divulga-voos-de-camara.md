# Voos de cámara en Divulga

Instrucións para facer en Divulga (`divulga.galiciasustentable.org`) pezas de *scrollytelling*
cun voo de cámara en 3D sobre o relevo de Galicia. O exemplo de referencia vai da Costa da Morte
ao Courel e detense en cada dato. O texto vai en columna e o mapa queda fixo detrás; cada parágrafo
que entra na pantalla move a cámara á súa parada.

Lé antes o `README.md` de Divulga. Unha peza destas é unha máis: vai en `v/<slug>/`, coa barra
`.dv-bar`, o pé `.dv-foot`, o botón «Compartir», a súa miniatura, as imaxes para redes e a súa
entrada no manifesto.

---

## 1. Como funciona

```
┌──────────────────────────────────────────────┐
│  .dv-bar                                     │
├──────────────────────────────────────────────┤
│  ┌─────────┐                                 │
│  │ paso 1  │   MAPA 3D FIXO (position:sticky) │
│  └─────────┘   relevo + capas da parada       │
│                                              │
│  ┌─────────┐   ← ao entrar este paso, a      │
│  │ paso 2  │     cámara voa á súa parada     │
│  └─────────┘     e mostra o seu dato         │
│      …                                       │
├──────────────────────────────────────────────┤
│  .dv-foot (fontes, licenzas, atribucións)    │
└──────────────────────────────────────────────┘
```

- **Unha parada é un `<section class="paso">`.** Leva a cámara (`centro`, `zoom`, `inclinacion`,
  `rumbo`) en atributos `data-*` e, se fai falta, a capa que se acende (`data-capa`).
- **Detectar a parada** fai `IntersectionObserver` (sen bibliotecas de scroll). Cando un paso
  cruza a metade da pantalla, a cámara fai `flyTo` ata el.
- **O dato é sempre texto.** O mapa acompaña e nunca é a única forma de ler a información.

## 2. Ficheiros

```
v/<slug>/index.html        a peza (HTML + CSS + JS no mesmo ficheiro, como as demais)
v/<slug>/paradas.json      paradas e datos (ou dentro do HTML, se son poucos)
v/<slug>/thumb.svg         miniatura cadrada (<50 KB)
v/<slug>/og.jpg            1200 × 630  (scripts/og_pezas.py)
v/<slug>/historia.jpg      1080 × 1920 (scripts/og_pezas.py)
assets/vendor/maplibre-gl-<versión>/   MapLibre GL JS e o seu CSS (compartido por todas as pezas 3D)
assets/vendor/pmtiles-<versión>/       protocolo PMTiles (un só .js)
assets/terreo/galicia-terreo.pmtiles   relevo en terrain-RGB (compartido)
assets/terreo/galicia-base.pmtiles     mapa base vectorial (opcional, compartido)
fontes/<slug>/             datos, scripts e notas para reproducir a peza (non se suben)
```

As bibliotecas e o relevo van en `assets/`, non nunha CDN. Así a peza funciona aínda que caia un
servidor alleo, non manda datos de quen le a terceiros, e tres ou catro pezas 3D comparten os
mesmos ficheiros na caché.

## 3. Bibliotecas

| Que | Por que | Licenza |
|---|---|---|
| **MapLibre GL JS** (a mesma versión ca mapas.galiciasustentable.org, hoxe 6.x) | Mapa vectorial con relevo 3D (`setTerrain`), `flyTo` e capas | BSD-3-Clause |
| **pmtiles** | Ler o relevo e o mapa base desde un só ficheiro con peticións Range, sen servidor de teselas | BSD-3-Clause |

Cópiaas desde `node_modules` de `mapasgs` ou desde npm (`maplibre-gl/dist/maplibre-gl.js`,
`maplibre-gl.css`, `maplibre-gl-worker.mjs` e `pmtiles/dist/pmtiles.js`). MapLibre 6 carga o worker
desde unha URL: `maplibregl.setWorkerUrl('../../assets/vendor/maplibre-gl-<versión>/maplibre-gl-worker.mjs')`.

Non fai falta nada máis: nin scrollama, nin GSAP, nin D3 para o voo.

## 4. O relevo (terrain-RGB)

MapLibre necesita teselas `raster-dem`. Faino unha vez e reutilízao en todas as pezas.

**Fonte:** MDT do IGN (PNOA-LiDAR), licenza CC BY 4.0 (`scne.es`). Pódese descargar polo WCS
INSPIRE xa verificado en Mapas Galicia Sustentable (ver `pipeline/sources.yaml`, `ign-mdt-wcs`):

```
https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage
  &COVERAGEID=Elevacion4258_25&SUBSET=Lat(41.75,43.85)&SUBSET=Long(-9.4,-6.65)&FORMAT=image/tiff
```

- O MDT de 25 m dá un voo nítido ata o zoom 13–14 (uns 100–200 MB en PMTiles).
- O de 200 m chega para voos altos (zoom ≤ 10, uns 10 MB).
- Se o WCS corta pedidos grandes, pide en anacos de 0,5° e únos con `gdalbuildvrt`.

**Conversión** (GDAL e `rio-rgbify` en local, ou nun traballo de GitHub Actions):

```bash
gdalwarp -t_srs EPSG:3857 -r bilinear -dstnodata -9999 mdt25.tif mdt25-3857.tif
rio rgbify -b -10000 -i 0.1 --min-z 6 --max-z 13 --format webp mdt25-3857.tif galicia-terreo.mbtiles
pmtiles convert galicia-terreo.mbtiles galicia-terreo.pmtiles
```

- `-b -10000 -i 0.1` é a codificación «mapbox» (terrain-RGB). Na fonte de MapLibre, `encoding: 'mapbox'`.
- O mar e Portugal veñen a 0 no IGN. Para que o Miño non remate nun cantil, recorta co contorno de
  Galicia (`pipeline/satelite/galicia-ign.geojson` en mapasgs) ou suaviza o bordo.
- Garda en `fontes/terreo/` o script e a data de descarga.

**Mapa base:** pódese reutilizar `galicia.pmtiles` de mapasgs (`build/` despois de `make basemap`,
Protomaps/OpenStreetMap, ODbL) e o seu estilo escuro ou claro (`site/public/style-*.json`). Se
non, abonda con fondo de cor + sombreado + as capas da peza.

## 5. Esqueleto da peza

```html
<!doctype html>
<html lang="gl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Da Costa da Morte ao Courel — Divulga</title>
  <meta property="og:title" content="…" />
  <meta property="og:description" content="…" />
  <meta property="og:image" content="https://divulga.galiciasustentable.org/v/<slug>/og.jpg" />
  <link rel="stylesheet" href="../../assets/css/divulga.css" />
  <script defer src="../../assets/js/compartir.js"></script>
  <link rel="stylesheet" href="../../assets/css/viz-base.css" />
  <link rel="stylesheet" href="../../assets/vendor/maplibre-gl-6.x/maplibre-gl.css" />
  <style>
    :root { --ink: #f2f0e8; --paper: #0e1012; --muted: #9a988f; }
    body { margin: 0; background: var(--paper); color: var(--ink); }
    .voo { position: relative; }
    .voo-mapa { position: sticky; top: 0; height: 100vh; width: 100%; }
    .voo-pasos { position: relative; z-index: 2; margin-top: -100vh; pointer-events: none; }
    .paso { min-height: 90vh; display: flex; align-items: center; }
    .paso > div {
      pointer-events: auto; max-width: 26rem; margin: 0 1.5rem; padding: 1.2rem 1.4rem;
      background: rgba(14, 16, 18, .82); border-radius: 6px; backdrop-filter: blur(6px);
    }
    .paso .dato { font: 700 2.4rem/1 var(--gs-font-chart-num, system-ui); }
    @media (max-width: 700px) {
      .paso { align-items: flex-end; min-height: 100vh; }
      .paso > div { margin: 0 .75rem 1.5rem; max-width: none; }
    }
  </style>
</head>
<body>
  <!-- .dv-bar como en v/poboacion-galicia/ -->
  <main class="voo">
    <div class="voo-mapa" aria-hidden="true"></div>
    <div class="voo-pasos">
      <section class="paso" data-centro="-9.272,42.882" data-zoom="11.5"
               data-inclinacion="65" data-rumbo="-30" data-capa="faros">
        <div>
          <h2>Fisterra</h2>
          <p class="dato">…</p>
          <p>…</p>
        </div>
      </section>
      <!-- …unha section por parada… -->
    </div>
  </main>
  <!-- .dv-foot con fontes e atribucións (ver §9) -->
  <script src="../../assets/vendor/pmtiles-x.y/pmtiles.js"></script>
  <script src="../../assets/vendor/maplibre-gl-6.x/maplibre-gl.js"></script>
  <script> /* §6 */ </script>
</body>
</html>
```

O mapa leva `aria-hidden="true"` porque todo o contido está no texto dos pasos.

## 6. O voo

```js
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
maplibregl.setWorkerUrl('../../assets/vendor/maplibre-gl-6.x/maplibre-gl-worker.mjs');

const base = new URL('../../assets/terreo/', location.href).href;
const map = new maplibregl.Map({
  container: document.querySelector('.voo-mapa'),
  style: {
    version: 8,
    sources: {
      terreo: { type: 'raster-dem', url: `pmtiles://${base}galicia-terreo.pmtiles`,
                encoding: 'mapbox', tileSize: 256 },
    },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': '#0e1012' } },
      { id: 'sombra', type: 'hillshade', source: 'terreo',
        paint: { 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': '#000' } },
    ],
  },
  center: [-9.27, 42.88], zoom: 9, pitch: 60, bearing: -20,
  interactive: false,          // a cámara móvea o texto, non o rato
  maxPitch: 75,
  pixelRatio: Math.min(2, devicePixelRatio),
  attributionControl: { compact: true },
});
map.on('load', () => map.setTerrain({ source: 'terreo', exaggeration: 1.5 }));

const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
function ir(paso) {
  const d = paso.dataset;
  const camara = {
    center: d.centro.split(',').map(Number),
    zoom: +d.zoom,
    pitch: +d.inclinacion,
    bearing: +d.rumbo,
  };
  if (quieto) map.jumpTo(camara);
  else map.flyTo({ ...camara, duration: 4000, curve: 1.2, essential: false });
  amosarCapa(d.capa);           // acende a capa da parada e apaga as demais
}

const obs = new IntersectionObserver(
  (entradas) => entradas.filter((e) => e.isIntersecting).forEach((e) => ir(e.target)),
  { rootMargin: '-45% 0px -45% 0px' },  // conta cando o paso cruza a metade da pantalla
);
document.querySelectorAll('.paso').forEach((p) => obs.observe(p));
```

**«Detense en cada dato».** O voo dura uns 4 s e o paso mide polo menos 90 vh, así que a cámara
queda quieta mentres se le o parágrafo. Para unha pausa máis longa, fai o paso máis alto. Dentro
dunha parada, pódese facer un xiro lento ao chegar con
`map.once('moveend', () => map.easeTo({ bearing: b + 20, duration: 12000 }))`, e cancelalo no
seguinte `ir`.

**Rendemento.**
- Exaxeración do relevo entre 1,3 e 1,6.
- `pixelRatio` como moito 2.
- Sen `fog` nin `sky` en móbiles se van lentos.
- Crear o mapa cando a peza entra na pantalla (outro `IntersectionObserver`) se vai despois dun texto longo.
- Proba nun móbil de gama media antes de publicar.

**Accesibilidade.**
- Co movemento reducido, a cámara salta sen voar.
- O texto de cada paso ten que entenderse sen mirar o mapa.
- Contraste do texto sobre o cadro escuro: AA ou máis.
- Que o foco do teclado poida percorrer os pasos (son `section` con títulos).

## 7. Percorrido: da Costa da Morte ao Courel

Proposta de paradas. As coordenadas son aproximadas; axústaas mirando a vista. **Cada dato hai
que verificalo na fonte o día de facer a peza, coa súa data e a súa cita**, como nas demais
pezas de Divulga.

| # | Parada | Centro (lon, lat) | Cámara (zoom · inclinación · rumbo) | Dato proposto (fonte) |
|---|---|---|---|---|
| 1 | Fisterra e o cabo | -9.272, 42.882 | 11,5 · 65° · −30° | O final da terra: altura do Monte Facho e dos cantís (MDT IGN) |
| 2 | Costa da Morte, de Muxía a Camariñas | -9.18, 43.05 | 10,5 · 60° · 20° | Vento medio e eólicos da serra (capa `vento-wrf`; rexistro eólico) |
| 3 | Serra do Pindo e o Xallas | -9.08, 42.90 | 11 · 70° · 60° | A fervenza do Ézaro e o encoro do Xallas (Augas de Galicia; crecida de outubro de 2026, capa `crecida-episodios`) |
| 4 | Terras de Soneira e Xallas | -8.95, 43.05 | 10 · 55° · 90° | Lugares que quedaron sen ninguén desde 2000 (capa `aldeas-baleiras`, INE) |
| 5 | Santiago e o val do Sar | -8.55, 42.88 | 11 · 50° · 100° | A cidade e a súa área: poboación 1950–2025 (INE, IGE) |
| 6 | Pico Sacro e o Ulla | -8.45, 42.80 | 11,5 · 65° · 120° | O Ulla: caudal e crecidas (estacións de aforo) |
| 7 | O Deza e a Dorsal | -8.10, 42.68 | 10 · 60° · 110° | Gando e terra: vacas por km² (IGE) |
| 8 | Chantada e a Ribeira Sacra | -7.70, 42.55 | 11,5 · 72° · 150° | Os canóns do Miño e do Sil: desnivel (MDT IGN); a calor do 29 de xuño de 2025 nos vales (capa `tmax-ano`) |
| 9 | Monforte de Lemos | -7.51, 42.52 | 11 · 55° · 120° | A depresión de Lemos: a máis quente e a máis fría do ano (`tmax-ano`) |
| 10 | O Courel: Devesa da Rogueira | -7.12, 42.60 | 12 · 72° · 200° | Monte e lume: superficie queimada desde 2016 (EFFIS, `historial-queimados`) e verdor mes a mes (`ndvi-mes`) |
| 11 | O Courel: Seoane e as aldeas | -7.20, 42.63 | 12,5 · 65° · 230° | O peche: aldeas baleiras e poboación de 65 e máis anos (INE, IGE) |

Unha primeira peza non debería pasar de 8–12 paradas e 1.200 palabras.

## 8. Os datos de cada parada

- **Fotografía, non chamada en vivo.** Os datos van na peza (en `paradas.json` ou no HTML) como
  unha foto do día. Non se chaman en directo a mapas.galiciasustentable.org nin a outras APIs.
  Garda en `fontes/<slug>/` de onde saíu cada cifra (URL, táboa, data de consulta) e o script que
  a extrae.
- **Desde Mapas Galicia Sustentable:** case todo está publicado como GeoJSON en
  `https://mapas.galiciasustentable.org/data/<capa>/data.geojson`, coa súa licenza e atribución
  no `meta.json` e no catálogo (`/data/catalog.json`). As capas da colección CC BY-SA 4.0 obrigan
  a publicar a peza derivada coa mesma licenza: indícao no pé.
- **Capas no mapa** (unha liña de costa, un río, os puntos das aldeas baleiras): exporta só o que
  se ve, simplificado, como GeoJSON pequeno dentro de `v/<slug>/`. Cada capa debe pesar menos de
  200 KB.

## 9. Atribucións e licenzas (pé da peza)

Como mínimo:
- «Relevo: © Instituto Geográfico Nacional, MDT (PNOA-LiDAR), CC BY 4.0».
- Se hai mapa base: «© OpenStreetMap contributors (ODbL), Protomaps».
- A fonte de cada dato, coa súa data.
- MapLibre GL JS (BSD-3-Clause) no código, non fai falta no pé.
- A licenza da peza, CC BY-SA 4.0 se usa datos desa colección.

## 10. Lista antes de publicar

- [ ] Todas as cifras verificadas, con fonte e data.
- [ ] Probado en escritorio, móbil de gama media e con movemento reducido.
- [ ] Sen peticións a dominios alleos ao abrir a peza (pestana Rede do navegador).
- [ ] `thumb.svg` < 50 KB; `og.jpg` e `historia.jpg` con `scripts/og_pezas.py`.
- [ ] Entrada en `visualizacions.json` (temas existentes en `CATEGORIAS`, formato «Voo 3D»).
- [ ] `python3 build.py` e `./scripts/empaquetar.sh`; sube `dist/` (non borres `api/datos/`).
- [ ] `fontes/<slug>/` co script dos datos e as notas.

## 11. Por onde empezar

1. Facer o relevo (§4) e deixalo en `assets/terreo/`. É a parte máis longa e só se fai unha vez.
2. Copiar MapLibre e pmtiles a `assets/vendor/`.
3. Montar a peza coas paradas 1, 8 e 10 só con texto e cámara, sen capas, para axustar ritmo e vistas.
4. Engadir os datos e as capas parada a parada.
