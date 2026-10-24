# Auditoría de utilidade: que datos faltan en Galicia Agora

Data: 24/10/2026. Base: as 21 capas publicadas, os informes de fontes (`sources-report.md`, `sources-report-1b.md`), o backlog (`roadmap.md`) e o encargo.

## 1. Diagnóstico

Galicia Agora ten hoxe 21 capas. Están ben cubertos o tempo e o aire (6 capas), a mobilidade (6) e o territorio administrativo e ambiental (7). Faltan os temas que máis lle importan á fundación e a quen vive no rural:

| Tema | Capas hoxe | Baleiro principal |
|---|---|---|
| Auga e mar | 1 (caudais) | Mar, rías, praias, encoros, inundacións, calidade da auga |
| Lume e monte | 2 (focos, queimado) | Risco de incendio, monte veciñal, usos forestais, historial de lumes |
| Agro e produción | 0 | Explotacións, usos do solo, viño, gando, lonxas |
| Servizos e vida diaria | 0 | Saúde, educación, farmacias, distancia aos servizos |
| Vivenda e poboación fina | 1 (indicadores por concello) | Entidades de poboación, grella de 1 km², vivenda baleira, uso turístico |
| Enerxía | 0 | Eólica instalada e en tramitación, hidroeléctricas |

O mapa responde «que pasa agora» (tempo, lume, tráfico), pero aínda non responde ben ás preguntas que fai a xente sobre o seu territorio: canto lle queda ao centro de saúde máis próximo, que monte é veciñal, se o seu concello perde poboación ou onde están os parques eólicos.

Hai un segundo baleiro, que non se arranxa con máis capas: **cruzar o que xa temos**. Hoxe cada capa vai soa. Unha ficha por concello que xunte indicadores, servizos, avisos e lumes daría máis utilidade que dez capas soltas.

## 2. Criterios de prioridade

Cada candidata valórase en tres eixos (alto, medio, baixo):
- **Utilidade:** responde unha pregunta real de quen vive, traballa ou decide no rural galego.
- **Viabilidade:** fonte aberta, formato lexible por máquina e licenza probable. Ningunha está verificada aínda: todas pasan pola Fase 0 antes de construírse.
- **Singularidade:** o que ninguén máis xunta para Galicia.

## 3. Candidatas

### Lume e monte
| Capa | Fonte probable | Utilidade | Viabilidade | Nota |
|---|---|---|---|---|
| Risco de incendio diario por concello | MeteoGalicia (índice de risco) | Alta | Media | Clave no verán; complementa os focos |
| Montes veciñais en man común | Xunta (IDEG, cartafol MONTESCOMUN) | Alta | Media | Un terzo do monte galego; tema central da fundación |
| Historial de áreas queimadas 2016–2025 | EFFIS (capas anuais xa verificadas) | Media | Alta | Só hai que engadir os anos ao adaptador |
| Mapa forestal e especies | MITECO (Mapa Forestal / IFN4) | Media | Media | Eucalipto, piñeiro e frondosas por zona |
| Polígonos agroforestais e aldeas modelo | Consellería do Medio Rural | Media | Baixa | Política rural activa; comprobar se hai datos descargables |

### Auga e mar
| Capa | Fonte probable | Utilidade | Viabilidade | Nota |
|---|---|---|---|---|
| Zonas de produción e biotoxinas | Intecmar (API verificada) | Alta | Media | Pendente de licenza e polígonos |
| Zonas inundables | MITECO SNCZI | Alta | Media | Risco real en vilas de río |
| Praias: calidade da auga de baño | Náyade (Ministerio de Sanidade) | Media | Media | Estacional |
| Reserva dos encoros | Boletín hidrolóxico (MITECO) / Augas de Galicia | Media | Media | Seca e xeración hidroeléctrica |
| Boias, ondas e mareógrafos | Copernicus Marine (verificado) | Media | Media | Pendente da conta e da licenza |
| Prezos nas lonxas | Plataforma de pesca da Xunta | Alta | Baixa | Economía do mar; comprobar se hai feed aberto |

### Agro e produción
| Capa | Fonte probable | Utilidade | Viabilidade | Nota |
|---|---|---|---|---|
| Usos agrarios do solo | SIGPAC (FEGA / Xunta) | Alta | Media | Moi pesado; publicar agregado por parroquia |
| Explotacións e superficie agraria por concello | Censo Agrario 2020 (IGE/INE) | Alta | Alta | Encaixa na capa de indicadores |
| Denominacións de orixe (viño e outras) | MAPA / Xunta | Media | Media | Identidade produtiva do territorio |
| Gandería por especie | IGE (táboas xa coñecidas) | Media | Alta | Ampliación dos indicadores |
| Pagamentos da PAC agregados por concello | FEGA | Media | Baixa | Só agregados, nunca beneficiarios |

### Servizos e poboación
| Capa | Fonte probable | Utilidade | Viabilidade | Nota |
|---|---|---|---|---|
| **Entidades de poboación** | IDEG (verificado, 36.190 lugares) | Alta | Alta | Pendente desde a Fase 1; base para o resto |
| Centros de saúde e hospitais | SERGAS / abertos.xunta.gal | Alta | Media | |
| Centros educativos | Consellería de Educación / abertos | Alta | Media | |
| Farmacias | Colexios / Xunta | Alta | Media | Comprobar licenza |
| **Distancia a servizos desde cada lugar** | Cálculo propio sobre OSM e as capas anteriores | Alta | Media | O dato que ninguén publica; mide o illamento real |
| Poboación en grella de 1 km² | IGE (verificado) | Alta | Media | Pendente da licenza do IGE |
| Vivendas de uso turístico | Rexistro de Turismo da Xunta (REAT) | Media | Media | Presión sobre a vivenda na costa |
| Vivenda baleira por concello | INE, Censo 2021 | Media | Alta | Encaixa na capa de indicadores |

### Enerxía
| Capa | Fonte probable | Utilidade | Viabilidade | Nota |
|---|---|---|---|---|
| Parques eólicos instalados e en tramitación | IDEG (verificado, licenza sen declarar) | Alta | Media | Tema de alto conflito social; trato igual a promotores e veciñanza |
| Centrais hidroeléctricas e encoros | MITECO | Media | Media | |

### Mobilidade
| Capa | Fonte probable | Utilidade | Viabilidade | Nota |
|---|---|---|---|---|
| Incidencias de tráfico en tempo real | DGT, DATEX II no NAP | Alta | Alta | Mesmo formato que xa lemos para a recarga |
| Localización das cámaras de tráfico | DGT (verificado) | Media | Alta | Sen imaxes ata consultar á DGT |
| Estacións de tren | GTFS de Renfe (xa descargado) | Media | Alta | Complemento inmediato da capa de trens |
| Avións | adsb.lol | Alta | Media | Agarda polo acceso ao VPS |

### Cultura e paisaxe
| Capa | Fonte probable | Utilidade | Viabilidade | Nota |
|---|---|---|---|---|
| Camiños de Santiago | IDEG (PBA) | Media | Alta | Iconicidade e turismo |
| Catálogo completo de patrimonio | IDEG (PBA, 80.010 elementos) | Media | Media | Coidado cos xacementos |

## 4. Máis valor co que xa temos

1. **Ficha por concello e por parroquia.** Unha páxina por lugar con indicadores, servizos próximos, avisos activos, lumes da tempada, espazos protexidos e transporte. É o paso de mapa a ferramenta, e dálle a cada concello un enlace propio para compartir.
2. **Series temporais.** A rama `data` xa garda cada versión dos datos vivos desde o 18/10/2026. Abonda con amosar a evolución (caudais, aire, raios, lumes) para ter un arquivo propio, que é un dos obxectivos da Fase 4.
3. **Descargas e API sinxela.** Os ficheiros xa se publican; falta unha páxina que os explique e un índice estable.
4. **Fontes en conflito, lado a lado.** Xa se fai co lume (Xunta fronte a EFFIS). Pódese estender a auga (Augas de Galicia fronte a CHMS) e á poboación (padrón fronte a grella).

## 5. Recomendación: os dez seguintes

Por utilidade para a fundación e viabilidade:

1. **Entidades de poboación** (xa verificada; base para as fichas e a distancia a servizos).
2. **Risco de incendio diario por concello** (MeteoGalicia).
3. **Montes veciñais en man común** (IDEG).
4. **Centros de saúde, centros educativos e farmacias**, e despois a **distancia a servizos** desde cada lugar.
5. **Incidencias de tráfico** (DGT).
6. **Zonas inundables** (SNCZI).
7. **Parques eólicos** (IDEG; licenza a consultar).
8. **Censo agrario e vivenda baleira** como novos indicadores por concello.
9. **Historial de lumes 2016–2025** e **estacións de tren** (ampliacións rápidas de capas existentes).
10. **Ficha por concello**, que xunta todo o anterior.

Os puntos 1, 8 e 9 son rápidos porque reutilizan fontes xa verificadas. O resto necesita a verificación da Fase 0 (unha xornada por lote, co mesmo método).

## 6. Fóra de alcance, para non volver sobre elas

Datos comerciais non redistribuíbles (Flightradar24, MarineTraffic, Google, Netatmo, Davis, PurpleAir), licenzas non comerciais (Ookla, Global Fishing Watch), mobilidade derivada de teléfonos e tarxetas (CARTO, Unacast) e titularidade catastral. Ver `sources-report-1b.md`.
