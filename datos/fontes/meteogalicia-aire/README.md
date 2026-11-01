# MeteoGalicia · Calidade do aire, evolución horaria por estación

Fonte para o mapa **O aire hora a hora** (`/pulso/aire/`, capa `aire-24h`).

**Semáforo: verde** para as últimas 24 horas. Para un histórico longo segue en amarelo: o servizo só dá ~34 horas.

Verificado con chamadas reais o 1 de novembro de 2026.

| Campo | Valor |
|---|---|
| Documentación | IT/052 de MeteoGalicia (`pipeline/samples/calidade-aire/IT_JSON.pdf`) |
| Servizos | `jsonEstacionesCaire.action` (48 estacións), `jsonICAActual.action` (46 con índice), `jsonEvolucionIcaEstacion.action?idEstacion=N` (ICA e valor de cada contaminante, ~34 horas) |
| Licenza | Como a capa calidade-aire: abertos.xunta.gal conxunto 0055 (CC BY-SA 4.0) e aviso legal de MeteoGalicia |
| Resolución | Hora · estación; horas locais sen desfase |
| Calidade | Tempo real sen validar (marca T) |
| Custo | 46 peticións por actualización, con pausa |
