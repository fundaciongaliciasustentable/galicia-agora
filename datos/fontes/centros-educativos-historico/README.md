# Centros educativos por concello e ano · IGE, Xunta e Ministerio

Fonte para o mapa **Escolas pechadas e abertas desde 1980**.

**Semáforo: amarelo (2005–2025) / vermello (1980–2004 e datas de cada escola).** Ningunha das tres fontes públicas trae a data de creación ou de peche dun centro: o directorio da Xunta e o Rexistro Estatal de Centros Docentes só listan os centros abertos hoxe, e un código pechado devolve unha páxina baleira. O que existe é o **reconto anual de centros de réxime xeral por concello** do IGE (táboa 1653), de 2005 a 2025, por tipo de ensinanza. Dá o saldo de cada concello cada ano (de 1.654 a 1.344 centros en Galicia), non que escola abriu ou pechou nin onde. Antes de 2005 non se atopou ningunha serie por concello.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha (IGE 1653, a serie proposta)

| Campo | Valor |
|---|---|
| Conxunto | IGE, «Ensinanza non universitaria. Centros de réxime xeral en funcionamento segundo as ensinanzas que imparten», táboa 1653 (actividade 0203002, https://www.ige.gal/igebdt/selector.jsp?COD=1653) |
| Descarga | API aberta do IGE: `https://www.ige.gal/igebdt/igeapi/csv/datos/1653` (táboa enteira, 3,7 MB). JSON-stat rexeita a táboa enteira (413, máximo 50.000 rexistros; ten 54.096). |
| Formato | CSV, separador `,`, Latin-1. Columnas `CodTempo, Tempo, Ensinanzas, CodEspazo, Espazo, DatoN, DatoT` |
| Campos | Ano; tipo: Total, Educación infantil, Educación infantil e primaria, Educación primaria e ESO, ESO e/ou postobrigatorias, Educación primaria, ESO e postobrigatorias, Adultos, Educación especial; Galicia, provincia e concello (código INE); número de centros |
| Licenza | Aviso legal do IGE (https://www.ige.gal/web/avisolegal.jsp): «o IGE autoriza a reutilización da información baixo as seguintes condicións xerais: Está prohibido desnaturalizar o sentido da información. Debe citarse a fonte […] “Fonte: IGE: https://www.ige.gal”». Condicións da API: non modificar datos nin metadatos. Mesmo réxime que as outras táboas do IGE do proxecto (`docs/licences.md`). |
| Atribución | «Fonte: IGE (https://www.ige.gal), táboa 1653, a partir de datos da Consellería de Educación. Concellos fusionados sumados pola FGS.» |
| Resolución temporal | Ano (21 valores, 2005–2025). Se o ano é o curso que comeza ese ano (2025 = 2025/26) non se verificou: a ficha da táboa non se le sen JavaScript. |
| Resolución territorial | Concello (317 códigos no orixinal; 313 harmonizados sumando Cesuras e Oza dos Ríos en Oza-Cesuras e Cerdedo e Cotobade en Cerdedo-Cotobade) |
| Último período | 2025 |
| Frecuencia | Anual |
| Tamaño | 3,7 MB a táboa enteira; a mostra en formato ancho, 313 concellos × 8 tipos × 21 anos |
| Quebras | Os tipos cambian de contido: «Educación especial» pasa de 36 centros en 2005 a 1 en 2025 e «Educación primaria, ESO e postobrigatorias» de 72 a 110, sen nota que o explique (reclasificación probable, non verificada). Usar só o **Total** para a serie longa. Só réxime xeral: quedan fóra conservatorios, escolas de idiomas, música e artes (están no directorio da Xunta). Públicos e privados xuntos. |
| Privacidade | Recontos de centros; sen datos persoais |

## Mostra (`mostra/`)

`python3 -I descargar.py` (34 peticións; 9–13 min, case todo nas 26 páxinas de CRA, que tardan 10–36 s cada unha en edu.xunta.gal). `--sen-cra` sáltaas.

| Ficheiro | Contido |
|---|---|
| `ige1653_centros_concello.csv` | 313 concellos × 8 tipos de ensinanza, unha columna por ano 2005–2025 (baleiro = sen dato no IGE) |
| `cra_lugares_docencia.csv` | Os 26 CRA do directorio da Xunta co seu número de lugares de docencia hoxe |
| `rexistro.json` | URL, estado e bytes de cada petición; columnas do directorio da Xunta; comparación de códigos Xunta–RCD; totais de Galicia por ano e tipo; licenzas lidas |

### Primeira lectura

- **Galicia: 1.654 centros de réxime xeral en 2005, 1.416 en 2015 e 1.344 en 2025 (−19 %).** A caída é máis forte ata 2016 (−257) que despois (−53).
- Concellos sen ningún centro de réxime xeral: 12 en 2005, 22 en 2015, 27 en 2025.
- Entre 2005 e 2025 perden centros 143 concellos, gañan 11 e quedan igual 159. As perdas máis grandes en número están nas cidades (A Coruña 93 → 83, Vigo 143 → 134, Pontevedra 52 → 43, Ourense 57 → 50), pero en proporción nas vilas: Padrón 13 → 4, Ordes 12 → 5, Poio 17 → 9, Boiro 17 → 10, Carballo 19 → 12.
- «Educación infantil» (escolas infantís soas) baixa de 282 a 92 e «Educación infantil e primaria» (CEIP) de 720 a 601: é onde está o peche rural.
- Directorio da Xunta (abertos 0257): 1.624 centros, 13 columnas (`Código, Nome, Enderezo, Concello, Provincia, Cód. postal, Teléfono, Tipo de centro, COORDENADA_X, COORDENADA_Y, TITULARIDADE, ENSINO_CONCERTADO, DEPENDENTE`), **ningunha data**. A ficha de cada centro (`CargarDetalleCentro.do?codigo=…`) tampouco ten data; un código inexistente (15000041) devolve a páxina sen datos.
- RCD do Ministerio, exportación Excel de Galicia: 1.658 centros, 1.613 co mesmo código que a Xunta, 45 só no RCD e 11 só na Xunta. Columnas: comunidade, provincia, localidade, denominación xenérica e específica, código, natureza, domicilio, código postal, teléfono. **Sen datas**, e a ficha de detalle tampouco as trae.
- Os 26 CRA de hoxe teñen 165 lugares de docencia (de 4 a 12 cada un; o de Tomiño, 12). Son as escolas que seguen abertas como sedes dun colexio agrupado: no reconto do IGE contan como **un** centro cada CRA, polo que unha agrupación baixa o número sen pechar aulas. A relación con cada antiga unitaria e a data da agrupación non están en ningunha das fontes; non se debe supor.

## Proposta de mapa

Reloxo de **anos** 2005–2025: coropleta do número de centros de réxime xeral por concello (Total), con cor para o saldo respecto de 2005 e os concellos que chegan a cero marcados no ano en que pasa. Opcional: centros por cada 1.000 nenos de 3–16 anos (padrón do IGE) para separar peche de despoboamento.

O que **non** pode ensinar: escolas concretas que abren ou pechan (só saldos; unha apertura e un peche no mesmo concello e ano non se ven), a súa localización, as unitarias nin as agrupacións en CRA dos anos oitenta e noventa (un CRA conta como un centro), e nada anterior a 2005. **«Desde 1980» non se pode cumprir con datos abertos.**

## Camiños para 1980–2004 (non verificados)

- Pedir á Consellería de Educación o rexistro de centros docentes con datas de creación, supresión e agrupación (é a única fonte que debería telas por centro).
- DOG: as creacións, supresións e agrupacións de centros públicos publícanse por decreto ou orde. Non se comprobou se hai unha busca por máquina nin desde que ano.
- Anuarios estatísticos do Ministerio de Educación e do INE: probablemente por provincia, non por concello.
- IGE, táboa 463 (alumnado, 2005–2025): só Galicia e provincias. As «Estatísticas históricas de Galicia» do IGE non teñen centros educativos por concello.

## Outras fontes revisadas

- **Capa `centros-educativos`** (`pipeline/layers/centros-educativos`, abertos 0257): mesmas 13 columnas que arriba, sen datas. Licenza CC BY-SA 4.0 (lida de novo na ficha de abertos: «Creative Commons BY SA 4.0»).
- **Directorio de edu.xunta.gal** (https://www.edu.xunta.gal/centroseducativos/BuscaCentros.do): os filtros son provincia, concello, tipo, titularidade, dependente, concertado, plan, quenda, réxime e ensinanza. Ningún para centros pechados ou históricos.
- **Rexistro Estatal de Centros Docentes** (https://www.educacion.gob.es/centros/): busca por comunidade (Galicia = 11), exportación `POST /centros/exportarListadoCentrosExcel` (XLS BIFF8, 422 KB) e ficha `POST /centros/detalleCentro` con `codCentro`. Só centros actuais. O pé di «Aviso legal» sen ligazón: licenza **non verificada**.
