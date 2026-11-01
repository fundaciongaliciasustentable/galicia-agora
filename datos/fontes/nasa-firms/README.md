# NASA FIRMS · Focos de calor (agosto de 2025)

Fonte para o mapa **Focos de calor por hora**.

**Semáforo: verde.** O arquivo anual por país descárgase sen chave, pesa pouco e trae data e hora de cada detección. A animación vai a saltos: en Galicia hai catro xanelas de paso ao día.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Portal | https://firms.modaps.eosdis.nasa.gov/ |
| Arquivo por país (sen chave) | `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/2025/viirs-snpp_2025_Spain.csv` (2,4 MB) e `.../modis/2025/modis_2025_Spain.csv` (0,8 MB). Last-Modified 10/10/2026. Ruta non ligada no HTML (a páxina é unha aplicación JS). |
| NOAA-20 e NOAA-21 | Non teñen arquivo por país (404 en todas as variantes probadas). Pódense pedir pola API de área coa MAP_KEY da FGS (segredo `FIRMS_MAP_KEY`, xa comprobado o 18/10/2026 en `pipeline/sources.yaml`), produtos `VIIRS_NOAA20_SP` / `VIIRS_NOAA21_SP`. Non se probou nesta ronda porque a chave só está en CI. |
| Formato | CSV. `latitude, longitude, bright_ti4/brightness, scan, track, acq_date, acq_time (HHMM UTC), satellite, instrument, confidence, version, bright_ti5/bright_t31, frp, daynight, type` |
| Licenza | CC0 para datos de misións NASA (NASA Earthdata data use guidance). NOAA-20/21 son misións NOAA, licenza propia non verificada. |
| Atribución recomendada | «NASA FIRMS (LANCE / Earthdata)», produto e versión |
| Resolución temporal | Pasada de satélite (data e hora UTC por detección) |
| Resolución territorial | Píxel: 375 m (VIIRS), 1 km (MODIS). Cada fila é o centro dun píxel, non un lume. |
| Último período | Arquivo 2025 completo; o ano en curso tamén ten ficheiro por país. |
| Frecuencia | Arquivo anual actualizado (NRT substituído por standard cando está dispoñible) |
| Tamaño | Agosto de 2025 en Galicia: 10.456 detección, 1,1 MB en CSV |
| Quebras | `version` distingue colección (SNPP «2», MODIS «61.03»). Non mesturar volumes de MODIS e VIIRS: a resolución é distinta. |
| Privacidade | Ningunha |

## Mostra (`mostra/`)

`python3 -I descargar.py --ano 2025 --mes 8`, 8 s. Recorta ao bbox de Galicia e despois a cada concello co polígono de `data-out/concellos-parroquias/data.geojson` (se existe). Con iso caen os focos de Asturias, León e Zamora que entran no bbox (1.925 VIIRS e 727 MODIS en agosto).

| Ficheiro | Contido |
|---|---|
| `firms_galicia_2025-08.csv` | Todas as columnas orixinais + `produto`, `codigo_ine`, `concello` |
| `rexistro.json` | URL, bytes, Last-Modified e contas |

### Primeira lectura

- VIIRS S-NPP: 7.714 detección (3.865 de día, 3.849 de noite). MODIS: 2.742 (Aqua e Terra).
- Horas UTC con detección: 01–04 h, 09–11 h, 12–15 h e 20–22 h. Fóra desas xanelas non hai nada: a animación vai por pasadas.
- O pico vai do 13 ao 19 de agosto (1.250–1.616 detección diarias). Despois do 27 non hai ningunha.
- Concellos con máis detección: Quiroga, Monterrei, Chandrexa de Queixa, Vilariño de Conso, Manzaneda, A Gudiña.
- `type`: 10.427 son 0 (vexetación presumida), 18 son 2 (outra fonte terrestre estática) e 11 son 3 (mar). Filtrar `type = 0` na fase seguinte.

## Avisos para a peza

- Unha detección non é un lume nin unha hectárea. Non sumar detección para dar superficie.
- Mostrar a cifra oficial de superficie e a de satélite como capas separadas (aviso 6 da fase 0). Para superficie por satélite está EFFIS (xa en `pipeline/sources.yaml`).
- Para engadir NOAA-20/21 (máis pasadas, animación menos a saltos) fai falta a API con chave: debe correr en CI, nunca no navegador.
