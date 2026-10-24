# Proposta para aprobar: lote de servizos, estradas, monte e comercio

Data: 24/10/2026. Detalle de cada fonte en `pipeline/sources.yaml` (entradas do 24/10/2026) e mostras en `pipeline/samples/`.

## Xa construído hoxe

| Capa | Contido | Licenza |
|---|---|---|
| Entidades de poboación | 36.190 lugares (IDEG, decembro 2025) | CC BY-SA 4.0 |
| Estacións de tren | 137 estacións con trens ao día (Renfe) | CC BY 4.0 |
| Historial de lumes | 977 áreas queimadas 2016–2025 (EFFIS), coas cifras da Xunta ao lado | Copernicus |
| Indicadores por concello | Engadidos explotacións agrarias, SAU e vivenda baleira | IGE / INE |

## Proposta: construír agora (fonte e licenza verificadas)

| # | Capa | Fonte | Galicia | Actualización | Colección |
|---|---|---|---|---|---|
| 1 | Centros de saúde e PAC | SERGAS (conxunto 0253) | 457 + 100 | diaria | CC BY-SA |
| 2 | Hospitais | SERGAS (0253) | 83 (deduplicar) | diaria | CC BY-SA |
| 3 | Farmacias | SERGAS (0253) | 1.382 | diaria | CC BY-SA |
| 4 | Centros educativos | Educación (0257) | 1.624 | diaria | CC BY-SA |
| 5 | Centros para persoas maiores | Política Social (0299) | 703 | mensual | CC BY-SA |
| 6 | Incidencias de tráfico | DGT, NAP | 50–60 activas | 5–10 min | ODbL (dúbida, ver abaixo) |
| 7 | Cabinas de radar e tramos de velocidade media | DGT, NAP | 71 + 10 | diaria | ODbL (dúbida) |
| 8 | Perigo de inundación T10/T100/T500 | MITECO SNCZI | tramos ARPSI | anual | CC BY 4.0 |
| 9 | Aloxamentos turísticos | REAT (0022) | ~4.500 con coordenadas | mensual | CC BY-SA |
| 10 | Vivendas de uso turístico por concello | REAT (0022) | 28.338, só contas | mensual | CC BY-SA |
| 11 | Comercio e servizos | OpenStreetMap (Geofabrik) | ~15.000 comercios, ~10.000 hostalaría | diaria | ODbL |
| 12 | Distancia a servizos desde cada lugar | Cálculo propio sobre 1–5 e as entidades | 36.190 lugares | mensual | CC BY-SA |

A capa 12 é a que ninguén publica: minutos ou quilómetros desde cada lugar ao centro de saúde, farmacia, escola e PAC máis próximos. Primeiro en liña recta; a distancia por estrada precisa un motor de rutas e queda para máis adiante.

## Decisións que che pido

1. **Aprobar as capas 1–12** (ou dicirme cales non).
2. **Balizas V16:** propoño amosalas só en directo, sen o identificador do dispositivo e sen gardar histórico. Son posicións de coches particulares avariados. Si ou non.
3. **DGT:** a ficha do NAP di CC BY, pero o aviso legal da DGT restrinxe reproducións. Propoño publicar incidencias e radares (é o mesmo criterio que xa usamos coa recarga) e mandar unha consulta a nap@dgt.es. Si ou non.
4. **Nova ferramenta en CI:** a capa 11 precisa `osmium` (libre, GPL) para ler o extracto de OSM. Non é un servizo de terceiros nin custa diñeiro.
5. **Hostalaría do REAT** (19.268 bares, restaurantes e cafetarías) non trae coordenadas. Xeocodificar con CartoCiudad (IGN, gratuíto) suporía un servizo externo novo no pipeline, non no navegador. Pídoche permiso antes de engadilo.

## Condicionais (agardan unha resposta de fóra)

| Fonte | Que falta |
|---|---|
| Montes veciñais en man común (3.331, ~662.000 ha) | Licenza: o servizo non a declara. Consulta ao IET ou a Medio Rural |
| Aeroxeradores (327 parques) | Licenza non declarada e sen MW nin promotor. Pedir rexistro aberto á Consellería de Economía |
| Risco diario de incendio (IRDI) | Só imaxes e HTML. Pedirlle a Medio Rural un CSV ou JSON por concello |
| Feiras e mercados | 105 puntos de Turismo de Galicia sen calendario; licenza da exportación sen confirmar |
| Overture / Foursquare | Licenzas mixtas e conta; só para encher ocos de OSM |

## Non viable

- **Valoracións de establecementos:** Google, Tripadvisor e Yelp prohiben gardar e redistribuír. A única fonte aberta (Mangrove, CC BY 4.0) ten 6 reseñas en Galicia.
- **Risco de incendio como feed:** non existe hoxe.

## Novas cartas propostas

DGT (licenza do NAP), IET/Medio Rural (montes veciñais), Medio Rural (IRDI), Economía (rexistro eólico), Turismo de Galicia (feiras).
