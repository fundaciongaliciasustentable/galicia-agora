# 0003 — Aloxamento e despregue

- Estado: aceptada (2026-10-18)

## Decisión
- Enderezo canónico: **https://galiciasustentable.org/galicia-agora/** (cartafol do proxecto no aloxamento de `galiciasustentable.org`). **https://agora.galiciasustentable.org** é un enderezo curto que redirixe alí (decisión FGS, 18/10/2026). O prefixo `/galicia-agora/` está en `site/site.config.json`; todo URL propio pasa por `site/src/paths.ts`.
- Sitio e ficheiros de datos: Dinahosting, mesmo orixe, despregue por FTPS desde GitHub Actions (como a revista da FGS).
- Ingesta periódica: GitHub Actions con cron. Os crons poden atrasarse ou desactivarse; por iso os estados de frescura e a alerta de «máis de tres ciclos en stale».
- Avións e buques: VPS administrado que a FGS xa ten en Dinahosting (ADR 0007).

## Riscos a verificar na Fase 1
- PMTiles precisa peticións HTTP Range. Comprobado o 18/10/2026: o servidor de `galiciasustentable.org` responde `206 Partial Content` con `Accept-Ranges: bytes`. Falta repetilo cun ficheiro grande xa publicado.
- Límites de número de ficheiros e de tamaño por FTPS.
