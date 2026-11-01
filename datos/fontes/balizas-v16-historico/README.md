# DGT · Balizas V16 conectadas (histórico)

Fonte para o mapa **Uso das balizas V16 desde que temos datos**.

**Semáforo: vermello** para un mapa animado hoxe. A DGT non publica histórico: o NAP ten 37 conxuntos e ningún é un arquivo de incidencias nin de balizas. O único histórico é o noso: 44 instantáneas da capa `trafico-balizas-v16` na rama `data` (25/10–01/11/2026), unha cada 3,9 h de mediana. Unha baliza está activa uns 25 minutos, así que entre dúas instantáneas pasan sen rexistrar case todas: as 197 observacións son unha mostra casual, non un reconto. Para ter un mapa honesto hai que empezar agora un arquivo agregado propio (contas, non puntos) cada 10 minutos e esperar meses. Ademais, a historia en git choca coa regra de privacidade da capa (ver Privacidade).

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Conxunto | NAP de tráfico, «Incidencias DGT DATEX2 v3.7»: https://nap.dgt.es/es/dataset/incidencias-dgt-datex2-v3-7. As balizas son os rexistros con `situationRecordCreationReference` que empeza por `V16_`. |
| Descarga | `https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml` (só o estado actual; gzip). Arquivo propio: `git log origin/data -- trafico-balizas-v16/` no repositorio (público en GitHub). |
| Formato | DATEX II v3.7 XML. Na capa: GeoJSON de puntos con estrada, pk (100 m), concello, provincia e `desde` (redondeado a 5 min). |
| Campos | Por baliza no feed: referencia V16_, hora de activación (`overallStartTime`), causa `vehicleObstruction/vehicleStuck`, estrada, pk, coordenadas, concello, provincia, comunidade. |
| Licenza | Ficha do NAP: «Licencia: Creative Commons Attribution» (lido hoxe na páxina do conxunto). «Términos de Uso» remiten ao aviso legal da DGT (https://www.dgt.es/contenido/aviso-legal/). Confirmación por escrito a nap@dgt.es pendente (`pipeline/layers/trafico-balizas-v16/layer.yaml`). |
| Atribución | «Fonte: DGT, Punto de Acceso Nacional de Tráfico» |
| Resolución temporal | Feed: estado cada ~1–2 min. Arquivo propio: instantánea cada 3,9 h de mediana (máximo 7,2 h); o cron declarado de 10 min non se cumpre. |
| Resolución territorial | Punto (≈10 m na capa); estrada e pk |
| Período dispoñible | 25/10/2026 11:16Z → 01/11/2026 09:54Z (7 días) no arquivo propio. Nada antes. |
| Frecuencia | Continua no feed; irregular no arquivo |
| Tamaño | Feed: ~0,1 MB gzip por descarga. Instantáneas: 44 × 1–3 KB. |
| Quebras | Horas sen mostra (03, 06 e 15 UTC nunca; 11 UTC seis veces): o día non está cuberto por igual. 7 instantáneas con 0 balizas, todas entre as 22 e as 06 UTC. Non hai forma de saber cantas balizas se activaron entre instantáneas. |
| Privacidade | Unha baliza V16 é un vehículo particular detido. A capa promete «Sen histórico: só o ficheiro actual» e o id cambia en cada descarga, pero a rama `data` é pública e garda cada versión con `desde` (5 min), estrada e pk (100 m) e punto (10 m): coa terna `desde`+estrada+pk pódese seguir a mesma activación entre instantáneas (192 activacións distintas en 197 observacións). Non hai matrícula nin dispositivo, pero non cumpre o que di `privacy_notes`. Decidir se a rama `data` debe gardar esta capa (ou só contas) antes de calquera mapa. A mostra desta carpeta só ten contas. |

## Mostra (`mostra/`)

`python3 -I descargar.py` (5 peticións e git local): agrega as instantáneas da rama `data`, fai unha chamada ao feed (só contas), lista o catálogo do NAP e le a licenza.

| Ficheiro | Contido |
|---|---|
| `instantaneas_rama_data.csv` | 44 filas: hora, activas, por provincia, por tipo de vía e minutos de activación (mediana). Sen coordenadas, estrada, pk nin id. |
| `rexistro.json` | Peticións, resumo, catálogo do NAP (37 conxuntos) |

### Primeira lectura

- 197 observacións de baliza en 44 instantáneas: media 4,5 activas en Galicia, máximo 14 (29/10 19:44Z), 7 instantáneas con ningunha.
- Por provincia: A Coruña 82, Pontevedra 62, Lugo 27, Ourense 26. Por vía: autonómicas 85, AP 36, autovías estatais 32, nacionais 27, provinciais 8, outras 9.
- Mediana de 27 minutos desde a activación no momento da instantánea. No feed en vivo (01/11 12:33Z): 73 balizas activas en España, 10 en Galicia, mediana 24 minutos.
- Con balizas de ~25 min e instantáneas cada ~4 h, o arquivo ve arredor dunha de cada dez activacións (estimación grosa, non medida).

## Proposta de mapa

Hoxe non hai mapa animado honesto. Proposta: unha capa nova de arquivo, `balizas-v16-contas`, que en cada execución garde só **contas por hora e concello (ou tramo de estrada) e minutos activos**, sen puntos nin horas de activación, e un cron que se cumpra (o de 10 min non se cumpre: na práctica corre cada ~4 h). Con 3–6 meses de contas pódese facer un mapa de calor por concello e hora da semana. Mentres, a capa en directo segue como está. O mapa nunca pode mostrar a causa (avaría, accidente, saída de vía), nin os vehículos sen baliza conectada, e a adopción das V16 conectadas medra: unha subida no tempo pode ser máis balizas vendidas e non máis incidencias.
