# Informe de fontes, lote 1b (24/10/2026)

Segunda rolda de verificación, despois de comparar con Lemuriant e coas peticións da FGS: avisos e fenómenos en tempo real, mar, indicadores municipais do IGE, redes privadas e cidadás de sensores e datos abertos de empresas. O mesmo método da Fase 0: chamada real, mostra gardada (local), licenza citada. O detalle está en `pipeline/sources.yaml` (entradas con `phase: "1b"`).

Comprobei eu mesmo, con chamadas propias, EMSC, AEMET CAP, raios e avisos de MeteoGalicia, METAR, o índice de Copernicus Marine, a API do IGE, Meteoclimatic, Sensor.Community, gasolineiras, GBFS de Arteixo e o feed de recarga.

## Capas que se poden construír xa (licenza clara, sen VPS)

| Capa proposta | Fonte | Licenza | Galicia | Actualización |
|---|---|---|---|---|
| Terremotos recentes | EMSC (solucións do IGN) | CC BY 4.0 | 25 sismos en 30 días | 10 min |
| Avisos meteorolóxicos | AEMET CAP (polígonos) + MeteoGalicia por concello | Nota legal AEMET / aviso MeteoGalicia | toda Galicia | 10 min |
| Raios | MeteoGalicia | aviso legal MeteoGalicia (colección CC BY-SA) | 147 raios do 17 ao 23/10 | 10 min |
| Aeroportos e heliportos | OurAirports | Dominio público | 40 | diaria |
| Pasaxeiros por aeroporto | Eurostat avia_paoa | reutilización citando Eurostat | 3 aeroportos | mensual |
| Prezos dos carburantes | Ministerio (MITERD) | Lei 37/2007, cita | 727 gasolineiras | 30 min |
| Puntos de recarga eléctrica | NAP DGT (datos MITERD) | CC BY | 460 localizacións | diaria |
| Bicicleta pública de Arteixo | GBFS nextbike | CC0 | 15 estacións | 10 min |
| Cobertura de banda larga | Ministerio de Transformación Dixital | Lei 37/2007, cita | 313 concellos | anual |
| Indicadores municipais comparados con Galicia | API do IGE | aviso legal IGE (colección CC BY-SA; ver condición) | 313 concellos | mensual/anual |

Os indicadores do IGE amósanse como índice (Galicia = 100) ou diferenza en puntos, sempre co valor orixinal ao lado e marcado como cálculo propio, porque as condicións da API do IGE din que non se modifiquen os datos presentados. Proposta de 12 indicadores: envellecemento, % de 65 e máis, idade media, variación da poboación en 10 anos, densidade, renda dispoñible por habitante, % de poboación estranxeira, saldo migratorio, % de afiliación no agro e na pesca, paro rexistrado (relativo á poboación en idade de traballar), gando bovino e natalidade (calculada en media de 3 anos para evitar o segredo estatístico).

Xa construídas no mesmo día, coas chaves da FGS: **caudais dos ríos** (87 estacións) e **paradas de bus da Xunta** (25.118).

## Condicionais (técnicamente listas, falta un permiso ou unha conta)

| Fonte | Que falta |
|---|---|
| METAR dos aeroportos (NOAA, datos de AEMET) | Confirmar con AEMET que a súa nota legal cobre os METAR |
| Boias e mareógrafos (Copernicus Marine) | Confirmar a licenza e se hai que aceptar o acordo de servizo; precisa lector NetCDF (dependencia nova) |
| BiciCoruña (GBFS) | Licenza non declarada: preguntar ao Concello da Coruña |
| Meteoclimatic (35 estacións) | Licenza CC BY-NC-ND: só con permiso escrito |
| CWOP (~17 estacións de radioafeccionados) | Conta en MADIS (NOAA), que ten que abrir a FGS |
| MeteoEscolas (179 estacións escolares) | Sen servizo de datos: pedirllo a MeteoGalicia |
| Smart Citizen | Licenza dos datos sen atopar |
| Open Charge Map | Chave gratuíta; achega pouco sobre o NAP |

## Non viables (os termos prohiben redistribuír ou non hai datos)

- **Prohiben redistribuír:** Davis WeatherLink (API de pago e sen termos publicados), Netatmo, Weather Underground, PurpleAir, Electromaps, Aena (autorización escrita), Red Eléctrica (só uso non comercial), UFD-Naturgy (prohibido o uso), Portos do Estado (prohibida a cesión a terceiros), MeteoAlarm (condicións incompatibles).
- **Sen datos en Galicia:** Sensor.Community, openSenseMap, AirGradient (0 sensores activos), Safecast (só 2014–2019), Inside Airbnb (ningunha cidade galega), IGN GeoRSS (filtrado).
- **Sen datos abertos:** Gadis, Abanca, Hijos de Rivera, Inditex, Vegalsa.

## Privacidade nas estacións domésticas e cidadás

Se algunha rede cidadá chega a entrar: posición xeneralizada (hexágono de ~5 km² ou 0,01°), sen nomes de propietario nin indicativos de radioafeccionado, e fóra os dispositivos interiores e móbiles.

## Cartas e consultas propostas

1. **AEMET:** METAR dos aeroportos galegos.
2. **Copernicus Marine:** licenza e acordo de servizo para boias e mareógrafos.
3. **IGE:** publicación de índices derivados xunto ao valor orixinal.
4. **EMSC:** gardar un arquivo histórico dos sismos de Galicia.
5. **Concello da Coruña:** licenza do GBFS de BiciCoruña.
6. **Meteoclimatic:** permiso para as 35 estacións galegas.
7. **MeteoGalicia:** servizo de datos de MeteoEscolas e licenza do servizo de aforos.
8. **Red Eléctrica e UFD:** autorización para xeración en Galicia e capacidade por subestación.
