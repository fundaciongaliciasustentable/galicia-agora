# Fixtures: avisos-meteogalicia

| Ficheiro | Fonte | Gravado |
|---|---|---|
| `jsonConcellosNivelMax.json` | https://servizos.meteogalicia.gal/mgrss/predicion/adversos/jsonConcellosNivelMax.action | 2026-10-24 07:18Z |
| `jsonAvisosConcellos-dia-1-baleiro.json` | https://servizos.meteogalicia.gal/mgrss/predicion/adversos/jsonAvisosConcellos.action?dia=-1 | 2026-10-24 |

Respostas reais completas (verificación da Fase 1b), un día sen avisos: 313 concellos a nivel 0 e
detalle baleiro para os tres días. Os tests con avisos usan esta resposta con dous concellos
cambiados e un detalle sintético cos campos da documentación (JSON_Pred_AvisoConcello_gl.pdf),
porque durante a verificación non había ningún aviso activo: os nomes reais dos campos do detalle
con avisos están sen verificar.

`idConcello` é o código INE de 5 cifras: os 313 coinciden cos códigos do IGE
(`ideg-concellos-codes.json`, 2026-10-24).

Licenza: aviso legal de MeteoGalicia (atribución) e posible CC BY-SA 4.0 en abertos.xunta.gal.
Atribución: Datos: MeteoGalicia (Xunta de Galicia).
