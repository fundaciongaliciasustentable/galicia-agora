# Fixtures: indicadores-concellos

Respostas CSV reais da API de táboas do IGE gravadas o 2026-10-24 (≈07:43 UTC), en
ISO-8859-1 tal como chegan. Base: `https://www.ige.gal/igebdt/igeapi/csv/datos/`

| Ficheiro | Chamada |
|---|---|
| `t723.csv` | `723/T%5B1:a%5D,1:0:3:9:10,2:2` |
| `t1558.csv` | `1558/T%5B11:a%5D` |
| `t943.csv` | `943/T%5B1:a%5D` |
| `t9642.csv` | `9642/T%5B1:a%5D` |
| `t9830.csv` | `9830/T%5B1:a%5D,1:0` |
| `t9810.csv` | `9810/T%5B1:a%5D,1:0,2:0` |
| `t11500.csv` | `11500/T%5B1:m%5D,1:1` |
| `t744.csv` | `744/T%5B1:m%5D,1:0,2:0` |
| `t62.csv` | `62/0:5,T%5B1:a%5D` |
| `t77.csv` | `77/T%5B1:a%5D,1:0` |
| `t57.csv` | `57/T%5B3:a%5D,1:0` |
| `t10331.csv` | `10331/T%5B1:a%5D,1:0` (gravada o 2026-10-24 ≈08:10 UTC) |

Recorte: cabeceira e só as filas (todos os períodos) destes códigos de espazo: Galicia (12),
provincia da Coruña (15), comarca de Arzúa (1501), 15 concellos (15001 Abegondo, 15030,
15036, 15078, 15902 Oza-Cesuras, 27001, 27028, 27031, 27034 Navia de Suarna, 32001, 32008,
32054, 36038, 36057, 36902 Cerdedo-Cotobade) e os 4 códigos extinguidos (15026, 15063, 36011,
36012). Sen outras modificacións.

## INE

`ine59531.json`: resposta real da API Tempus do INE gravada o 2026-10-24 (≈08:12 UTC),
`https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/59531?nult=1` (Censo de Población y
Viviendas 2021, viviendas según su intensidad de uso; última actualización da táboa segundo o
INE: 22/11/2024). A resposta enteira ocupa ≈7 MB (todos os municipios de España): recortouse
ás series «Total Nacional», a todas as que comezan polos códigos 12 (Galicia e tamén a
provincia de Castellón, útil para probar a ambigüidade dos códigos de dúas cifras) e 15
(provincia da Coruña) e aos mesmos 15 concellos de arriba (o INE non ten os códigos
extinguidos nin as comarcas). Os valores non se modificaron; o JSON volveuse serializar sen
espazos.

Licenza: CC BY 4.0 segundo o aviso legal do INE
(https://www.ine.es/dyngs/AYU/index.htm?cid=125). Atribución: «Fuente: Sitio web del INE:
www.ine.es». Sen datos persoais.

Licenza: aviso legal do IGE (https://www.ige.gal/web/avisolegal.jsp), reutilización citando a
fonte. Atribución: «Fonte: IGE: https://www.ige.gal». Este produto emprega a API de datos do
Instituto Galego de Estatística (IGE), pero non está certificado ou aprobado polo IGE.
Sen datos persoais.
