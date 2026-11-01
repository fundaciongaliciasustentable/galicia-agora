# MeteoGalicia · Rede de detección de raios (histórico)

Fonte para o mapa **Lóstregos do último ano**.

**Semáforo: verde.** O mesmo servizo que usa a capa `raios` dá calquera día pasado desde 2010, en xanelas de ata 7 días e sen chave. Os doce meses de novembro de 2025 a outubro de 2026 son 53 peticións e 64.827 raios dentro da caixa de Galicia (2,6 MB en CSV). Condicións: a licenza é a de MeteoGalicia (colección CC BY-SA, como a capa `raios`) e o servizo non di se os raios son só nube-terra.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Conxunto | Rede de detección de raios de MeteoGalicia. Documentación: https://meteo-estaticos.xunta.gal/datosred/infoweb/meteo/docs/rss/JSON_RaiosHistorico_gl.pdf |
| Descarga | `https://servizos.meteogalicia.gal/mgrss/observacion/jsonRaios.action?dataIni=DD/MM/AAAA&dataFin=DD/MM/AAAA` (máximo 7 días; `dataFin` ten que ser posterior a `dataIni`; un só día vai con `data=DD/MM/AAAA`). Sen chave. |
| Formato | JSON: `raios[]` cun elemento por día (`data`, `numRaiosGalicia`, `numRaiosTotal`, `listaRaios[]`). |
| Campos | Por raio: `fecha` (UTC sen zona, `aaaa-mm-ddTHH:MM:SS`), `lat`, `lon`, `peakCurrent` (kA; signo = polaridade). Por día: `numRaiosGalicia` («sobre Galicia, en terra») e `numRaiosTotal` (toda a rede). |
| Licenza | Aviso legal de MeteoGalicia (https://www.meteogalicia.gal/web/aviso-legal): información «utilizada libremente… co único compromiso de mencionar expresamente a MeteoGalicia». Cita verificada o 24/10/2026 (`pipeline/layers/raios/layer.yaml`, `pipeline/sources.yaml`). Hoxe non se puido reler: a páxina é unha aplicación que carga o texto desde `apis-ext.xunta.gal/meteo2api/v1/api/contenido?idContenido=15`, que responde 401 sen a chave do portal. Posible segunda declaración CC BY-SA 4.0 en abertos.xunta.gal: aplicar a máis restritiva (ADR 0005), colección CC BY-SA. |
| Atribución | «Datos: MeteoGalicia (Xunta de Galicia)» |
| Resolución temporal | Segundo (hora UTC de cada descarga) |
| Resolución territorial | Punto (lat/lon con 4 decimais). A rede cobre máis ca Galicia (ata 37,6–44,4 N); recórtase coa caixa da capa `raios` (`GALICIA_BBOX` ± 0,1°), que inclúe mar e un pouco de Asturias, León, Zamora e o norte de Portugal. |
| Último período | Ata hoxe (o servizo dá o día actual por defecto). |
| Primeiro período | 2010. A primeira semana de xullo dá 0 raios en toda a rede de 2005 a 2009 e 2.235 en 2010 (2.127 en 2011). Non se comprobou se 2010 empeza en xaneiro ou máis tarde. |
| Frecuencia | Continua |
| Tamaño | Un ano: 53 peticións, uns 2 minutos con pausa de 1,5 s. Resposta máis grande: 1,5 MB (semana do 13 ao 19/06/2026); o ano enteiro, 8,7 MB de JSON. CSV de Galicia: 2,6 MB/ano. |
| Quebras | Sen buracos nos 365 días pedidos. 177 días sen ningún raio en toda a rede (marzo de 2026: 69 raios en todo o mes, 1 na caixa de Galicia). O 46 % dos raios da caixa son positivos, moito máis do habitual en descargas nube-terra: a documentación non di se a rede inclúe descargas entre nubes (non verificado). Cinco duplicados exactos (mesma hora e punto) eliminados. |
| Alternativas | **AEMET OpenData**: a especificación (`pipeline/samples/aemet-raios/AEMET_OpenData_specification.json`) só ten `/api/red/rayos/mapa`, unha imaxe das últimas 12 horas en España, con chave; sen puntos nin histórico. Chamada sen chave: 200 co corpo baleiro. Non serve. **Rama `data` do repositorio**: 54 instantáneas da capa `raios` entre o 24/10 e o 01/11/2026, todas con 0 raios (o servizo confirma 0 raios na caixa de Galicia do 20 ao 31/10). Só garda as últimas 24 h de cada execución; non é arquivo. |
| Privacidade | Ningunha (fenómeno natural). |

## Mostra (`mostra/`)

`python3 -I descargar.py` (62 peticións, ~2 min): os doce meses en xanelas de 7 días, unha semana de xullo de cada ano 2005–2012 para atopar o comezo, a historia da rama `data` (git local) e unha chamada a AEMET sen chave.

| Ficheiro | Contido |
|---|---|
| `raios_galicia_2025-11-01_2026-10-31.csv` | 64.827 raios na caixa de Galicia: hora UTC, lat, lon, kA |
| `raios_por_dia_2025-11-01_2026-10-31.csv` | 365 días: `numRaiosGalicia`, `numRaiosTotal` e raios na caixa |
| `rexistro.json` | Peticións (62, todas 200), resumo e proba de anos |

### Primeira lectura

- 64.827 raios na caixa en 130 días con raios; `numRaiosGalicia` (só terra galega) suma 43.629.
- Por mes: xuño de 2026 21.917, maio 10.194, xullo 9.296, outubro 5.478, abril 5.056, agosto 5.177; decembro 387 e marzo 1.
- Días máis activos: 17/06/2026 (8.282, entre as 11:26 e as 20:18 UTC, pico ás 17 h), 11/07 (6.306), 06/10 (4.954), 25/06 (4.221), 24/05 (3.403).
- Hora UTC: o máximo é ás 17 h (9.350 raios no ano) e o mínimo ás 6 h (698): o ciclo das treboadas de verán vese claro. Intensidade mediana 9 kA, máxima 325 kA.

## Proposta de mapa

Reloxo dun ano en **días** (ou en horas para os días de treboada): cada raio é un destello no seu punto e na súa hora, cor pola polaridade, e unha liña de tempo cos raios por día debaixo para saltar ás treboadas (17 de xuño, 11 de xullo, 6 de outubro). O ano completo cabe nun ficheiro estático de 2,6 MB (menos en binario), así que a capa pode ser como `focos-agosto-2025`: unha descarga anual pechada e un anexo diario cos días novos. Non pode mostrar a choiva nin o dano, nin distinguir raios nube-terra de descargas entre nubes; a caixa inclúe mar e bordos fóra de Galicia (para contar «raios en Galicia» usar `numRaiosGalicia`, que só ten o total diario, ou recortar co polígono de Galicia).
