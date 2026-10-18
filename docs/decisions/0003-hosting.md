# 0003 — Aloxamento e despregue

- Estado: aceptada (2026-10-18)

## Decisión
- Enderezo público: **https://agora.galiciasustentable.org** (decisión FGS, 18/10/2026). Subdominio do dominio dos proxectos da fundación, sen custo adicional; DNS en Dinahosting.
- Sitio e ficheiros de datos: Dinahosting, mesmo orixe, despregue por FTPS desde GitHub Actions (como a revista da FGS).
- Ingesta periódica: GitHub Actions con cron. Os crons poden atrasarse ou desactivarse; por iso os estados de frescura e a alerta de «máis de tres ciclos en stale».
- Avións e buques: VPS administrado que a FGS xa ten en Dinahosting (ADR 0007).

## Riscos a verificar na Fase 1
- PMTiles precisa peticións HTTP Range. Hai que comprobar que Dinahosting serve `Accept-Ranges: bytes` e `206 Partial Content`. Se non, plan B: teselas `{z}/{x}/{y}.pbf` estáticas.
- Límites de número de ficheiros e de tamaño por FTPS.
