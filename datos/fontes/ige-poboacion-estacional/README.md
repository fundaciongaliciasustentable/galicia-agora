# IGE · Carga de poboación estacional dos concellos

Fonte para o mapa **Poboación estacional por concello**.

**Semáforo: verde.** Táboas trimestrais por concello desde 2011, descargables pola API do IGE sen chave. É a fonte axeitada para a estación: MITMA só conta residentes en España e non publica todos os días desde xullo de 2025.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Operación | https://www.ige.gal/web/mostrar_actividade_estatistica.jsp?codigo=0201001008&idioma=gl |
| Metodoloxía | https://www.ige.gal/estatico/pdfs/s3/metodoloxias/Metodoloxia_Carga_poboacion_ga.pdf |
| Táboas | 9043 carga e fluxos de entrada e saída · 9046 carga por compoñentes · 9041/9044 carga que pernoita · 9042/9045 carga diúrna |
| API | `https://www.ige.gal/igebdt/igeapi/csv/datos/{taboa}/0:{trimestre}:{trimestre}...` e metadatos en `.../json/metadatos/{taboa}/selector` |
| Formato | CSV ISO-8859-1: `CodTempo, Tempo, Medida, CodEspazo, Espazo, DatoN, DatoT`. Trimestre codificado AAAA13–AAAA16 (I–IV). |
| Medidas (9043) | Carga de poboación, residentes, poboación de entrada, poboación de saída, saldo, taxa de carga (%) |
| Compoñentes (9046) | Residentes, turismo, segundas vivendas, estudos, traballo, saúde |
| Licenza | Aviso legal do IGE (Lei 37/2007): reutilización citando a fonte; non desnaturalizar. Condicións da API: non modificar os datos; un índice propio vai identificado e co valor orixinal ao lado. Xa revisado en `pipeline/sources.yaml` (ige-ficha-municipal). |
| Atribución | «Fonte: IGE. Carga de poboación estacional dos concellos de Galicia» |
| Resolución temporal | Trimestre (media diaria do trimestre en persoas equivalentes a tempo completo) |
| Resolución territorial | 313 concellos + comarcas, provincias e Galicia (o CSV trae 317 códigos de concello: catro extinguidos en 2013 e 2016, baleiros nos trimestres recentes) |
| Último período | 2025/II (2025 provisional). Último ano definitivo: 2024. |
| Frecuencia | Anual. O ano *a* publícase no ano *a+2*; trimestres provisionais do ano seguinte. |
| Tamaño | 6 trimestres = 1,0 MB por táboa; serie completa 2011/I–2025/II (58 trimestres) ≈ 6,6 MB por táboa sen comprimir |
| Quebras | Compoñentes só desde 2016/I. 2020–2021 con días lectivos e teletraballo corrixidos pola pandemia. Censo 2021 entra nas segundas vivendas desde 2021. Albergues do INE desde 2023. |
| Privacidade | Ningunha (estimacións agregadas) |

## Como se calcula (resumo)

Carga = 1/3 × carga que pernoita + 2/3 × carga diúrna. Cada unha parte dos residentes (cifras de referencia do IGE, non o Padrón) e suma o saldo de turismo (enquisas de ocupación do INE, albergues do Camiño, vivendas de uso turístico, cruceiros), segundas vivendas (Censos 2011 e 2021, Enquisa de turismo de residentes), estudos (matrícula universitaria e non universitaria), traballo (afiliacións á Seguridade Social, mutualidades, emprego público) e saúde (ingresos e consultas externas do Sergas). É unha estimación con modelos, non un reconto: dicilo na nota de fontes.

## Mostra (`mostra/`)

`python3 -I descargar.py` (táboas 9043 e 9046, últimos 6 trimestres). `--trimestres all` para toda a serie.

| Ficheiro | Contido |
|---|---|
| `ige_9043_202413-202514.csv` | 2024/I–2025/II, 6 medidas, Galicia, provincias, comarcas e concellos |
| `ige_9046_202413-202514.csv` | Igual, por compoñentes |
| `rexistro.json` | URL, bytes, último trimestre publicado e notas do IGE |

### Primeira lectura

Taxa de carga no 3.º trimestre de 2024: Sanxenxo 173,9 %, Barreiros 170,6 %, Mondariz-Balneario 167,3 %, A Teixeira 146,2 %, Parada de Sil 141,1 %, O Grove 139,0 %.

## Avisos para a peza

- Catro trimestres por ano: o mapa salta de trimestre en trimestre, sen interpolar (aviso 5 da fase 0).
- **Ano de referencia (decidido o 1/11/2026): 2025 provisional**, o mesmo ano que a mobilidade, a meteoroloxía e os lumes. Hoxe só hai os trimestres I e II (`mostra/ige_9043_202413-202514.csv` xa os inclúe). O verán, que é o pico estacional, e o outono chegarán coa publicación seguinte do IGE (o ano *a* sae completo en *a+2*, polo tanto 2027), e os valores provisionais poden cambiar ao revisarse. A peza debe marcar 2025 como provisional, deixar baleiros (non estimados) os trimestres III e IV ata que se publiquen e actualizarse cando saian. Se se quere ensinar como pode ser un verán, a única opción honesta é poñer 2024 ao lado como referencia, identificado.
- Mostrar a taxa (%) para comparar concellos e a carga en persoas no detalle.
