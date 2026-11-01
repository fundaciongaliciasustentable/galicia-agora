# IGE · Nacementos e defuncións por concello (Movemento natural da poboación)

Fonte para o mapa **Nacementos e mortes por concello** (saldo vexetativo, ano a ano).

**Semáforo: verde.** Dúas táboas anuais do IGE, unha de nacementos e outra de defuncións, por concello de residencia, desde 1975 ata 2025 (provisional), descargables pola API sen chave. Os 313 concellos actuais teñen dato todos os anos en que existiron; non hai segredo estatístico (os ceros publícanse como cero). Os totais de Galicia coinciden co INE.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Operación | Nacementos: https://www.ige.gal/igebdt/bancodatos/?codigo=0201011001&banco=municipalecomarcal · Defuncións: https://www.ige.gal/igebdt/bancodatos/?codigo=0201011002&banco=municipalecomarcal |
| Nota metodolóxica | https://www.ige.gal/estatico/pdfs/s3/notasExplicativas/nota_explicativa_mnp.pdf (non lida nesta ronda) |
| Táboas | **57** «Nacementos segundo sexo. Galicia, provincias, comarcas e concellos. Serie 1975-2025» · **30** «Defuncións segundo o sexo. Galicia, provincias, comarcas e concellos. Serie 1975-2025». Orixe: «IGE, INE. Movemento natural da poboación» |
| API | `https://www.ige.gal/igebdt/igeapi/csv/datos/{57\|30}/0:1975:…:2025,1:0` (eixo 1 = sexo, 0 = total) e metadatos en `.../json/metadatos/{taboa}/selector` |
| Formato | CSV ISO-8859-1: `CodTempo, Tempo, Sexo, CodEspazo, Espazo, DatoN, DatoT`. Sen dato: `DatoN` baleiro e `DatoT` = «-» |
| Criterio territorial | Concello de **residencia** da nai (nacementos) e da persoa falecida (defuncións), non o de inscrición nin o do hospital |
| Licenza | Aviso legal do IGE (https://www.ige.gal/web/avisolegal.jsp): «o IGE autoriza a reutilización da información baixo as seguintes condicións xerais: Está prohibido desnaturalizar o sentido da información. Debe citarse a fonte […] “Fonte: IGE: https://www.ige.gal”». Os datos primarios son do INE (CC BY 4.0, https://www.ine.es/dyngs/AYU/index.htm?cid=125). Mesmo réxime que as outras táboas do IGE do proxecto (`docs/licences.md`, «IGE grella: Dúbida»; ver tamén `ige-poboacion-estacional`). |
| Atribución | «Fonte: IGE: https://www.ige.gal, a partir do Movemento natural da poboación (IGE, INE)» |
| Resolución temporal | Ano natural |
| Resolución territorial | 317 códigos de concello (313 actuais + 4 extinguidos), 53 comarcas, 4 provincias, Galicia |
| Primeiro ano | 1975 |
| Último ano | 2025 provisional (nota do IGE: «Os datos do ano 2025 son provisionais»). Último definitivo: 2024. O INE ten publicado ata 2024M12 nas táboas mensuais por comunidade. |
| Frecuencia | Anual. O ano *a* sae como provisional no ano *a+1* (2025 xa está publicado en novembro de 2026); data exacta de publicación non comprobada no calendario do IGE. |
| Tamaño | 1,0 MB por táboa coa serie enteira (sexo total) |
| Contraste INE | Suma dos meses de Galicia nas táboas INE 6525 (nacementos) e 6562 (defuncións), 1975–2024: nacementos idénticos os 50 anos; defuncións idénticas agás 1996 (−15), 1997 (−7) e 1998 (−18) no IGE. O INE non publica o MNP por municipio nas táboas da API (comprobadas as 135 táboas das operacións MNPN e MNPD: só nacional, comunidades e provincias). |
| Privacidade | Contas agregadas por concello e ano. Hai concellos con 0 a 5 nacementos ao ano: non cruzar con outras variables (idade da nai, mes) a esa escala. |

## Mostra (`mostra/`)

`python3 -I descargar.py` (6 peticións, ~15 s; `--sen-ine` salta o contraste).

| Ficheiro | Contido |
|---|---|
| `ige_57_nacementos_1975-2025.csv` | Táboa 57 enteira, sexo total, en UTF-8 (375 territorios × 51 anos = 19.125 filas) |
| `ige_30_defuncions_1975-2025.csv` | Táboa 30 enteira, sexo total |
| `saldo_vexetativo.csv` | Unión: ano, código, nome, nivel, nacementos, defuncións, saldo |
| `rexistro.json` | URL, bytes, anos, notas do IGE e resultado do contraste co INE |

## Primeira lectura

- Galicia: +18.016 en 1975 (43.850 nacementos, 25.834 defuncións). O saldo vólvese negativo en **1986** e non volve. 2024: −19.399 (13.350 e 32.749); 2025 provisional: −19.900 (13.556 e 33.456).
- Concellos con máis nacementos que defuncións (310 unidades harmonizadas, ver abaixo): 162 en 1975, 169 en 1980, 91 en 1985, 44 en 1990, 27 en 1995, 42 en 2010, 13 en 2015, 5 en 2020, **1 en 2024 (Ames, +39) e 1 en 2025 (Oroso)**.
- Concellos sen ningún nacemento no ano: 8 en 2024 e 8 en 2025 (todos en Ourense en 2024).
- Saldo máis negativo en 2024: Vigo −1.556, A Coruña −1.281, Ourense −790. En 1975 eran os máis positivos: Vigo +3.563, A Coruña +2.763, Santiago +1.115.
- Os totais provinciais e de Galicia coinciden coa suma dos concellos en todos os anos comprobados (a nota do IGE avisa de que pode non pasar «por existir casos onde non consta o concello»).

## Cambios de termo e harmonización aos 313 de hoxe

O IGE publica cada concello só nos anos en que existiu (código propio, baleiro no resto):

| Cambio | Códigos | Dato no CSV | Harmonización |
|---|---|---|---|
| Oza-Cesuras (fusión 2013) | 15063 Oza dos Ríos + 15026 Cesuras → 15902 | Antigos ata 2012, novo desde 2013 | Sumar 15063 + 15026 en 1975–2012 e asignar a 15902. Exacto. |
| Cerdedo-Cotobade (fusión 2016) | 36011 Cerdedo + 36012 Cotobade → 36902 | Antigos ata 2015, novo desde 2016 | Sumar 36011 + 36012 en 1975–2015 e asignar a 36902. Exacto. |
| Cariño (segregado de Ortigueira) | 15901 | Desde 1988 (1988: 23 nacementos e só 1 defunción, ano incompleto) | Non se pode separar antes. Opción A: Ortigueira + Cariño xuntos toda a serie. Opción B: Cariño baleiro ata 1988, como no mapa do século. |
| Burela (segregado de Cervo) | 27902 | 1994 con 1 nacemento; completo desde 1995 (Cervo baixa de 99 a 20 nacementos en 1996) | Igual que Cariño |
| A Illa de Arousa (segregado de Vilanova de Arousa) | 36901 | 1996 con 1 defunción; completo desde 1997 | Igual que Cariño |

Proposta: a animación usa os 313 de hoxe con fusións sumadas (exacto) e, para os tres segregados, a opción B (baleiro e rotulado «sen dato: aínda non existía», o concello matriz cunha nota da quebra). A opción A (310 unidades) é a que se usou para contar os concellos con saldo positivo na primeira lectura.

### Anomalía detectada

Laxe (15040): 4 nacementos e 6 defuncións en 1981 e nacementos baleiros con 4 defuncións en 1982, cando antes e despois ten 40–53 nacementos e 22–36 defuncións ao ano. Parece un erro de rexistro ou de asignación do concello; non corrixir: deixar 1981 e 1982 como «dato dubidoso» e preguntar ao IGE.

## Proposta de mapa

- Coropletas sobre os polígonos de `concellos-parroquias`, un fotograma por ano (1975–2025, 51 fotogramas). Medida principal: **saldo por 1.000 habitantes**, que require a poboación de cada ano (Padrón desde 1996; antes, censos e rectificacións: hai que resolver o denominador, ver `ine-censos-historicos`). Sen denominador, o saldo bruto só ensina as cidades.
- Escala diverxente centrada en 0 (verde positivo, vermello negativo), coa cifra orixinal no detalle (nacementos, defuncións, saldo).
- Contador de Galicia e «concellos con saldo positivo» (162 → 1) xunto á barra de tempo.
- 2025 marcado como provisional.

O que **non** pode ensinar: o saldo migratorio (a poboación pode medrar con saldo vexetativo negativo); a idade (un concello sen nacementos pode ser só moi pequeno); o lugar onde se nace ou se morre (hospitais), porque o dato vai por residencia. En concellos de menos de 500 habitantes a taxa anual salta moito: suavizar con media móbil de 3 ou 5 anos e dicilo.
