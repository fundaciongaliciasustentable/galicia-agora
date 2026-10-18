# Licenzas e compatibilidade

Non somos avogados. Esta táboa recolle o que din as fontes e onde vemos dúbidas; as dúbidas deben consultarse antes de publicar.

Licenzas propias: datos derivados en **ODbL 1.0**; textos en **CC BY-NC-SA 4.0**; código pendente (ADR 0002).

## Matriz por fonte

| Fonte | Licenza declarada | Compatible con ODbL | Observación |
|---|---|---|---|
| MeteoGalicia (estacións, aire) | Aviso legal: uso libre citando MeteoGalicia. abertos: CC BY-SA 4.0 | **Dúbida** | Dúas declaracións para o mesmo dato |
| mgafos (caudais) | Non verificada | Descoñecida | Pendente de chave |
| SAIH Miño-Sil | RD 1495/2011, reutilización con atribución | Si | Sen feed |
| Intecmar API | Aviso legal do portal da Xunta (cita, sen desnaturalizar) | **Dúbida** | Non está claro que cubra a API |
| NASA FIRMS | CC0 (misións NASA) | Si | Cita recomendada: «LANCE FIRMS, NASA/GSFC/ESDIS» (texto exacto non verificado) |
| EFFIS | CC BY 4.0, © UE | Si, con atribución | Logos excluídos |
| Xunta, estatística de lumes | Aviso legal Medio Rural (cita, sen desnaturalizar) | Si | |
| adsb.lol | ODbL 1.0 | Si | Mesma licenza |
| adsb.fi | Uso persoal non comercial | **Non** | Descartada |
| AISStream | Non publicada | **Descoñecida** | Non publicar sen permiso escrito |
| NAP (GTFS buses) | Licenza MITRAMS: brutos coa mesma licenza; derivados poden ir noutra | Derivados si; brutos non | Obriga «Powered by MITRAMS» e de manter datos actualizados |
| IET / IDEG (límites, entidades, espazos, PBA) | «compatible con CC BY 4.0» | Probable, con atribución | O mesmo dato está en abertos como BY-SA |
| abertos.xunta.gal (Nomenclátor e outros) | CC BY-SA 4.0 | **Non** para relicenciar | Share-alike |
| IGN / CNIG | CC BY 4.0 | Si | |
| MITECO / IEPNB | Reutilización citando a fonte | Si | |
| Renfe GTFS-RT | CC BY 4.0 | Si | Cita: «Origen de los datos: Renfe Operadora» |
| IGE grella | Aviso legal do portal (sen CC) | **Dúbida** | |
| Eólica IDEG | Non declarada | Descoñecida | |

## Por que CC BY-SA 4.0 é un problema

CC BY-SA 4.0 obriga a distribuír as adaptacións baixo a mesma licenza ou unha licenza compatible da lista oficial de Creative Commons. A ODbL non está nesa lista. Polo tanto, non podemos meter datos BY-SA nunha base publicada só en ODbL.

O caso OSM confirma que a dúbida é real: OpenStreetMap pediu ao IET unha autorización expresa para usar a súa cartografía baixo ODbL. Esa autorización vale para OSM, non para nós.

## Opcións

1. **Pedir aclaración ou dispensa á Xunta** (IET e Amtega): que confirmen por escrito que os conxuntos do IET se rexen polo aviso legal compatible con CC BY 4.0, ou que autoricen a súa inclusión nunha base ODbL. É a opción que recomendamos.
2. **Coleccións separadas**: publicar as capas BY-SA como ficheiros aparte baixo CC BY-SA 4.0, fóra da base ODbL, coa súa licenza visible na interface. Técnicamente simple, pero rompe a idea dunha única base descargable.
3. **Fontes alternativas**: IGN (CC BY 4.0) para concellos; non hai alternativa para parroquias, Nomenclátor nin patrimonio galego.

## Licenza dos textos (CC BY-NC-SA) e os datos BY-SA

Os textos editoriais non incorporan datos; só os describen. Se algún texto reproducise contido BY-SA (por exemplo, táboas enteiras), ese fragmento tería que ir en BY-SA, porque BY-NC-SA e BY-SA non son compatibles entre si. Regra práctica: os textos citan e ligan os datos; non os reproducen.

## Proposta de texto para a consulta á Xunta

> A Fundación Galicia Sustentable está a preparar un mapa público e gratuíto de datos abertos de Galicia. Queremos incorporar os conxuntos do IET (límites administrativos, entidades de poboación, espazos protexidos e afeccións do PBA) nunha base de datos publicada baixo Open Database License 1.0, coa atribución «© Instituto de Estudos do Territorio. Xunta de Galicia» visible en cada capa. O aviso legal de mapas.xunta.gal indica unha licenza compatible con CC BY 4.0, mentres que abertos.xunta.gal publica os mesmos conxuntos baixo CC BY-SA 4.0. Pedimos que nos confirmen cal se aplica e, se é CC BY-SA, se autorizan esta inclusión.
