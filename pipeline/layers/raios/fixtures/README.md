# Fixtures: raios

| Ficheiro | Fonte | Gravado |
|---|---|---|
| `jsonRaios-17-23oct.json` | https://servizos.meteogalicia.gal/mgrss/observacion/jsonRaios.action (rango 17–23/10/2026) | 2026-10-24 07:12Z |
| `jsonRaios-hoxe-baleiro.json` | https://servizos.meteogalicia.gal/mgrss/observacion/jsonRaios.action | 2026-10-24 07:12Z |

Respostas reais completas (verificación da Fase 1b). A primeira é unha consulta por rango do 17 ao 23/10 (a URL exacta non quedou gardada coa mostra); ten un elemento por día: o 17/10
trae 145 raios da rede (66 dentro de Galicia coa marxe de 0,1°) e o 18/10 un raio en Andalucía,
útil para comprobar o recorte. A segunda é a resposta por defecto dun día sen raios.

Documentación do servizo: JSON_RaiosHistorico_gl.pdf (MeteoGalicia): parámetros `data`,
`dataIni` e `dataFin` (dd/MM/yyyy, máximo 7 días); `fecha` en UTC.

Licenza: aviso legal de MeteoGalicia (atribución) e posible CC BY-SA 4.0 en abertos.xunta.gal.
Atribución: Datos: MeteoGalicia (Xunta de Galicia).
