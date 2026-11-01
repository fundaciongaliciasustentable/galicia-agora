# Intecmar · Estado das zonas de produción de moluscos

Fonte para o mapa **Zonas de produción abertas e pechadas** (biotoxinas e clasificación microbiolóxica).

**Semáforo: amarelo.** O estado do día sae dunha API JSON aberta e documentada, sen chave. Pero non hai histórico estruturado: a API só dá o estado actual, os informes pasados son PDF escaneados (imaxe sen texto) dos últimos seis meses ou un ano, e o único histórico longo son táboas HTML de días de peche ao mes. Faltan tamén a licenza explícita para reutilizar a API e a xeometría oficial das zonas. Antes de parsear PDF hai que preguntarlle a Intecmar.

Verificado con chamadas reais o 1 de novembro de 2026. Xa estaba en `pipeline/sources.yaml` (`intecmar-zonas`, condicional desde o 18/10/2026); esta ronda engade o histórico e as condicións legais.

## Ficha

| Campo | Valor |
|---|---|
| Portal | https://www.intecmar.gal/Informacion/Default.aspx |
| API (estado actual) | `https://www.intecmar.gal/Api/EstadoZonasProducion/EstadoZonasBiotoxinas` e `.../ClasificacionMicrobioloxicaZonas`. Filtros `Tipo`, `Codigo`, `Estado`. Documentación: https://www.intecmar.gal/Informacion/ServizoEstadoZonas.pdf (edición 0, xaneiro de 2020) |
| Histórico de informes | https://www.intecmar.gal/Informacion/biotoxinas/EstadoZonas/Historico.aspx → `Historico_Batea.aspx`, `Historico_Infaunais.aspx`, `Historico_Pectinidos.aspx`, `Historico_Vieira.aspx`. PDF en `https://www.intecmar.gal/PDFs/EstadoZonas/VFlotantes/AAAAMMDDhhmm_NNN.PDF` (e `Infaunais/`). Paxinación por *postback* ASP.NET. |
| Días de peche ao mes | https://www.intecmar.gal/Informacion/biotoxinas/Evolucion/CierresBatea.aspx e `CierresInfaunais.aspx`. Anos 1996–2026 e filtro por toxina (PSP, lipofílicas, ASP) por *postback*; sen el, só o ano en curso. |
| Resolucións de clasificación | https://www.intecmar.gal/Informacion/microbio/resoluciones.aspx → `HistoricoMicrobioloxia.aspx` (listaxe de PDF). Non se abriu ningún PDF de resolución nesta ronda. |
| Formato | API: JSON. Informes: PDF raster (Ghostscript, 300 ppp, 2 páxinas, sen capa de texto). Días de peche: táboa HTML. |
| Campos da API | `tipo` (BI_CV batea, BI_MI infaunais, BI_MP pectínidos, GA gasterópodos, EQ equinodermos), `codigo`, `nome`, `estado` (Aberta/Pechada), `toxicidade` (PSP, Lipofílicas, ASP, Cautelar), `estadoDetalle` (códigos da Orde do 14/11/1995: B1, B2, C1, CC, D…), `dataSituacionAdministrativa` (último cambio), `excepcions` (especie FAO), `relacionsZonasMicrobioloxia`. Clasificación: `estado` A/B/C, `cultivoViveiros`. |
| Licenza | **Non verificada para a API.** A páxina de condicións do servizo de datos só exclúe responsabilidade: «A información proporcionada polo servizo ofrécese con carácter meramente informativo» (https://www.intecmar.gal/Informacion/CondicionsLegais.aspx). O pé remite ao aviso legal da Xunta (reutilización citando a fonte e sen desnaturalizar), pero non está confirmado que cubra a API. Non hai conxunto en abertos.xunta.gal (busca «intecmar» e «moluscos»: 0 resultados). |
| Atribución proposta | «Fonte: INTECMAR. Consellería do Mar, Xunta de Galicia» (pendente de confirmar) |
| Resolución temporal | API: instantánea (varias actualizacións por día laborable; 31/10/2026 07:48). Informes: un por cambio, ata dous ou tres ao día (batea: nº 374 o 24/10 e nº 383 o 31/10/2026). Días de peche: mes. |
| Resolución territorial | Zona de produción: 186 zonas de biotoxinas e 143 zonas microbiolóxicas (GAL-xx). Sen xeometría. |
| Último período | Estado do 31/10/2026 07:48. Días de peche: 2026 ata outubro. |
| Frecuencia | Diaria en días laborables (medida o 18/10 e o 31/10/2026) |
| Tamaño | JSON 59 KB + 37 KB; PDF de informe ~0,3 MB; táboa de días de peche ~2 KB en CSV |
| Quebras | Zonas redefinidas por ordes (1995, 2006, 2010, 2013, 2015, 2021): os códigos de polígono cambian co tempo. O histórico de informes só cobre 6 meses (batea) ou 1 ano (infaunais e pectínidos). |
| Privacidade | Ningunha |

## Mostra (`mostra/`)

`python3 -I descargar.py` (12 peticións, ~20 s).

| Ficheiro | Contido |
|---|---|
| `EstadoZonasBiotoxinas.json` | Estado das 186 zonas o 31/10/2026 07:48 |
| `ClasificacionMicrobioloxicaZonas.json` | Clasificación A/B/C das 143 zonas |
| `dias_peche_batea_2026.csv` | Días de peche por polígono de bateas e mes, 2026 (56 filas) |
| `dias_peche_infaunais_2026.csv` | Igual para moluscos infaunais (39 zonas) |
| `informe_batea_202610310746_383.PDF`, `informe_infaunais_202610281437_084.PDF` | Último informe de cada histórico, para ver o formato |
| `rexistro.json` | URL, estado HTTP, bytes e hora de cada petición, e resumo |

### Primeira lectura

- 31/10/2026: 165 zonas abertas e 21 pechadas (10 cautelares, 7 por lipofílicas, 4 por ASP). Clasificación: 22 A, 102 B, 19 C.
- Días de peche en 2026: Grove B (Ostra) 304, Bueu A1/A2/B 231–234, Portonovo B 202; en infaunais, Viveiro-Celeiro 200 e Vigo IV.2 145.
- O visor `http://sig.intecmar.gal/EstadoZonas` deu 503 nas dúas probas: non se puido ver se serve xeometría.

## Por que non parsear os PDF

Os informes son imaxes escaneadas: habería que facer OCR de táboas, con erros silenciosos en códigos como `ARO-VIII.3`. Ademais só cobren 6–12 meses. Proposta: **escribir a Intecmar** (o enderezo de contacto está en https://www.intecmar.gal/contactar/Default.aspx) e pedir (1) confirmación da licenza da API, (2) o histórico de aperturas e peches como táboa (zona, data, estado, toxina) e (3) os polígonos das zonas en SIX. Mentres, a fase 1 pode **arquivar a API cada día** (un JSON de 59 KB): en seis meses teríamos un histórico propio, diario e limpo.

## Proposta de mapa

Reloxo de **días**: cada zona de produción pinta aberta/pechada e a toxina que a pecha, día a día, co histórico que acumulemos desde o arquivo diario. Para ver anos, outro reloxo de **meses** (1996–2026) cos días de peche de cada polígono de bateas e zona infaunal, se Intecmar dá os polígonos ou se poden debuxar desde as ordes publicadas no DOG. O dato non di canto marisco se deixou de extraer nin o impacto económico; só o estado administrativo da zona. Sen xeometría oficial, a versión mínima son puntos aproximados por zona, identificados como tales.
