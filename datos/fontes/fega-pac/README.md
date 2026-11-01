# FEGA · Beneficiarios das axudas da PAC (FEAGA e Feader)

Fonte para un posible mapa **Axudas da PAC por concello**.

**Semáforo: amarelo.** O ficheiro descárgase sen chave, trae concello, medida e importes de cada pagamento, e cobre os 313 concellos. Pero só hai un fotograma por ano, só se poden descargar os dous últimos exercicios (o regulamento obriga a retirar os datos aos dous anos) e o concello é o de residencia ou rexistro de quen cobra, non o das terras. Para un mapa estático anual sería verde; para unha animación queda curto.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Portal | https://www.fega.gob.es/es/datos-abiertos/consulta-de-beneficiarios-pac |
| Páxina de descarga | https://www.fega.gob.es/es/datos-abiertos/consulta-de-beneficiarios-pac/descarga-de-ficheros (unha páxina por exercicio: `.../datos-2025-por-municipio`, `.../datos-2024-por-municipio`) |
| Ficheiro 2025 | `https://www.fega.gob.es/sites/default/files/files/document/Beneficiarios_municipio_ejercicio_financiero-2025.zip` · 35,0 MB en zip, 299,8 MB descomprimido · Last-Modified 28/05/2026. Publicado o 25/05/2026, actualizado o 28/05/2026. |
| Ficheiro 2024 | `.../Beneficiarios_municipio_ejercicio-financiero-2024.zip` (o nome cambia: guión en vez de barra baixa; o script le a ligazón da páxina en vez de adiviñala) · 35,5 MB · Last-Modified 04/06/2025 |
| Formato | Texto ISO-8859-1, `;` como separador, CRLF, coma decimal. 2.104.681 filas para toda España. 7.455 filas teñen un `;` de máis dentro do nome (ler os 11 últimos campos desde a dereita). |
| Campos | `BENEFICIARIO; GRUPO_EMPRESA; PROVINCIA; MUNICIPIO; MEDIDA; OBJETIVO_ESP; FEC_INI; FEC_FIN; FEAGA; FEADER; IMPORTECOFIN; FEADER_COFIN; IMPORTE_EUROS` |
| Municipio | Vén como «código postal - nome» (p. ex. `15001 - Coruña (A)`), non co código INE. Os nomes son os do INE en castelán co artigo entre parénteses ao final e algúns concellos aparecen cos nomes anteriores á fusión (Cesuras e Oza dos Ríos; Cerdedo e Cotobade). O script casa os 320 nomes galegos cos 313 códigos INE. |
| Medida | Código e texto do Anexo IX (`I.1 Ayuda básica a la renta…`, `VI.18 Ayuda a zonas con limitaciones naturales…`). 37 medidas distintas en Galicia en 2025. Táboa de códigos: `.../anexo-ix-medidatipo-de-intervencionsector-que-se-refiere-el-articulo-58-es-2025` |
| Licenza | Aviso legal do FEGA (https://www.fega.gob.es/es/aviso-legal), que cita a Lei 37/2007: «autorizándose la reproducción, siempre que se cite su origen y se difunda sin alterar su contenido». Non hai licenza CC declarada. |
| Atribución | «Fonte: FEGA. Beneficiarios de axudas da PAC, exercicio financeiro 2025. Agregado por concello pola FGS.» Dicir que é un agregado propio (os datos orixinais non se alteran, agrúpanse). |
| Resolución temporal | Exercicio financeiro: do 16 de outubro de *n*-1 ao 15 de outubro de *n*. Un valor por ano. As datas `FEC_INI`/`FEC_FIN` só existen para operacións plurianuais non SIXC. |
| Resolución territorial | Concello de residencia ou rexistro de quen cobra (vía código postal). Non é o lugar da explotación. |
| Último período | Exercicio 2025 (16/10/2024–15/10/2025), publicado en maio de 2026. |
| Frecuencia | Anual (maio–xuño do ano seguinte ao peche do exercicio). |
| Dispoñibilidade | Só dous anos: art. 98.4 do Regulamento (UE) 2021/2116, segundo a propia páxina do FEGA. Hoxe hai 2024 e 2025. Para ter serie hai que arquivar cada ano. |
| Quebras | Novo marco PAC 2023–2027: os códigos de medida cambiaron respecto do período 2014–2022. Fusións de concellos (2013, 2016) aínda visibles nos nomes. |
| Galicia en 2025 | 93.104 filas, 369,0 M€ (`IMPORTE_EUROS`). A Coruña 127,5 M€, Lugo 150,1, Ourense 49,9, Pontevedra 41,4. Os 313 concellos teñen polo menos unha fila. |

## Privacidade

O ficheiro trae o nome e apelidos das persoas físicas que cobran máis de 1.250 € no exercicio. Por debaixo, o FEGA substitúe o nome por un código, e se o municipio ten 10 beneficiarios ou menos, move esas filas á provincia (`15XXX - XXXXX`, `27XXX`, `32XXX`, `36XXX`). Ollo: a propia páxina di que o nivel seguinte é a **provincia**, non a comarca.

Que fai o script:

- Baixa o zip a un directorio temporal fóra do repo, leo en memoria e bórrao ao rematar. Nunca escribe nomes, códigos de beneficiario nin grupos.
- Conta beneficiarios distintos por concello e medida con hashes en memoria (que non se gardan).
- Celas con menos de 10 beneficiarios: van a «Outras medidas» do concello. Se esa cela queda por debaixo de 10, absorbe a medida visible máis pequena (supresión secundaria, para que non se poida obter por resta).
- Concellos con menos de 10 beneficiarios en total (54 en 2025, p. ex. O Grove, Baiona, Sada) e as filas `XXXXX` do FEGA: van a «Resto da provincia».
- Se algunha cela final quedase por debaixo de 10, conserva a conta pero borra os importes. En 2025 non houbo ningunha.

## Mostra (`mostra/`)

`python3 -I descargar.py` (exercicio 2025, cela mínima 10). Opcións `--ano 2024` e `--min-cela N`. Tarda uns 10 s.

| Ficheiro | Contido |
|---|---|
| `fega_pac_2025_concello_medida.csv` | 1.377 filas: provincia, código INE, concello, medida, beneficiarios, filas, FEAGA, Feader, cofinanciamento, importe total. 259 concellos con filas propias + 4 filas «Resto da provincia». |
| `rexistro.json` | URL da páxina e do zip, bytes, Last-Modified, datas de publicación, cabeceira orixinal, contas e celas suprimidas |

### Primeira lectura

- Concellos con máis importe: Santiago de Compostela (26,1 M€), Vilalba (11,0), Lugo (9,6), Lalín (8,3), Mazaricos (7,5). Santiago vai primeiro porque alí teñen sede entidades e sociedades, non porque teña máis terra: confirma que o mapa mide residencia.
- Por medida, as maiores son a axuda á renda asociada (I.6, 73,6 M€) e a axuda básica á renda (I.1, 60,6 M€). «Outras medidas» suma 125,1 M€: moitas medidas do Feader teñen poucos beneficiarios por concello e caen na agrupación. Para mapas por medida convén agrupar antes en familias (pagamentos directos FEAGA / desenvolvemento rural Feader), que superan o limiar en máis concellos.

## Proposta de mapa

Reloxo anual con dous fotogramas (2024 → 2025): coropleta por concello de euros por beneficiario ou por hectárea de SAU (cruzando co censo agrario), con dúas capas alternables, pagamentos directos (FEAGA) e desenvolvemento rural (Feader). Non dá para unha animación fluída: só hai dous anos publicados e un valor por ano. O que non pode ensinar: onde están as terras (é o concello de quen cobra), canto cobra cada persoa (non o publicamos), nin os anos anteriores a 2024 (retirados). Para unha serie longa, a alternativa é o FEGA agregado por comunidade autónoma ou os informes financeiros anuais, a verificar.
