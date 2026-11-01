# Fontes dos mapas animados · Fase 0

Verificación feita o 1 de novembro de 2026 con descargas reais. Cada fonte ten en `fontes/<id>/` un README, un `descargar.py` (só biblioteca estándar; executar con `python3 -I`) e unha mostra de menos de 5 MB con `rexistro.json`.

## Semáforo

| Mapa | Fonte | Semáforo | Resolución | Último dato | Mostra | Razón |
|---|---|---|---|---|---|---|
| Galicia en movemento | [MITMA, mobilidade big data](fontes/mitma-mobilidade/) | Verde | Hora · 208 zonas municipais (291 de distrito) | 8/12/2025 | 2,2 MB | Aberto, horario, 1,1 MB/día filtrado. Período de referencia anterior a xullo de 2025: desde entón só hai semanas soltas e cambiou a metodoloxía. |
| Entradas e saídas das sete cidades | MITMA (a mesma) + Pulso (`pipeline/layers/pulso-tren`, `pulso-bus`) | Verde | Hora · zona | 8/12/2025 | 60 KB | Media de 4 mércores (maio de 2025) e 4 domingos (11, 18 e 25 de maio e 1 de xuño) para os dous aneis: 24 KB de dato final. Mércores ±2–3 %, domingos ±3–8 %. |
| Meteoroloxía hora a hora | [MeteoGalicia, observación](fontes/meteogalicia-horario/) | Verde (día) / amarelo (ano horario) | Hora · 155 estacións | Tempo real | 2,8 MB | Un día = 310 peticións sen erros. Un ano horario arrisca o bloqueo de IP: usar diario ou pedir o ficheiro. |
| Focos de calor (agosto de 2025) | [NASA FIRMS](fontes/nasa-firms/) | Verde | Pasada · píxel 375 m / 1 km | 2025 completo | 1,1 MB | Arquivo por país sen chave (VIIRS S-NPP e MODIS). NOAA-20/21 precisan a API con chave. |
| Poboación estacional | [IGE, carga de poboación](fontes/ige-poboacion-estacional/) | Verde | Trimestre · 313 concellos | 2025/II (provisional) | 2,0 MB | API aberta, serie desde 2011, compoñentes desde 2016. |
| Un século de poboación | [INE, alteracións dos municipios](fontes/ine-censos-historicos/) | Verde | Censo · 313 concellos (1900–2021) | Censo 2021 | 0,2 MB | Sen descarga masiva: 472 consultas por código. Harmonizado aos límites de hoxe. |
| O aire hora a hora | [MeteoGalicia, calidade do aire](fontes/meteogalicia-aire/) | Verde (24 h) | Hora · 46 estacións | Tempo real | — | Datos sen validar; histórico máis longo non dispoñible no servizo. |
| Lonxas, primeira venda | [Pesca de Galicia](fontes/lonxas-primeira-venda/) | Verde | Día · lonxa · especie (2003–2025) | 2025 | 1,4 MB | CSV anuais abertos, CC BY-SA 4.0. 58 lonxas situadas co NGBE do IGN; feito: capa `lonxas-2025` e `/pulso/lonxas/`. |
| Migracións entre concellos | [INE EMCR](fontes/ine-emcr-migracions/) | Amarelo | Ano/trimestre · comarca (completa) ou 56 concellos grandes | 2024 | 3,7 MB | O INE borra o código dos concellos de menos de 10.000 habitantes; matriz completa só por comarcas (IGE 10616, 563). Quebra 2020→2021. |
| Galegos no estranxeiro | [IGE / PERE](fontes/ige-pere-estranxeiro/) | Amarelo | Ano · concello (sen país) | 2026 | 3,5 MB | País × concello non publicado; é un stock e mide a diáspora con nacionalidade, non a emigración. |
| PAC, beneficiarios | [FEGA](fontes/fega-pac/) | Amarelo | Exercicio · concello × medida | 2025 | 0,2 MB | Só 2024 e 2025 descargables; agregado sen nomes, cela mínima 10. |
| Contratación pública | [PLACSP](fontes/contratacion-publica/) | Amarelo | Mes · órgano; CP do adxudicatario no 33–65 % | 10/2026 | 1,3 MB | Ficheiros grandes, incidencias xullo–outubro 2026, Xunta sen CP nin menores. Só contas, sen adxudicatarios. |
| Zonas de marisqueo | [Intecmar](fontes/intecmar-zonas/) | Amarelo | Día · zona (só estado actual) | Hoxe | 0,7 MB | API aberta sen histórico nin polígonos; licenza non verificada. Pedir a Intecmar e arquivar xa. |
| Mareas | [Copernicus Marine IBI](fontes/mareas/) | Amarelo | Minuto · 8 mareógrafos | Tempo real | 1,3 MB | NetCDF (dependencia nova); ceros distintos por porto; orixe Portos do Estado, confirmar. |
| Verdor (NDVI) | [MODIS MOD13Q1](fontes/ndvi/) | Amarelo | 16 días · 250 m | 30/09/2026 | 3,0 MB | Sen chave vía Planetary Computer, pero faltan composicións de 2025; a oficial pide conta. |
| Parques eólicos | [MITECO + OSM](fontes/parques-eolicos/) | Amarelo | Ano de entrada · parque | 2025 | 0,5 MB | Datas sen coordenadas e coordenadas sen datas; 78 de 165 casados por nome. |
| Oficina do Peregrino | [Catedral de Santiago](fontes/oficina-peregrino/) | Vermello | Mes · camiño, país… | 31/10/2026 | — | Só un panel Power BI; o aviso legal prohibe reproducir sen autorización. Pedir permiso. |

## Achados que cambian o encargo

1. **MITMA xa non publica todos os días.** Desde o 1 de xullo de 2025 só hai semanas de mostra (agosto, outubro e decembro de 2025) e nada de 2026. A «actualización mensual automática» non se pode aplicar a estes dous mapas; serán dun período fixo. Proposta de mes tipo: maio de 2025.
2. **Cambio metodolóxico en xullo de 2025.** Non comparar volumes entre antes e despois. Afecta a calquera idea de usar agosto de 2025 (lumes) con mobilidade.
3. **A GAU de MITMA xunta Vigo e Pontevedra.** Para os aneis hai que partila; Ourense só pode medrar limpo ata Barbadás.
4. **Rural en bloques.** 159 dos 313 concellos van en 54 zonas agregadas de MITMA. O mapa de fluxos debe debuxar eses bloques, non concellos.
5. **FIRMS en Galicia ten catro xanelas de paso** (01–04, 09–11, 12–15 e 20–22 UTC). A animación de agosto será por pasadas.
6. **IGE: o ano *a* publícase en *a+2*.** O último ano definitivo é 2024; o verán de 2025 aínda non está.

## Decisións

Tomadas por Marcos o 1/11/2026:

1. Aneis das sete cidades: anel 0 = concello; anel 1 = concello e área urbana, coa GAU de Vigo–Pontevedra partida. Lista en [`pipeline/layers/mobilidade-cidades/aneis.json`](../pipeline/layers/mobilidade-cidades/aneis.json).
2. Mes tipo para o día: maio de 2025 (4 mércores e 4 domingos). O domingo 4 de maio, volta da ponte, cámbiase polo 1 de xuño.
3. Día de referencia meteorolóxico: mércores 21 de maio de 2025, un dos catro da media de MITMA (seco e suave; o 28 chegou a 35 °C e o 14 tivo choiva).
4. Ano da poboación estacional: 2025 provisional, para coincidir coas outras capas. Hoxe só ten os trimestres I e II; o verán chegará na próxima publicación do IGE (prevista en 2027). Os trimestres que falten van baleiros e marcados.

Revisado: Ourense case non gaña poboación diúrna porque o seu polo de emprego (San Cibrao das Viñas, O Pereiro de Aguiar) queda fóra do anel. Coincide co IGE (taxa de carga diúrna 102,6 % en Ourense e 129,6 % en San Cibrao, 2.º trimestre de 2024). Detalle no README de MITMA.

