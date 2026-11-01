# MeteoGalicia · Observación horaria e diaria das estacións

Fonte para o mapa **Meteoroloxía hora a hora**.

**Semáforo: verde** para un día de referencia horario e para a serie diaria dun ano. **Amarelo** para un ano horario completo: son 113.000 peticións e MeteoGalicia bloquea IP por «baixa eficiencia de peticións» (aviso do 17/09/2026, limiar non publicado). Se se quere o ano horario, pedir un ficheiro a MeteoGalicia en vez de descargalo.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Documentación | https://meteo-estaticos.xunta.gal/datosred/infoweb/meteo/docs/rss/JSON_EstacionHorariosHistoricos_gl.pdf (horario histórico) |
| Horario | `https://servizos.meteogalicia.gal/mgrss/observacion/datosHorariosEstacions.action?dataIni=DD/MM/AAAA%20HH:MM&numHoras=12&idEst=ID[&idParam=...]` |
| Diario | `https://servizos.meteogalicia.gal/mgrss/observacion/datosDiariosEstacionsMeteo.action?dataIni=AAAA-MM-DD&dataFin=AAAA-MM-DD[&idParam=...]` (todas as estacións nunha chamada) |
| Estacións | `listaEstacionsMeteo.action`: 155, con lat/lon, concello e altitude |
| Formato | JSON. Valor `-9999` = sen dato. `lnCodigoValidacion` 1 = validado; 9 = sen dato. |
| Licenza | Aviso legal de MeteoGalicia: uso libre co compromiso de citar a MeteoGalicia. O mesmo dato está en abertos.xunta.gal (dataset 0114) con CC BY-SA 4.0. Xa verificado en `pipeline/sources.yaml` (capa estacions-meteo). |
| Atribución | «Fonte: MeteoGalicia (Xunta de Galicia)» |
| Resolución temporal | Hora (horario), día (diario), mes (`datosMensuaisEstacionsMeteo.action`, responde 200) |
| Resolución territorial | Estación (155 puntos) |
| Último período | Tempo real (o histórico chega ata a hora pasada) |
| Frecuencia | Continua |
| Tamaño | Horario: ~18 KB de JSON por estación e 12 h; un día de todas as estacións = 310 peticións, 5,7 MB de JSON, 2,0 MB en CSV longo, 3 min con pausa de 0,5 s. Diario: 4 parámetros × 155 estacións × 31 días = 3,4 MB de JSON, 0,8 MB en CSV. Un ano diario dun parámetro ≈ 17 MB de JSON, uns 2 MB en CSV. |
| Quebras | Altas e baixas de estacións. A lista só dá as estacións actuais; unha estación pechada no medio non sae. |
| Privacidade | Ningunha |

## Comprobacións

- O límite de 12 horas é real: `numHoras=24` devolve a páxina «Erro da petición» (464 bytes).
- Sen `idEst` o servizo horario devolve erro: hai que pedir estación a estación.
- `dataIni` interprétase en UTC (pedir 00:00 devolve `instanteLecturaUTC` 00:00).
- O 21/05/2025 as 155 estacións devolveron datos; 153 con temperatura nas 24 horas. Hai 12 parámetros comúns (temperatura media, máxima e mínima, humidade, precipitación, horas de sol, irradiancia, vento e refacho a 10 m) e algúns só en parte das estacións (vento a 2 m, presión).
- O 4 % dos valores do día son `-9999` (validación 9).

## Mostra (`mostra/`)

`python3 -I descargar.py` (por defecto, día 2025-05-21 e diario de maio de 2025).

| Ficheiro | Contido |
|---|---|
| `estacions.csv` | 155 estacións |
| `horario_2025-05-21.csv` | 42.286 filas: instante UTC, estación, parámetro, valor, validación |
| `diario_2025-05-01_2025-05-31.csv` | 20.801 filas: temperatura media, máxima, mínima e precipitación diarias |
| `rexistro.json` | URL, data, peticións, erros e bytes |

## Avisos para a peza

- Usar o mesmo día de referencia que MITMA (mércores de maio de 2025) se a peza vai combinar capas nun só reloxo. Se non, escoller un día con interese meteorolóxico propio e dicilo.
- Interpolar entre estacións só para pintar, nunca para dar un valor nun punto sen estación.
- Para «Un ano», serie diaria: unha chamada por mes e parámetro.
