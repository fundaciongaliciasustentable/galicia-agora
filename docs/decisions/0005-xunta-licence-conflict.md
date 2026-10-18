# 0005 — Conflito de licenzas da Xunta: aplicar a máis restritiva

- Estado: aceptada (2026-10-18), por decisión da FGS

## Contexto
O mesmo conxunto da Xunta aparece con dúas licenzas: CC BY-SA 4.0 en abertos.xunta.gal e «compatible con CC BY 4.0» no IET (mapas.xunta.gal, IDEG). MeteoGalicia ten o mesmo problema: atribución no seu aviso legal e BY-SA en abertos. BY-SA 4.0 non permite relicenciar baixo ODbL.

## Decisión
Cando unha fonte ten máis dunha declaración de licenza, aplícase **a máis restritiva** ata que o operador confirme outra cousa por escrito.

Na práctica, as capas afectadas publícanse como **colección separada baixo CC BY-SA 4.0**, fóra da base ODbL:
- cada ficheiro leva a súa licenza en `meta.json` e na interface;
- non se mesturan con datos ODbL nun mesmo ficheiro descargable;
- as descargas agrupadas ofrécense en dous paquetes: «ODbL» e «CC BY-SA 4.0».

Capas afectadas hoxe: estacións meteorolóxicas, calidade do aire, concellos e parroquias (IET e Nomenclátor), espazos protexidos da Rede galega e patrimonio.

Non afectadas (van na base ODbL): FIRMS, EFFIS, estatística de lumes de Medio Rural, adsb.lol, Renfe, IGN, MITECO/IEPNB.

## Consecuencias
- `layer.yaml` declara `licence.collection: odbl | cc-by-sa-4.0`; o esquema esíxeo.
- Se a Xunta responde que se aplica CC BY 4.0, as capas pasan á colección ODbL cun cambio de configuración.
- Intecmar, IGE e eólica non teñen declaración BY-SA, pero a súa licenza segue sen confirmar: quedan condicionais e non se publican ata ter resposta.
