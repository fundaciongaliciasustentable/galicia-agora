# 0010 — Capas que gardan o seu propio histórico

- Estado: proposta (2026-11-01)

## Contexto
Algunhas fontes só dan os últimos días (Jetstream de Bluesky reproduce ~36 h) ou só garanten uns meses (GDELT DOC 2.0 documenta 3 meses) e, ademais, non se poden pedir enteiras nunha execución (GDELT bloquea a IP se recibe máis dunha petición cada 5 s). Para publicar un ano hai que ir acumulando.

## Decisión
- O contexto do adaptador ten `readPrevious()`: a última saída boa publicada da propia capa (`data.geojson` + `meta.json` de `data-out/<id>/`), ou `null` se non hai. Non mira a idade: é o histórico da propia capa, non unha entrada doutra.
- O histórico vive no ficheiro publicado (rama `data`), non nun ficheiro aparte: o que se garda é o mesmo que se publica e cumpre as mesmas regras (só agregados, limiares). Se un dato non se pode publicar (p. ex. menos de 10 mencións nunha semana), gárdase como `null`, non o número.
- A política de publicación non cambia: se unha execución falla, consérvase o último ficheiro bo e o histórico con el.
- Capas: `galicia-noticias` (GDELT, 9 concellos por execución horaria) e `bluesky-galego` (máscara de horas mostradas por día).

## Riscos
- Se a rama `data` se perde, pérdese o histórico que a fonte xa non dá.
- Un ficheiro bo con erros arrastraríaos: as probas cobren a fusión (días non contados dúas veces, días descoñecidos como `null`).
