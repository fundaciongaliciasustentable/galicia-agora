# 0003 — Aloxamento e despregue

- Estado: aceptada para o sitio (2026-10-18); VPS pendente

## Decisión
- Sitio e ficheiros de datos: Dinahosting, mesmo orixe, despregue por FTPS desde GitHub Actions (como a revista da FGS).
- Ingesta periódica: GitHub Actions con cron. Os crons poden atrasarse ou desactivarse; por iso os estados de frescura e a alerta de «máis de tres ciclos en stale».
- Avións e buques: VPS pequeno con systemd. **Non se crea** ata documentar deseño e custo e ter aprobación.

## Riscos a verificar na Fase 1
- PMTiles precisa peticións HTTP Range. Hai que comprobar que Dinahosting serve `Accept-Ranges: bytes` e `206 Partial Content`. Se non, plan B: teselas `{z}/{x}/{y}.pbf` estáticas.
- Límites de número de ficheiros e de tamaño por FTPS.
