# MeteoGalicia e Augas de Galicia · Caudais e niveis dos ríos (histórico)

Fonte para o mapa **Os ríos crecen**.

**Semáforo: amarelo.** Non hai serie horaria aberta e longa. O servizo documentado de MeteoGalicia (`datos10min.action`) dá datos de 10 minutos por estación, pero só dos **últimos 30 días** e coa chave persoal que xa temos nos segredos de CI (`METEOGALICIA_AFOROS_KEY`). A rama `data` do repositorio garda o noso arquivo propio desde o 24/10/2026, unha lectura cada 3,5 h de mediana: non chega para ver unha onda de crecida. A serie longa existe no Anuario de aforos (diaria, 1912–2022), pero acaba en setembro de 2022 e a copia do CEDEX ten un aviso legal restritivo. Para un episodio forte hai que descargar xa os 30 días con chave ou pedir o ficheiro a MeteoGalicia / Augas de Galicia.

Verificado con descargas reais o 1 de novembro de 2026 (18 peticións, todas 200).

## Ficha

| Campo | Valor |
|---|---|
| Conxunto | Rede foronómica de MeteoGalicia e Augas de Galicia (conca Galicia-Costa). Visor: https://servizos.meteogalicia.gal/mgafos/estacions/estacions.action |
| Descarga (10 min) | `https://servizos.meteogalicia.gal/mgafos/json/datos10min.action?cod=CHAVE&idEstacion=ID&dataIni=DD/MM/AAAA HH:MM&dataFin=DD/MM/AAAA HH:MM`. Documentación: `pipeline/samples/augas-galicia/JSON_Aforos_10min_es.pdf`. Límites: últimos 30 días; sen `idEstacion`, 2 horas para todas; con `idEstacion`, 96 horas. Sen chave responde 200 cunha páxina HTML «Erro - MeteoGalicia» (comprobado hoxe). |
| Formato | JSON `list10Min[]` → `instanteLecturaUTC`, `listaEstacions[]` → `listaMedidas[]` (`codParametro`, `valor`, `codigoValidacion`, `unidade`). Non comprobado hoxe con chave: a chave só está en CI. |
| Arquivo propio | Rama `data`, `caudais-rios/data.geojson`: 55 instantáneas do 24/10/2026 07:32Z ao 01/11/2026 09:54Z, 88 estacións, 4.807 lecturas; oco mediano 3,5 h, máximo 7,2 h. Campos: id, nome, concello, provincia, caudal (m³/s), nivel (m), hora da medida. |
| Serie longa | Anuario de aforos 2021-22 (ROEA), CEDEX: `https://ceh.cedex.es/anuarioaforos/anuario-2021-2022/GALICIA COSTA/afliq.csv` (11,3 MB; 51 estacións con caudal, 1919-03-08 → 2022-09-30, 41 activas en 2022) e `…/MIÑO-SIL/afliq.csv` (19,5 MB; 85 estacións, 1912-05-02 → 2022-09-30, 54 activas). Diario: `indroea;fecha;altura;caudal`. Estacións en `estaf.csv` (UTM e xeográficas). O servidor do CEDEX corta o TLS de OpenSSL 3 co nivel de seguridade por defecto; o script baixa o nivel só para ese host. |
| Licenza | **MeteoGalicia (mgafos)**: non verificada especificamente. A documentación di «Todos los servicios JSON con datos de aforos son públicos y su uso es gratuito»; presumiblemente aplica o aviso legal de MeteoGalicia (https://www.meteogalicia.gal/web/aviso-legal, «utilizada libremente… co único compromiso de mencionar expresamente a MeteoGalicia», cita verificada o 24/10/2026; hoxe a páxina carga o texto dunha API que responde 401). Colección CC BY-SA, como a capa `caudais-rios`. **MITECO** (anuario, https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/agua/anuario-de-aforos.html): «Esta información se puede usar de modo libre y gratuito siempre que se mencione al Ministerio para la Transición Ecológica y el Reto Demográfico como autor y propietario de la información», pero só ofrece a táboa 2020-21 das concas intercomunitarias (Miño-Sil). **CEDEX** (https://ceh.cedex.es/web/aviso_legal.htm): «Todos los contenidos del sitio web… constituyen una obra cuya propiedad pertenece al Centro de Estudios Hidrográficos del CEDEX, sin que puedan entenderse cedidos al usuario ninguno de los derechos de explotación». Os CSV de Galicia-Costa só están aí: non publicar sen permiso. |
| Atribución | «Datos: Augas de Galicia e MeteoGalicia (Xunta de Galicia). Datos non validados.» Anuario: «Fuente: © Ministerio para la Transición Ecológica y el Reto Demográfico». |
| Resolución temporal | 10 min (servizo, 30 días); ~3,5 h (arquivo propio); día (anuario) |
| Resolución territorial | Estación de aforo (88 con datos na rama `data`; 51 + 85 no anuario) |
| Último período | Tempo real (servizo); 30/09/2022 (anuario) |
| Frecuencia | 10 min |
| Tamaño | 30 días de 10 min para 88 estacións: 88 × 8 peticións de 96 h = 704 peticións (non feito: sen chave fóra de CI e con risco de bloqueo de IP; ver `meteogalicia-horario`). Arquivo propio: 0,3 MB por semana en CSV. |
| Quebras | **Estacións con marea**: Ulla - Padrón oscila entre 8 e 88 m³/s (nivel 4,8–7,8 m) dúas veces ao día, co ritmo da marea e tamén en días secos, e Sar - Padrón entre 0,35 e 5,1: son estacións no fondo da ría e a marea move o nivel e o caudal calculado. Hai que retiralas ou marcalas. **Ríos regulados**: Xallas - Mazaricos (1,8 → 10,6 m³/s) depende dos encoros. Valores -9999 = sen dato. Datos non validados. A ligazón entre os códigos do anuario (`indroea`) e os de MeteoGalicia (`idEstacion`) non existe: casar por nome ou posición. SAIH Miño-Sil: só HTML con cookie (`pipeline/sources.yaml`, `saih-minosil`, no-go). |
| Privacidade | Ningunha |

## Mostra (`mostra/`)

`python3 -I descargar.py` (18 peticións, ~2 min). Con `METEOGALICIA_AFOROS_KEY` no ambiente e `--estacions ID,ID --episodio AAAA-MM-DD` baixa tamén 96 h de 10 min desas estacións (a chave nunca se escribe).

| Ficheiro | Contido |
|---|---|
| `rama_data_caudais.csv` | 4.807 lecturas das 55 instantáneas da rama `data` |
| `estacions_meteogalicia.csv` | 88 estacións: id, nome, concello, provincia, lon, lat |
| `chuvia_media_galicia_diaria.csv` | Chuvia media diaria das estacións de MeteoGalicia (168–169), nov. 2025 – out. 2026, para escoller episodio |
| `anuario_galicia_costa_2021-22.csv` | Caudal diario de 41 estacións de Galicia-Costa no ano hidrolóxico 2021-22 (14.519 filas). Só mostra interna: licenza CEDEX restritiva. |
| `anuario_galicia_costa_estaf.csv` | Estacións do anuario (Galicia-Costa) |
| `rexistro.json` | Peticións, resumo e textos de licenza lidos |

### Primeira lectura

- Episodios de choiva dos últimos doce meses (media das estacións, tres días seguidos): 26–28/01/2026 (92,7 mm), 12–14/11/2025 (85,0), 05–07/11/2025 (76,9), 05–07/02/2026 (70,6), 11–13/02/2026 (50,4).
- Dentro da xanela de 30 días que aínda dá o servizo: 06–07/10/2026 (10,7 e 6,7 mm de media, máximo 61,3 mm nunha estación; o mesmo día 6 houbo 4.954 raios, ver `raios-historico`). Sae da xanela arredor do 5 de novembro.
- Arquivo propio (24/10–01/11): semana case seca. Despois de quitar Padrón, as subidas son pequenas: Sar - Ames 0,5 → 2,1 m³/s, Grande - Vimianzo 0,19 → 0,81, Eume - Monfero 1,8 → 5,3.
- Anuario 2021-22: a maior crecida de Galicia-Costa foi o 7/12/2021 (suma de 41 estacións 979 m³/s); en O Couso o caudal pasa de 9,9 m³/s o día 6 a 86,8 o 7 e baixa a 18,6 o 15.

## Proposta de mapa

Cada estación é un círculo que incha co caudal relativo ao seu propio normal (caudal ÷ mediana da estación, escala log), e unha liña de tempo con 10 min de paso para un episodio de 3–5 días: vese a choiva chegar polo oeste e a onda baixar polos ríos. Candidato hoxe: **6–8 de outubro de 2026** (se se descarga antes do 5 de novembro, 704 peticións en CI coa chave). Candidato mellor: **26–28 de xaneiro de 2026**, que hai que pedir a MeteoGalicia ou Augas de Galicia. Ao mesmo tempo, gardar cada día as últimas 24 h de 10 min (88 peticións diarias) para ter o arquivo desde agora. O mapa non pode mostrar a área inundada (iso son as capas `inundacion-perigo-*`), nin os ríos do Miño-Sil en tempo real (o SAIH non ten feed), e nas estacións de ría o que se ve é a marea.
