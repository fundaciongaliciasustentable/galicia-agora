# 0003 — Aloxamento e despregue

- Estado: aceptada (2026-10-18)

## Decisión
- Enderezo: **https://agora.galiciasustentable.org**, subdominio con directorio propio: serve o cartafol `www/galicia-agora` do aloxamento de `galiciasustentable.org` (decisión FGS, 18/10/2026). Vantaxes: separación do resto de `galiciasustentable.org` (cookies, scripts e cabeceiras), configuración e caché propias, enderezo curto e fácil de mover. O mesmo cartafol tamén se ve en `galiciasustentable.org/galicia-agora/`; o `.htaccess` do sitio redirixe esas peticións (301) ao subdominio. Configuración en `site/site.config.json`; todo URL propio pasa por `site/src/paths.ts`.
- `.htaccess` (`site/public/.htaccess`): redirección, tipos MIME, cabeceiras de seguridade e caché (datos e HTML sempre revalidados). A política CSP vai en modo `Report-Only` ata comprobala no sitio publicado; despois pásase a obrigatoria.
- Sitio e ficheiros de datos: Dinahosting, mesmo orixe, despregue por FTPS desde GitHub Actions (como a revista da FGS).
- Ingesta periódica: GitHub Actions con cron. Os crons poden atrasarse ou desactivarse; por iso os estados de frescura e a alerta de «máis de tres ciclos en stale».
- Avións e buques: VPS administrado que a FGS xa ten en Dinahosting (ADR 0007).

## Riscos a verificar na Fase 1
- PMTiles precisa peticións HTTP Range. Comprobado o 18/10/2026: o servidor de `galiciasustentable.org` responde `206 Partial Content` con `Accept-Ranges: bytes`. Falta repetilo cun ficheiro grande xa publicado.
- Límites de número de ficheiros e de tamaño por FTPS.
