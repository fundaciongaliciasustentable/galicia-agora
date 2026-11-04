# Fixtures: tmax-ano

- `diarios-2025-01.json`, `diarios-2025-07.json`: respostas reais de
  `https://servizos.meteogalicia.gal/mgrss/observacion/datosDiariosEstacionsMeteo.action?dataIni=…&dataFin=…&idParam=TA_MAX_1.5m`
  (xaneiro e xullo de 2025, gravadas o 2026-11-04), recortadas a tres estacións (10045 Mabegondo,
  10052 Muralla, 10148 Ourense) sen outros cambios.
- `estacions-meteo`: saída publicada desa capa (`data-out/`, 01/11/2026), só 10045 e 10052; Ourense
  queda fóra para probar a posición desde UTM e a altura desde o MDT.
- `mdt-1000.txt`: resposta real do WCS do IGN (MDT 1000 m) para un recorte arredor de Ourense
  (`SUBSET=Lat(42.0,42.6)&SUBSET=Long(-8.2,-7.6)`), gravada o 2026-11-04.
