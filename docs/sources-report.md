# Informe de verificación das fontes (Fase 0)

Data: 18/10/2026. Estado: **provisional**. As frecuencias medidas complétanse tras 3–5 días de sonda (`probe.yml`, rama `probe-log`).

Método: chamada real a cada servizo co User-Agent do proxecto, mostra gardada en `pipeline/samples/<id>/` (local, non publicada) e lectura das condicións de uso. O detalle de cada fonte está en [`pipeline/sources.yaml`](../pipeline/sources.yaml). Comprobei de novo, con chamadas propias, os endpoints de MeteoGalicia, calidade do aire, Intecmar, FIRMS, adsb.lol, Renfe, IDEG e EFFIS, e as dúas licenzas da Xunta nas páxinas gardadas.

## Resumo

| Capa da Fase 1 | Fonte | Veredicto | Motivo principal |
|---|---|---|---|
| Estacións meteorolóxicas | MeteoGalicia `ultimos10minEstacionsMeteo` | **go** | JSON aberto, 155 estacións, 10 min, sen chave |
| | MeteoSIX v5 | no-go para esta capa | Só predicións; útil na Fase 2 |
| Caudais dos ríos | Rede foronómica MeteoGalicia–Augas (`mgafos`) | **condicional** | Precisa chave gratuíta por correo; sen ela non se verifica o esquema |
| | SAIH Miño-Sil | no-go | Só táboa HTML; licenza boa pero sen feed |
| Zonas de produción | Intecmar API | **condicional** | JSON aberto e diario; falta xeometría das zonas e confirmar licenza |
| Focos de calor | NASA FIRMS (ficheiros Europa 24 h) | **go** | Sen chave, CC0 |
| Perímetros queimados | EFFIS WFS + XLSX anual da Xunta | **go** | CC BY 4.0 e aviso legal con cita |
| Calidade do aire | Rede galega (MeteoGalicia `caire`) | **go** | JSON aberto, horario |
| Avións | adsb.lol | **go** | ODbL; chave futura |
| | adsb.fi | no-go | Só uso persoal non comercial |
| Buques con AIS | AISStream | **condicional** | Sen termos de redistribución publicados |
| Concellos, parroquias e entidades | IET/IDEG + Nomenclátor + IGN | **condicional** | Conflito de licenzas da Xunta; IGN é a reserva limpa (sen parroquias) |
| Buses da Xunta | GTFS no NAP | **condicional** | Precisa rexistro e chave |
| Espazos protexidos | MITECO/IEPNB (Natura) + IDEG (Rede galega) | **go** (MITECO) / condicional (IDEG) | MITECO só pide cita |
| Patrimonio | IDEG PBA Afeccións | **condicional** | Licenza e sensibilidade dos xacementos |
| Tren (engadida o 18/10) | Renfe GTFS + GTFS-RT | **go** | Cobre Galicia (Alvia, Avlo, MD, Regional), CC BY 4.0 |

Condicionais do encargo:

| Fonte | Veredicto | Nota |
|---|---|---|
| Renfe GTFS-RT | **go** | Pasa á Fase 1 por decisión da FGS |
| Banco de Terras | no-go | Só visor; datos ligados a persoas |
| Grella 1 km² IGE | condicional | API CSV real; licenza específica non atopada |
| Rexistro eólico | condicional | Aeroxeradores no IDEG, sen MW nin promotor; licenza non declarada |

## O problema transversal: dúas licenzas da Xunta

- **abertos.xunta.gal** publica os seus conxuntos en **CC BY-SA 4.0** ([condicións de uso](https://abertos.xunta.gal/condicions-de-uso)): «deberá distribuírse baixo os termos da mesma licenza CC BY-SA 4.0». A etiqueta da páxina di «(CC-by 4.0)», pero a ligazón vai a `by-sa/4.0`.
- **O IET** (mapas.xunta.gal, IDEG) declara unha «licenza de uso compatible con CC- BY 4.0 INT.» ([aviso legal](https://mapas.xunta.gal/gl/aviso-legal)).
- Os mesmos conxuntos aparecen nas dúas canles: límites, espazos naturais, PBA e calidade do aire.

Isto afecta a 8 das 12 capas. Detalle e opcións en [`licences.md`](licences.md).

## Cambios fronte ao encargo

1. **Caudais**: o feed de Augas de Galicia é o servizo `mgafos` de MeteoGalicia, con chave. O SAIH Miño-Sil non ten feed. Na Fase 1 a capa cubriría Galicia-Costa e, para Miño-Sil, só unha ligazón ao SAIH ata que a CHMS ofreza un feed.
2. **Estacións**: non se precisa a chave de MeteoSIX. O servizo de observación é aberto. MeteoSIX queda para ondas e mareas (Fase 2).
3. **Lume, cifra da Xunta**: o ficheiro oficial `Lumes-2025-por-Distrito.xlsx` di **118.763,65 ha** e 1.475 lumes. A cifra do encargo, 118.966 ha, vén de notas de prensa de novembro de 2025. Proponse usar a do ficheiro, coa súa data.
4. **EFFIS**: o servizo WFS chámase «Test Service». Funciona, pero pode cambiar.
5. **Tren**: Renfe publica GTFS-RT aberto con servizos galegos. Entra na Fase 1 (decisión do 18/10/2026), sen tocar o visor web.
6. **Patrimonio**: a fonte localizada é unha capa urbanística (PBA), non o rexistro legal de Cultura. Hai 80.010 elementos de catálogo; os xacementos arqueolóxicos precisan xeneralización.

## Substitucións propostas

| Fonte con problema | Proposta |
|---|---|
| SAIH Miño-Sil (sen feed) | Escribir á CHMS pedindo un feed; mentres, ligazón ao SAIH |
| AISStream (sen termos) | Pedir permiso escrito ao operador. Se non, densidade de buques de EMODnet (CC BY 4.0, non verificado) ou capa desactivada |
| adsb.fi (non comercial) | Só adsb.lol. A medio prazo, instalar un receptor ADS-B para ter a chave futura de adsb.lol |
| Nomenclátor (BY-SA) | Publicalo como colección separada BY-SA, ou nomes de IDEG/IGN se o IET confirma CC BY |
| Banco de Terras | Cifras agregadas das memorias de Agader |

## Verificación con chaves (18/10/2026)

Corre en GitHub Actions (`verify-keys.yml`) cos segredos do repositorio e só imprime contas agregadas.

| Fonte | Resultado |
|---|---|
| FIRMS, API por área | **Funciona.** Detección en Galicia nos últimos 2 días: NOAA-20 11, NOAA-21 10, SNPP 1, MODIS 1 |
| AISStream | **Conecta.** En 3 min: 52 buques, 12 de clase B, 11 con tipo e eslora. Ritmo baixo (~0,4 mensaxes/s): a cobertura é parcial. Aplicando a regra de atraso, 48 de 52 irían atrasados, sobre todo porque nunha xanela tan curta non chegan os datos estáticos. Segue sen poderse publicar: faltan os termos |
| NAP | **Falla (401)** coa chave gardada. O valor non é unha chave válida ou aínda non está activa |
| Caudais (`mgafos`) | Chave solicitada; pendente de resposta |


Eu non podo rexistrarme nin pedir chaves. Pendentes:

| Acción | Para que capa | Como |
|---|---|---|
| ~~Pedir chave `mgafos`~~ (solicitada o 18/10) | Caudais | Agardar resposta e gardala como segredo |
| Revisar a chave do NAP (dá 401) | Buses | Copiar de novo a chave de API do perfil do NAP |
| Consulta de termos a AISStream | Buques | Issues do seu repositorio de GitHub |
| ~~FIRMS MAP_KEY~~ (feito) | Focos | |
| Consulta de licenza ao IET/Amtega | Territorio, espazos, patrimonio, aire, estacións | Carta da FGS (proposta de texto en `licences.md`) |
| Consulta de licenza a Intecmar e xeometría das zonas | Zonas de produción | Correo a Intecmar |

Gardar as chaves como segredos do repositorio: `METEOGALICIA_AFOROS_KEY`, `NAP_API_KEY`, `AISSTREAM_API_KEY`, `FIRMS_MAP_KEY`.

## Non verificado

- Esquema e cadencia de `mgafos` (sen chave).
- Licenza de `mgafos`, da API de Intecmar, do servizo eólico e da grella do IGE.
- Termos de AISStream e a súa cobertura real en Galicia.
- Licenza específica NOAA para NOAA-20/21 en FIRMS.
- Límites numéricos de adsb.lol e data da chave futura.
- Xeometría oficial das zonas de produción de Intecmar.
- Contido do ZIP GTFS do NAP (non descargado).
- Frecuencia real medida durante días (sonda en marcha).
