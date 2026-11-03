# Fixtures: galicia-deformada

Recorte de cinco concellos veciños (15005 Arteixo, 15017 Cambre, 15030 A Coruña, 15031
Culleredo, 15058 Oleiros), sen outras modificacións:

- `concellos-parroquias`, `nacementos-mortes` e `poboacion-seculo`: saída publicada desas capas
  (`data-out/`, ingesta do 25/10 e do 01/11/2026), só as filas destes concellos (nivel concello),
  co seu `meta.json`.
- `t1558.csv`, `t723.csv`, `t9958.csv`: respostas CSV reais da API de táboas do IGE gravadas o
  2026-11-03 (≈17:15 UTC), en ISO-8859-1, só a cabeceira e as filas de Galicia (12), destes
  concellos e do código extinguido 15026. Chamadas (base
  `https://www.ige.gal/igebdt/igeapi/csv/datos/`): `1558/T%5B1:a%5D`,
  `723/T%5B1:a%5D,1:9:10,2:2` e `9958/T%5B1:a%5D,1:1`.
