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

## Achados que cambian o encargo

1. **MITMA xa non publica todos os días.** Desde o 1 de xullo de 2025 só hai semanas de mostra (agosto, outubro e decembro de 2025) e nada de 2026. A «actualización mensual automática» non se pode aplicar a estes dous mapas; serán dun período fixo. Proposta de mes tipo: maio de 2025.
2. **Cambio metodolóxico en xullo de 2025.** Non comparar volumes entre antes e despois. Afecta a calquera idea de usar agosto de 2025 (lumes) con mobilidade.
3. **A GAU de MITMA xunta Vigo e Pontevedra.** Para os aneis hai que partila; Ourense só pode medrar limpo ata Barbadás.
4. **Rural en bloques.** 159 dos 313 concellos van en 54 zonas agregadas de MITMA. O mapa de fluxos debe debuxar eses bloques, non concellos.
5. **FIRMS en Galicia ten catro xanelas de paso** (01–04, 09–11, 12–15 e 20–22 UTC). A animación de agosto será por pasadas.
6. **IGE: o ano *a* publícase en *a+2*.** O último ano definitivo é 2024; o verán de 2025 aínda non está.

## Decisións

Tomadas por Marcos o 1/11/2026:

1. Aneis das sete cidades: anel 0 = concello; anel 1 = concello e área urbana, coa GAU de Vigo–Pontevedra partida. Lista en [`fontes/mitma-mobilidade/aneis.json`](fontes/mitma-mobilidade/aneis.json).
2. Mes tipo para o día: maio de 2025 (4 mércores e 4 domingos). O domingo 4 de maio, volta da ponte, cámbiase polo 1 de xuño.

Revisado: Ourense case non gaña poboación diúrna porque o seu polo de emprego (San Cibrao das Viñas, O Pereiro de Aguiar) queda fóra do anel. Coincide co IGE (taxa de carga diúrna 102,6 % en Ourense e 129,6 % en San Cibrao, 2.º trimestre de 2024). Detalle no README de MITMA.

Pendentes:

- Día de referencia meteorolóxico: o mesmo mércores que MITMA (para un reloxo común) ou un día escollido polo tempo.
- Ano de referencia para a poboación estacional: 2024 (último definitivo).
