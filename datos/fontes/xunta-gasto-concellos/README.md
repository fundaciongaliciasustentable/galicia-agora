# Gasto da Xunta por concello · orzamentos, transferencias e subvencións

Fonte para o mapa **Gasto do orzamento da Xunta por concello desde que hai datos**.

**Semáforo: amarelo.** O que a Xunta gasta *en* cada concello non se publica por concello: o anexo de investimentos do orzamento reparte cada proxecto só por provincias, e a execución só sae por consellería e capítulo. O que si existe, por concello, por ano e lexible por máquina, é o diñeiro da Xunta que **entra nos orzamentos dos concellos**: as liquidacións que cada concello envía ao Ministerio de Facenda (CONPREL), artigos 45 e 75 de ingresos, «De Comunidades Autónomas». Serie executada (dereitos recoñecidos), 2002–2024 e avance de 2025, con licenza de reutilización aberta. É a serie honesta, pero mide outra cousa: transferencias (Fondo de Cooperación Local, convenios, subvencións), non as estradas, colexios ou hospitais que a Xunta paga directamente.

Verificado con descargas reais o 1 de novembro de 2026.

## Que hai e que se pode mapear

| Fonte | Prevista / executada | Por concello | Por ano | Lexible por máquina | Licenza |
|---|---|---|---|---|---|
| Orzamentos da Xunta, CSV de datos abertos | Prevista | Non (consellería × grupo × capítulo) | Si (un CSV por ano) | Si | Aviso legal do portal: só uso persoal non comercial |
| Orzamentos da Xunta, anexo de investimentos (Serie verde) | Prevista | **Non**: cada proxecto territorializado por provincia (códigos `1500000`, `2700000`, `3200000`, `3600000`) | Si | PDF | Igual |
| Execución trimestral e Conta Xeral (Consellería de Facenda) | Executada | Non verificado (PDF; non se leu o contido) | Si, 2002–2026 | PDF | Non verificada |
| **CONPREL, liquidacións das entidades locais (Facenda)** | **Executada** | **Si**, código INE | **Si, 2002–2024 + avance 2025** | Access (.mdb/.accdb) | Condicións xerais de reutilización da AXE |
| BDNS / SNPSAP (subvencións concedidas) | Concedida | Si, polo NIF do concello | Si, por data de concesión | API JSON | Aviso legal non lido (páxina con JavaScript) |
| Fondo de Cooperación Local, reparto da Xunta | Executada | Si (no DOG) | Si | Non atopado en datos abertos | — |

## Ficha (CONPREL, a serie proposta)

| Campo | Valor |
|---|---|
| Conxunto | CONPREL, «Consulta Presupuestos y Liquidaciones de EELL», Secretaría General de Financiación Autonómica y Local: https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL |
| Descarga | `…/SGFAL/CONPREL/Consulta/DescargaFichero?CCAA=&TipoDato=Liquidaciones&Ejercicio={AAAA}&TipoPublicacion=Access` (a mesma ruta coa que o botón da páxina chama tras `POST …/Consulta/ExisteFichero`). Un zip por ano con toda España. `Ejercicio=2001` dá 500: a serie empeza en 2002. |
| Formato | Zip cunha base Access: `.mdb` (Jet4) ata 2010 e `.accdb` (ACE) en 2023. Lese cun lector de páxinas Jet propio en `descargar.py` (biblioteca estándar; sen mdbtools nin ODBC). Metodoloxía: `…/Consulta/DescargaFicheroMetodologico?idFichero=809` (Access) e `814` (xeral). |
| Táboas | `tb_inventario` (id, codbdgel, nombreppal, idente, codente, poblacion, estado), `tb_economica` por entes e `tb_economica_cons` consolidada (2003 e 2010; non existe en 2023), `tb_cuentasEconomica`. Os 5 primeiros díxitos de `codbdgel` son o código INE; `AA` = concello. |
| Campos usados | Ingresos (`tipreig = I`). Ata 2008 `importe`; desde 2009 `imported` (previsión definitiva), `importer` (dereitos recoñecidos, o usado), `importel` e `importec` (recadación). Contas: 45 e 75 «De Comunidades Autónomas»; 455/755 (1989–2009) ou 450/750 (desde 2010) «Administración Xeral da CA»; 450.00 «Participación en tributos de la Comunidad Autónoma», que en Galicia é o Fondo de Cooperación Local. |
| Licenza | Aviso legal de Facenda (https://www.hacienda.gob.es/es-ES/Paginas/AvisoLegal.aspx), «Condiciones generales para la reutilización de información»: «permiten la reutilización de los documentos sometidos a ellas para fines comerciales y no comerciales», con cita da fonte e sen desnaturalizar. Remite a www.datos.gob.es/avisolegal. Encaixe en `docs/licences.md` a revisar (é o réxime xeral da AXE, de atribución). |
| Atribución | «Origen de los datos: Ministerio de Hacienda» (texto proposto polo propio aviso). Na web: «Fonte: Ministerio de Facenda, CONPREL, liquidacións dos orzamentos das entidades locais. Agregado por concello pola FGS.» |
| Resolución temporal | Ano (exercicio liquidado) |
| Resolución territorial | Concello (código INE). 313 en 2010; 279 en 2003 e 292 en 2023 (os que enviaron a liquidación). |
| Último período | Liquidación definitiva de 2024; avance de 2025 publicado o 30/10/2026 (o Access de 2025 xa se descarga, 47,5 MB). |
| Frecuencia | Anual, en outubro do ano *a+1* (avance) e definitivo despois. |
| Tamaño | 13–19 MB por ano en zip ata 2008, 35–56 MB desde 2009; unha base de 2023 descomprimida pesa 437 MB. Toda a serie 2002–2025: ≈ 1,0 GB en zip. Ler un ano: ~15 s. |
| Quebras | Estrutura orzamentaria de 1989 ata 2009 e Orde EHA/3565/2008 desde 2010: o artigo 45/75 conserva o sentido, pero os conceptos cambian (455 → 450) e o FCL só se separa desde 2010. Ata 2013 os concellos de menos de 5.000 habitantes podían declarar só por artigo (abonda para 45/75). En 2003, 104 concellos (estado «E») non teñen filas consolidadas: o script usa a súa administración xeral. Euros correntes. Fusións: Oza-Cesuras (2013) e Cerdedo-Cotobade (2016) súmanse ao código actual. |
| Privacidade | Só entidades públicas. Sen datos persoais. |

## Mostra (`mostra/`)

`python3 -I descargar.py` (anos 2003, 2010 e 2023; BDNS de marzo de 2024). 36 peticións, ~2 min; os zip van a un directorio temporal fóra do repo e bórranse.

| Ficheiro | Contido |
|---|---|
| `conprel_ccaa_concellos.csv` | 884 filas (279 + 313 + 292): ano, INE (harmonizado), INE orixinal, nome CONPREL, poboación, táboa de orixe, art. 45, 455/450, FCL (450.00, desde 2010), art. 75, 755/750, en euros |
| `bdns_concellos_2024-03.csv` | Concesións de marzo de 2024 de órganos galegos a beneficiarios con NIF de concello, por concello e órgano |
| `rexistro.json` | URL, estado e bytes de cada petición; tamaño do zip de cada ano 2002–2025; cabeceira do CSV do orzamento; códigos de territorialización atopados no anexo; resumo por ano |

### Primeira lectura

- **Total Galicia (art. 45 + 75): 208,5 M€ en 2003, 406,0 M€ en 2010 e 443,0 M€ en 2023** (euros correntes; 2003 e 2023 sen todos os concellos). Por habitante: 80, 145 e 169 €.
- O FCL (450.00) foi 78,3 M€ en 2010 e 103,2 M€ en 2023 (292 concellos). O capital (art. 75) baixa do 29 % do total en 2003 ao 20 % en 2023.
- O mapa é rural: en 2023 a mediana é de 326 €/hab, pero A Veiga recibe 2.231 €/hab, Vilariño de Conso 1.702 e Folgoso do Courel 1.516, mentres Pontevedra, A Coruña e Lugo quedan en 53, 61 e 67. Mesmo patrón en 2010 (Cerceda 1.710, Vigo 60).
- Faltan 21 concellos en 2023 (Arzúa, A Pobra do Caramiñal, Rianxo, Becerreá, Portomarín, A Rúa, Mondariz-Balneario…): non enviaron a liquidación. Hai que pintalos como «sen dato», nunca como cero.
- 2003 trae valores raros (Ferrol, 5 €/hab): os primeiros anos teñen máis erros de imputación. Revisar antes de animar.
- Anexo de investimentos de 2026: 124 proxectos lidos en tres fragmentos (IGE, Axencia Galega de Infraestruturas, Educación), **todos territorializados por provincia**, ningún por concello. A Axencia de Infraestruturas reparte as estradas por porcentaxes provinciais.
- BDNS, marzo de 2024: 2.025 concesións de 98 órganos galegos; 596 van a 206 concellos (1,04 M€, sobre todo Cultura e Agadic). Mostra que a API serve, pero só cobre subvencións en concorrencia, non o FCL nin os convenios grandes, e solápase co art. 45/75.

## Proposta de mapa

Reloxo de **anos** 2002–2025: coropleta de euros por habitante que cada concello ingresa da Comunidade Autónoma (art. 45 + 75), coa fracción FCL marcada desde 2010, en euros constantes (deflactor a escoller) e cos concellos sen liquidación en gris. Comparación con Galicia como índice, co valor orixinal ao lado, como as outras capas por concello.

O que **non** pode ensinar: o gasto directo da Xunta en cada concello (investimento en estradas, centros de saúde, colexios, persoal), que é a maior parte do orzamento e só se publica por provincia; nin o previsto fronte ao executado por concello; nin os anos anteriores a 2002. Tampouco distingue Xunta de Deputacións (estas van no art. 46/76, fóra da serie).

## Outras fontes revisadas

- **Orzamentos da Xunta** (https://orzamentos.xunta.gal/web/orzamentos2026): CSV `…/orzamentos/2026/DE/DATOS_ABERTOS/gastos.csv` (214 filas, `Consellería;Grupo;Capítulo;Orzamento`, Latin-1) e libros en PDF. O aviso legal do portal di: «Só está autorizado o uso persoal non comercial». Non se buscou o mesmo CSV en abertos.xunta.gal (o buscador do portal non filtra por texto sen JavaScript).
- **Execución trimestral** (https://www.conselleriadefacenda.gal/areas-tematicas/economico-financeira-e-contable/execucion-trimestral-dos-orzamentos/serie-historica): PDF por trimestre desde 2002 (4.º trimestre de 2024: 1,4 MB). Non se extraeu o contido; desagregación territorial non verificada.
- **Fondo de Cooperación Local**: non hai páxina nin conxunto aberto na Consellería de Facenda nin en datos.gob.es (a busca devolve só o de Cataluña). O reparto por concello publícase no DOG (non verificado nesta ronda). CONPREL 450.00 dá o FCL recibido desde 2010.
- **BDNS** (https://www.infosubvenciones.es/bdnstrans/api, especificación en `…/bdnstrans/estaticos/doc/snpsap-api.json`): `/organos?vpd=GE&idAdmon=A` dá o nodo GALICIA con 98 órganos; `/concesiones/busqueda` acepta `organos`, `fechaDesde`, `fechaHasta` e `pageSize` (5.000 funciona). O beneficiario vén como «NIF NOME»; o NIF dun concello é `P` + código INE + `00` + letra. A resposta trae unha advertencia de reutilización que remite a https://www.infosubvenciones.es/bdnstrans/GE/es/avisolegal (páxina que só se ve con JavaScript): licenza **non verificada**.
- **IGE, táboa 939** (liquidación dos orzamentos dos concellos, 2001–2024): por concello pero só por capítulo («Transferencias correntes», «de capital»), sen separar Estado, Xunta e Deputacións. Serve para contrastar o capítulo 4 e 7, non para este mapa.
- **Consello de Contas**: https://www.ccontasgalicia.es/ falla co certificado TLS desde Python (non se verificou o contido).
