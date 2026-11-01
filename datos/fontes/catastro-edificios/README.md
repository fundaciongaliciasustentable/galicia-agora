# Dirección General del Catastro · Edificios INSPIRE (BU)

Fonte para o mapa **Como se construíu Galicia**: cada edificio acéndese no seu ano de construción.

**Semáforo: amarelo.** O dato existe e baixa sen chave: un ZIP por concello, 315 entradas para Galicia, 597 MB comprimidos, con ano de construción no 95,5 % (A Gudiña) e no 99,8 % (Lugo) dos edificios. Tres condicións o deixan en amarelo: (1) a licenza do Catastro non é CC BY: só permite difundir información **transformada**, sen desnaturalizala e sen chamala «cartografía catastral»; (2) os anos antigos son en boa parte **valores de recheo** (1900 na metade dos edificios da Gudiña, 1880 no 12,7 % dos de Lugo); (3) a data é a da unidade construtiva máis antiga da parcela, non a do edificio orixinal nin a da última reforma, e os edificios derrubados non están.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Servizo | ATOM INSPIRE de edificios: https://www.catastro.hacienda.gob.es/INSPIRE/buildings/ES.SDGC.BU.atom.xml (52 oficinas territoriais; País Vasco e Navarra enlazan aos seus propios servizos). Páxina: https://www.catastro.hacienda.gob.es/webinspire/index.html |
| Feeds de Galicia | Cinco oficinas, non catro: `…/buildings/15/ES.SDGC.bu.atom_15.xml` (A Coruña, 94 entradas), `27` (Lugo, 67), `32` (Ourense, 92), `36` (Pontevedra, 58) e `54` (Vigo, 4: Baiona, Gondomar, Nigrán e Vigo). Total 315. |
| Descarga | `https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/{oficina}/{código}-{NOME}/A.ES.SDGC.BU.{código}.zip`. O nome leva espazos e Ñ: hai que codificar a ruta. `curl` falla co certificado (cadea FNMT); `urllib` de Python funciona. |
| 315 ≠ 313 | O Catastro mantén separados os concellos fusionados: Cesuras (15026) e Oza dos Ríos (15064) = Oza-Cesuras; Cerdedo (36011) e Cotobade (36012) = Cerdedo-Cotobade. |
| Códigos | Propios do Catastro, non INE: as cidades van co 900 (A Coruña 15900, Lugo 27900, Ourense 32900, Pontevedra 36900) e Vigo co 54057. Fai falta unha táboa de paso a INE (por nome; non feita). |
| Formato | ZIP con `building.gml`, `buildingpart.gml`, `otherconstruction.gml` (só piscinas) e metadatos ISO. GML 3.2, ISO-8859-1, EPSG:25829 (ETRS89 UTM 29N). Moi verboso: o ZIP de Lugo (11,8 MB) descomprime a 274 MB. |
| Obxecto | `bu-ext2d:Building` = envolvente de todo o construído sobre rasante **nunha parcela catastral** (non un edificio no sentido común: unha parcela con casa e alpendre é un só «Building»). |
| Campo do ano | `bu-core2d:dateOfConstruction/DateOfEvent/beginning` e `end`. Documentación do Catastro («Conjunto de datos INSPIRE», 2016, p. 22): se a parcela ten varias unidades constructivas, `beginning` é a máis antiga e `end` a máis moderna; sempre ao 1 de xaneiro. Sen ano: `--01-01T00:00:00`. |
| Outros campos | `conditionOfConstruction` (functional, declined, ruin; «-» sen dato), `currentUse` (1_residential, 2_agriculture, 3_industrial, 4_1_office, 4_2_retail, 4_3_publicServices; uso de maior superficie da parcela), `numberOfDwellings`, `numberOfBuildingUnits`, `officialArea` (superficie construída), `beginLifespanVersion` (alta na base de datos, non construción). Plantas só en `buildingpart.gml`. |
| Licenza | «Licencia de acceso y uso de los servicios y conjuntos de datos INSPIRE de la Dirección General del Catastro», v1.0, xullo de 2016: https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf. Texto clave: «Se autoriza el uso público, incluido el comercial, de la información catastral que haya sido sometida a cualquier proceso previo de transformación […]. En consecuencia, no se autoriza la difusión, distribución o comercialización de la información original suministrada». Ademais: a transformación non pode supoñer «alteración del contenido de la información catastral ni desnaturalización de su sentido», e os produtos non poden identificarse como «cartografía catastral», «información catastral» ou termos que leven a confusión. |
| Outras declaracións | Feeds de Galicia, cada entrada: «This service can be used free of charge in every instance, as long as that the D. G. of the Cadastre (Ministry of Finance) is mentioned as author and owner of the information». Feed superior: «Copyright (c) 2012", ES.SDGC; all rights reserved». Metadatos do ZIP: «No conditions apply» xunto a «subject to conditions of license». Aviso legal do portal (https://www.catastro.hacienda.gob.es/es-ES/avisolegal.html): reprodución autorizada «siempre que se cite expresamente su origen» (refírese aos contidos do portal). |
| Compatibilidade | Non é CC BY nin ODbL. Un derivado (centroide + ano, ou grella) é transformación e pódese publicar, tamén con uso comercial; a licenza di que os dereitos da obra transformada son do autor, polo que en principio podería ir na base ODbL, pero as condicións de non desnaturalizar e non suplantar seguen. Proposta: colección propia con nota de licenza, como as BY-SA, ata consultalo (ver `docs/licences.md`). Non redistribuír nunca os GML. |
| Atribución | «Fonte: Dirección General del Catastro (Ministerio de Hacienda), Edificios INSPIRE, descarga do 21/08/2026. Elaboración propia: non é cartografía catastral.» |
| Resolución | Parcela (huella de 0,1 m de precisión declarada); ano. |
| Último período | Feeds e ZIP do 21/08/2026. A documentación prevé rexenerar os ATOM cada 6 meses. |
| Tamaño | 597 MB comprimidos en 315 ZIP (mediana 1,34 MB; maior Vigo 24,9 MB). Descomprimido, arredor de 13 GB (proporción de Lugo, 23×). |
| Privacidade | O GML trae a referencia catastral da parcela (14 caracteres) e ligazóns á Sede e á foto de fachada. Non trae titulares nin valor catastral (datos protexidos). A referencia, a dirección e as ligazóns **non se gardan**: a mostra só leva xeometría reducida a un punto, anos, uso, estado, superficie e número de vivendas. Para publicar, redondear o punto a ~10 m ou agregar en grella; nunca cruzar coa referencia nin con enderezos. |

## Mostra (`mostra/`)

`python3 -I descargar.py --tmp /ruta/fóra/do/repo` (324 peticións, ~7 min, sen erros). Le os seis feeds, mide os 315 ZIP con HEAD, baixa A Gudiña e Lugo ao directorio temporal e garda só derivados.

| Ficheiro | Contido |
|---|---|
| `edificios_32035.csv` | A Gudiña (concello pequeno): 2.081 edificios, un por fila: lon, lat (centroide da huella, 5 decimais), ano, ano_ultimo, uso, estado, m2_construidos, m2_planta, vivendas. 124 KB. |
| `grella100m_27900.csv` | Lugo (cidade): grella de 100 m en UTM 29N, 5.785 celas: centro, edificios, con ano, ano máis antigo, mediana. 186 KB. |
| `rexistro.json` | Feeds, dereitos declarados, as 315 entradas co seu tamaño, resumo das dúas mostras e todas as peticións. |

### Primeira lectura

- **A Gudiña** (ZIP 0,8 MB): 2.081 edificios, 95,5 % con ano. Pero o 49,8 % ten **exactamente 1900**: é o valor de recheo para o vello sen data. Fóra del, a distribución é crible: 156 nos anos 70, 167 nos 80, 233 nos 90, 141 nos 2000, 46 nos 2010, 15 desde 2020. O 65,6 % dos anos remata en 0. Usos: 1.428 residenciais, 332 industriais (alpendres e naves), 159 agrarios. Estado: 417 deficientes e 75 en ruína.
- **Lugo** (ZIP 11,8 MB): 21.744 edificios, 99,8 % con ano, mediana 1975. Aquí o recheo é **1880** (2.746 edificios, 12,7 %); hai ademais anos imposibles (1000, 1050, 1070). Por décadas: 1.886 nos 40, 1.723 nos 50, 2.074 nos 60, 2.597 nos 70, 3.430 nos 80 (máximo), 2.905 nos 90, 2.149 nos 2000, 827 nos 2010.
- **Varias datas por parcela**: `beginning` ≠ `end` no 11,3 % (A Gudiña) e no 23,9 % (Lugo). O mapa debe usar `beginning` (primeira construción na parcela) e dicilo.
- `beginLifespanVersion` non serve como data de construción: amosa as campañas de alta do Catastro (Lugo: 4.043 en 2013, 3.207 en 2006).
- **Galicia enteira**: entre 1,10 e 1,51 millóns de edificios (extrapolación da relación edificios/byte das dúas mostras ao total de bytes; o rural ten máis edificios por byte).

### Tamaño do dato derivado

| Forma | Medida nas mostras | Galicia (estimación) |
|---|---|---|
| Punto + ano, CSV gzip | 5,6–6,3 B por edificio | 6–10 MB |
| Punto + ano, binario (int32 lon/lat ×1e5, uint16 ano) gzip | 4,7–5,6 B por edificio | 5–8 MB |
| Grella 250 m (contas por década) | 0,08–0,10 celas por edificio (Lugo 2.208, A Gudiña 168) | 90–150 mil celas, uns poucos MB |
| PMTiles de puntos | non medido | o navegador só carga as teselas á vista |

## Proposta de mapa

Reloxo de **anos** de 1900 a 2026: cada edificio é un punto que se acende no ano `beginning` (PMTiles de puntos para o zoom de rúa; grella de 250 m por década para a vista de Galicia). Os valores de recheo (1900 na Gudiña, 1880 en Lugo, e os que aparezan noutros concellos ao procesalos todos) non se acenden nese ano: van nunha capa base «xa existía, sen data fiable» desde o primeiro fotograma. Cor por uso (vivenda, agrario, industrial, servizos). Vense o crecemento das cidades nos 60–80, o diseminado rural e o freo despois de 2008.

O que non pode mostrar:
- **Os derrubados.** O Catastro só ten o que existe hoxe; un barrio substituído aparece como novo. Un mapa de supervivencia, non de construción.
- **Orixinal ou reforma.** O documento do Catastro non di se a data se actualiza cunha rehabilitación integral; non verificado. Tratar o ano como «ano que consta no Catastro».
- **A data dos edificios vellos.** Antes de ~1940 o ano é moitas veces un recheo ou unha estimación redonda.
- **Edificio ≠ parcela.** Un «Building» xunta todo o construído nunha parcela; non se ven as ampliacións (`end`) salvo noutra capa.
- **Os concellos fusionados** van partidos (Oza/Cesuras, Cerdedo/Cotobade) ata facer a táboa de paso.
