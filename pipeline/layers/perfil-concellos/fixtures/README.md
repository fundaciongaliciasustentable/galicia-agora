# Fixtures — perfil-concellos

Saídas reais publicadas das capas de entrada (`data.geojson` + `meta.json`), xeradas o
2026-10-25 cunha inxestión real e recortadas a tres concellos:

- 15078 Santiago de Compostela, 27034 Navia de Suarna e 27056 Rábade (sen lugares en
  entidades-poboacion: as medianas saen nulas).
- `concellos-parroquias`: só os polígonos dos tres concellos (nivel concello).
- `distancia-servizos`: os 382 lugares deses concellos.
- Cada `*.meta.json` conserva published_at e last_success_at reais, cun só intento no historial
  e feature_count axustado ao recorte.

Licenzas: as das capas de entrada (CC BY-SA 4.0; ver cada layer.yaml).
