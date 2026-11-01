# Plataforma de Contratación del Sector Público · Contratos en Galicia

Fonte para un posible mapa **Contratación pública por mes**.

**Semáforo: amarelo.** Os tres feeds Atom descárganse sen chave e cobren a Xunta (vía plataforma agregada), as catro deputacións e 236 concellos galegos nun só mes. Pero a localización da empresa adxudicataria (código postal) só está en 2 de cada 3 adxudicacións dos perfís propios, en 1 de cada 3 dos contratos menores e en ningunha da Xunta. Ademais, entre xullo e outubro de 2026 houbo varias incidencias de xeración dos ficheiros, e un mes de perfís pesa 300 MB en zip (2,9 GB de XML).

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Páxinas de datos abertos (Ministerio de Facenda) | Perfís: https://www.hacienda.gob.es/es-ES/GobiernoAbierto/Datos%20Abiertos/Paginas/LicitacionesContratante.aspx · Agregadas: `.../Paginas/LicitacionesAgregacion.aspx` · Menores: `.../Paginas/ContratosMenores.aspx` |
| Feed perfís (sen menores) | `https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom` · zips anuais desde 2012 e mensuais do ano en curso: `..._AAAA.zip`, `..._AAAAMM.zip` |
| Feed plataformas agregadas (sen menores) | `.../sindicacion_1044/PlataformasAgregadasSinMenores.atom` · zips desde 2016 |
| Feed contratos menores | `.../sindicacion_1143/contratosMenoresPerfilesContratantes.atom` · zips desde 2018 |
| Formato | Atom + CODICE (XML). Máximo 500 entradas por páxina, encadeadas con `link rel="next"`. Cada actualización dun expediente é unha entrada nova (hai que quedar coa máis recente). As baixas van como `at:deleted-entry`. As ligazóns internas usan o host `contrataciondelestado.es`; o script reescríbeas a `contrataciondelsectorpublico.gob.es`. |
| Tamaño (setembro de 2026) | Perfís: 302,9 MB zip / 2.928 MB XML / 193 ficheiros / 95.910 entradas. Agregadas: 20,1 MB / 387 MB / 76 / 34.501. Menores: 36,9 MB / 668 MB / 136 / 67.623. A primeira páxina do feed de perfís xa pesa 8,8 MB. Os zips non envían Content-Length. |
| Acceso técnico | Python `urllib` funciona. `curl` do sistema en macOS falla co certificado (a cadea remata na raíz «AC RAIZ FNMT-RCM SERVIDORES SEGUROS»). Unha petición HEAD feita con Python sen User-Agent foi cortada (connection reset); con GET e User-Agent vai ben. |
| Licenza | Condicións xerais de reutilización do Ministerio de Facenda (aviso legal, https://www.hacienda.gob.es/es-ES/Paginas/Avisolegal.aspx), que remiten a datos.gob.es/avisolegal: permiten uso comercial e non comercial. Hai que citar a fonte, «Origen de los datos: Ministerio de Hacienda», e a data da última actualización; está prohibido «desnaturalizar el sentido de la información». |
| Atribución | «Origen de los datos: Ministerio de Hacienda. Plataforma de Contratación del Sector Público», coa data da descarga. |
| Resolución temporal | Data de cada actualización do expediente (`updated`), data de adxudicación (`AwardDate`). Ficheiros diarios; o mapa pode ir por mes. |
| Resolución territorial | Órgano de contratación (código postal, DIR3, NIF), lugar de execución (NUTS3 `ES111`–`ES114`, ás veces cidade e CP) e, cando o hai, enderezo da adxudicataria (NUTS3, cidade, CP, país). |
| Último período | Feed vivo ata o 31/10/2026. Último zip mensual completo: 202609 (Last-Modified 01/10/2026); o 202610 publicouse o 01/11/2026. |
| Frecuencia | Diaria (actualizacións do día anterior). Zip mensual do mes anterior. |
| Quebras | Cada organismo entra na Plataforma nunha data distinta, polo que a serie non é homoxénea («el periodo que cubre estos datos no es homogéneo para todas ellas», di Facenda). A Xunta publica pola súa plataforma e chega por agregación. Contratos menores só desde 2018. |

### Quen está nos feeds (setembro de 2026)

| Feed | Contratos galegos | Quen |
|---|---|---|
| Perfís | 2.293 | As catro deputacións (A Coruña, Lugo, Ourense, Pontevedra), 171 concellos, portos, universidades, organismos do Estado en Galicia, TRAGSA, Navantia |
| Agregadas | 726 | Toda a Xunta (consellerías, SERGAS, AMTEGA, axencias, sociedades públicas) e 62 concellos que licitan pola plataforma da Xunta. A plataforma agregadora figura como `AgentParty` «Xunta de Galicia». |
| Menores | 1.645 | Concellos (69), deputacións de Ourense e Pontevedra sobre todo, organismos do Estado. Os menores da Xunta e dos concellos que usan a plataforma da Xunta **non están**: o feed de agregadas exclúe menores. |

En total, 236 concellos galegos distintos (de 313) aparecen nun só mes. «Galego» aquí quere dicir: órgano con CP galego, ou agregado pola Xunta, ou NIF de entidade pública galega, ou lugar de execución en ES11.

### Enderezo da adxudicataria

A adxudicataria trae sempre nome e NIF. O enderezo (`WinningParty/PhysicalLocation`) é opcional:

| Feed (set. 2026, contratos galegos) | Adxudicatarias | Con CP | Mesma provincia que o órgano | Resto de Galicia | Resto de España | Estranxeiro |
|---|---|---|---|---|---|---|
| Perfís | 1.358 | 888 (65 %) | 487 | 138 | 263 | 1 |
| Menores | 1.672 | 558 (33 %) | 373 | 66 | 119 | 3 |
| Agregadas (Xunta) | 690 | 0 (0 %) | — | — | — | — |

Polo tanto só se pode medir canto diñeiro queda en Galicia e canto vai a empresas doutros territorios para unha parte dos contratos, e nunca para a Xunta. O lugar de execución si está case sempre. Para os contratos da Xunta habería que cruzar o NIF co domicilio social nun rexistro mercantil (non verificado) ou consultar a Plataforma de Contratos Públicos de Galicia (non verificado).

### Incidencias de 2026

Nos comentarios do conxunto en datos.gob.es (https://datos.gob.es/es/catalogo/e05250001-licitaciones-publicadas-en-los-perfiles-del-contratante-ubicados-en-la-plataforma-de-contratacion-del-sector-publico-excluyendo-los-contratos-menores) a unidade RISP de Facenda recoñece varias incidencias:

- Xullo de 2026: os zips non se actualizaban; o 29/07 Facenda dá por resolto (última actualización 28/07). Un usuario indica que o zip só chegaba ata o 23/07.
- Agosto de 2026: sen actualizar do 10 ao 14/08; resolto o 17/08.
- Setembro de 2026: dúas incidencias abertas o 07/09, «generación incompleta» dos ficheiros de perfís (faltan licitacións) e sen actualizacións desde o 03/09. O 24/09 Facenda está «regenerando» as sindicacións para recuperar expedientes.
- Outubro de 2026: o 07/10 «han fallado varias sindicaciones».

Consecuencia: o zip mensual dun mes afectado pode cambiar despois. Gardar o Last-Modified (xa vai en `rexistro.json`) e volver baixar os meses de xullo a outubro de 2026 antes de publicar nada.

## Privacidade

As adxudicatarias poden ser persoas físicas (autónomos): en setembro, 222 adxudicacións de contratos menores e 26 da Xunta levaban un NIF con forma de DNI/NIE. O script nunca escribe nome nin NIF da adxudicataria, nin o título do contrato (pode levar nomes de persoas, p. ex. artistas). Da adxudicataria só garda a conta por ámbito do CP (mesma provincia / resto de Galicia / resto de España / estranxeiro / sen dato) e cantas teñen NIF de persoa física. Os órganos de contratación son entidades públicas e si se gardan.

## Mostra (`mostra/`)

`python3 -I descargar.py` baixa a primeira páxina dos tres feeds vivos (`--paxinas N` para máis). `--mes AAAAMM` baixa os tres zips mensuais a un directorio temporal, procésaos e bórraos (setembro: 360 MB, 6,5 min).

| Ficheiro | Contido |
|---|---|
| `placsp_galicia_202609.csv` | Setembro de 2026, 4.664 expedientes galegos (última versión de cada un), 1,3 MB |
| `placsp_galicia_20261101.csv` | Tres primeiras páxinas de cada feed vivo o 01/11/2026, 184 expedientes |
| `rexistro.json` | Unha entrada por ficheiro: URL exactas, bytes (zip e descomprimido), Last-Modified, entradas, baixas e resumo das adxudicatarias |

Columnas: feed, expediente, id da entrada, data de actualización, estado (PUB, EV, ADJ, RES, ANUL…), órgano, órgano superior, DIR3, provincia do órgano e de onde sae (cp, dir3 ou NUTS de execución), plataforma agregadora, marcas «órgano galego» e «execución en Galicia», NUTS de execución, tipo de contrato, primeiro CPV, procedemento, orzamento sen IVE, número de resultados, data de adxudicación, importe adxudicado sen IVE e as contas de adxudicatarias.

## Proposta de mapa

Reloxo mensual (2018→hoxe para menores, 2012→hoxe para perfís): cada mes, puntos nos concellos que contratan, de tamaño segundo o importe adxudicado, e arcos desde o CP da adxudicataria cando existe, coloreados por ámbito (mesma provincia, resto de Galicia, resto de España). A peza mide e compara o que se adxudica a empresas de dentro e de fóra, e debe dicir en cada fotograma que porcentaxe de importe ten enderezo coñecido. O que non pode ensinar: a Xunta (sen enderezo da adxudicataria), os menores da Xunta (non están), nin o pagamento real (un importe adxudicado non é un pagamento e os acordos marco inflan as cifras). Alternativa máis segura: mapa só do lugar de execución, que si é completo.
