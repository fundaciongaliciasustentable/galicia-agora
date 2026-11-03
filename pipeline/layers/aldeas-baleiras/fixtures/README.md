# Fixtures: aldeas-baleiras

- `Nacional_2000.zip`, `Nacional_2013.zip`, `Nacional_2025.zip`: ZIP nacionais reais do
  Nomenclátor do INE (`https://www.ine.es/nomen_files/nacional/es/Nacional_<ano>.zip`, descargados
  o 2026-11-03) refeitos só coas liñas destes municipios, sen cambiar ningunha: 01001 (Álava, para
  comprobar que se descarta), 15026 Cesuras e 15063 Oza (ata 2013), 15902 Oza-Cesuras (2025) e
  27034 Navia de Suarna. Mesmo nome de membro e codificación ca o orixinal (Latin-1 en 2000 e
  2013, UTF-8 en 2025); o de 2025 leva ademais dous membros falsos (`_edad`, `.xlsx`) para probar
  que se ignoran.
- `entidades-poboacion`: saída publicada desa capa (`data-out/`, 25/10/2026), só os puntos de
  15902 e 27034, co seu `meta.json`.
