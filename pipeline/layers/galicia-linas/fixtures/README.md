# Fixtures: galicia-linas

- `mdt.txt`: resposta real do WCS do IGN gravada o 2026-11-03 (≈18:00 UTC), multiparte con
  ArcGrid, para un recorte pequeno arredor de Santiago:
  `https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=Elevacion4258_200&SUBSET=Lat(42.84,42.92)&SUBSET=Long(-8.60,-8.48)&FORMAT=ArcGrid`.
  A capa pide o marco enteiro do cartel (≈13 MB).
- `galicia-deformada`, `entidades-poboacion`, `raios-ano`, `historial-queimados`: saída publicada
  desas capas (`data-out/`, 25/10–03/11/2026) recortada sen outras modificacións: os concellos
  15030 e 15078; os 40 primeiros lugares de Santiago con poboación; os 5 primeiros días con
  raios; tres lumes (Vimianzo e Ourense). Cada unha co seu `meta.json`.
