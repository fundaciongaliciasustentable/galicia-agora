# 0004 — Contrato de capa e política de fallo

- Estado: aceptada (2026-10-18)

## Decisión
- Cada capa vive en `pipeline/layers/<id>/` con `layer.yaml` validado por `pipeline/schema/layer.schema.json`.
- Adaptador: `fetch → normalize → validate → write`. Saída GeoJSON, NDJSON ou PMTiles máis `meta.json` (`pipeline/schema/meta.schema.json`).
- `published_at` vén da fonte. Se a fonte non o dá, vale `null` e a interface di «hora de publicación non indicada pola fonte»; nunca se substitúe pola hora de descarga.
- Política (`pipeline/lib/publish.ts`):
  - escritura atómica (temporal + rename);
  - rexéitase: erro de rede, validación fallida, 0 entidades, ou caída de máis do 50 % fronte ao último reconto bo;
  - excepción: as capas con `volatile: true` (focos de calor, trens) aceptan 0 entidades e caídas grandes, porque nelas son datos normais (unha noite sen trens, un día sen lumes); os erros de rede e de validación séguense rexeitando;
  - se se rexeita e hai un ficheiro bo anterior → `stale`, consérvase; se non o hai → `failed`;
  - unha capa `fresh` pasa a `stale` cando a última descarga boa supera `stale_after` (por defecto 3 × frecuencia);
  - alerta cando leva máis de tres ciclos sen éxito;
  - historial de intentos dos últimos 7 días para `/estado`.
- HTTP: User-Agent `GaliciaAgora/<versión> (+<url do repo>; <correo de contacto>)`, tres reintentos con backoff exponencial (respecta `Retry-After`), ETag/Last-Modified.

## Pendente
Ningún. Contacto do User-Agent: galiciasustentable@galiciasustentable.org (decisión do 18/10/2026; pode cambiarse por un enderezo específico máis adiante).
