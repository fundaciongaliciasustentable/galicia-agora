# Fixtures — distancia-servizos

Saídas reais publicadas das capas de entrada (`data.geojson` + `meta.json`), xeradas o
2026-10-25 cunha inxestión real nun directorio de saída temporal e recortadas:

- `entidades-poboacion`: 41 entidades de Navia de Suarna (27034), incluída Peliceira, o lugar
  máis afastado dun centro de saúde en liña recta (14,0 km).
- `centros-saude`, `farmacias`, `centros-educativos`, `centros-maiores`: ata 40 centros da caixa
  lon −7,5…−6,7, lat 42,7…43,3; `hospitais`: 5 hospitais.
- Cada `*.meta.json` conserva published_at e last_success_at reais, cun só intento no historial
  e feature_count axustado ao recorte.

Licenzas: as das capas de entrada (CC BY-SA 4.0; ver cada layer.yaml).
