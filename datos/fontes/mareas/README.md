# Copernicus Marine · Nivel do mar nos mareógrafos galegos

Fonte para o mapa **A marea dun día**.

**Semáforo: amarelo.** A licenza de Copernicus Marine permite redistribuír e facer produtos derivados con atribución, e os ficheiros baixan dun S3 anónimo, sen conta. Amarelo por tres motivos: os ficheiros son NetCDF4/HDF5 e a biblioteca estándar de Python non os le (o pipeline precisa `h5py` ou `netCDF4`); só hai 8 mareógrafos activos, todos de Portos do Estado, entre Vigo e San Cibrao; e cada un mide sobre o seu cero de porto, polo que as alturas non se poden comparar entre portos sen restar a media.

Verificado con descargas reais o 1 de novembro de 2026.

## Por que esta fonte e non Portos do Estado

`pipeline/sources.yaml` (entrada `puertos-estado`) deixou o portal de Portos do Estado en *no-go* porque prohibe pasar os datos a terceiros, e propuxo `cmems-insitu-ibi` como alternativa. Os mareógrafos de Portos do Estado chegan a Copernicus Marine e alí publícanse baixo a licenza de Copernicus Marine. É a mesma medida por outra canle con outra licenza. Convén confirmalo por escrito con Copernicus Marine ou con Portos do Estado antes de publicar (ver «Límites»).

## Ficha

| Campo | Valor |
|---|---|
| Produto | INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033 (Atlantic Iberian Biscay Irish Ocean, In-Situ Near Real Time), DOI https://doi.org/10.48670/moi-00043 |
| Acceso (sen conta) | `https://s3.waw3-1.cloudferro.com/mdl-native-03/native/INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033/cmems_obs-ins_ibi_phybgcwav_mynrt_na_irr_202311/` con `index_platform.txt` (3,2 MB), `index_latest.txt` (8,8 MB), `index_history.txt` (4,3 MB) e `index_monthly.txt`, e os cartafoles `latest/AAAAMMDD/`, `monthly/TG/AAAAMM/` e `history/TG/` |
| Conta | Non fai falta para o S3 nativo (200 sen credenciais). A *Copernicus Marine Toolbox* e o catálogo web piden conta; non se creou ningunha. |
| ERDDAP de EMODnet Physics | Non verificado: a busca en `erddap.emodnet-physics.eu` non respondeu en 2 minutos. |
| Formato | NetCDF4 (HDF5). Variables `TIME` (días desde 1950-01-01 UTC), `SLEV` (m, «Water surface height above a specific datum», `sea_level_datum = Harbour Local Datum`), `SLEV_QC`, `DEPH`, `LATITUDE`, `LONGITUDE` |
| Licenza | Copernicus Marine Service Commitments and Licence (https://marine.copernicus.eu/user-corner/service-commitments-and-licence). Concede, gratis, «redistribute, disseminate any Copernicus Marine Service Product in their original form via any media» e crear produtos derivados «for any purpose». O atributo `license` de cada NetCDF apunta a esa páxina. |
| Atribución | Para derivados: «Generated using E.U. Copernicus Marine Service Information; https://doi.org/10.48670/moi-00043». Para redistribución tal cal: «E.U. Copernicus Marine Service Information; https://doi.org/10.48670/moi-00043». |
| Resolución temporal | Ficheiros diarios (`latest/`): 1 minuto (`time_coverage_resolution = PT1M`, 1.440 valores ao día). Serie histórica (`history/`): 1 hora (`PT60M`). |
| Resolución territorial | 8 puntos activos: Vigo, Marín, Vilagarcía, Langosteira, A Coruña, Ferrol, Ferrol 2 e San Cibrao. Coruna2TG (IGN) parou o 4/6/2024. |
| Último período | Ficheiros diarios: ata as 09:11 UTC do 1/11/2026, publicados ás 09:35 UTC (uns 25 min de atraso). Serie histórica: ata o 30/9/2026 (pecha cada mes en modo diferido, `data_mode = M`). |
| Frecuencia | `update_interval = PT1H` nos diarios; mensual na serie histórica (`P1M`). `latest/` garda uns 30 días. |
| Tamaño | Un día de un mareógrafo: 46 kB (Langosteira 91 kB porque tamén trae ondas). Serie histórica horaria: 0,24–0,88 MB por estación (Langosteira 3,2 MB). |
| Inicio das series | A Coruña 1992-07, Vigo 1992-11, Vilagarcía 1997-04, Ferrol e Ferrol 2 2007, Marín 2010, Langosteira 2012-11, San Cibrao 2019 |
| Quebras | Cero local de cada porto (non comparable entre portos). A serie de Vigo ten 63 ocos (o maior, 56 días) e cobre o 97,4 % das horas. Os diarios son tempo real (QC automático, todo `SLEV_QC = 1` o 31/10/2026); a serie histórica é a validada. |
| Privacidade | Ningunha |

## Predición astronómica: calculala nós

Non hai constantes harmónicas abertas por porto que se poidan reutilizar sen máis:

- **Instituto Hidrográfico de la Marina** (`armada.defensa.gob.es/ihm/Aplicaciones/Mareas/index-mareas.html`): predicións para 70 portos (22 galegos), pero a aplicación só se abre despois de aceptar uns «Términos y Condiciones» que non se len sen aceptalos. Non se aceptaron. O aviso legal xeral da Armada reserva os dereitos e prohibe «la realización de "framings"». Sen autorización escrita: descartado.
- **Portos do Estado**: xa en *no-go* polas condicións de descarga.
- **EOT20** (DGFI-TUM, SEANOE, DOI 10.17882/79489): modelo global de marea con licenza CC BY 4.0 verificada na páxina de SEANOE. Pero é unha malla de 1/8° feita con altimetría: non resolve as rías e o ficheiro pesa 2,3 GB. Serve, como moito, para a franxa de mar aberto.

**Proposta:** calcular as constantes harmónicas de cada porto coa serie histórica horaria de Copernicus Marine (derivado permitido pola licenza) e predicir con elas. Proba feita o 1/11/2026 coa serie de Vigo (último ano, 19 compoñentes, mínimos cadrados sen corrección nodal): M2 = 1,06 m, S2 = 0,39 m, N2 = 0,22 m, K2 = 0,14 m, K1 = 0,08 m, O1 = 0,08 m; residuo de 12,5 cm (inclúe a marea meteorolóxica) fronte a 84 cm de desviación da serie. Para producir hai que usar unha biblioteca con correccións nodais (por exemplo UTide) e varios anos. A predición só existe nos 8 portos con mareógrafo.

## Mostra (`mostra/`)

`python3 -I descargar.py` (19 s). Opcións: `--dia AAAA-MM-DD` (por defecto onte, UTC) e `--historico VigoTG` (`''` para non baixala).

| Ficheiro | Contido |
|---|---|
| `plataformas_galicia_slev.csv` | As 9 plataformas con SLEV no bbox de Galicia (filas de `index_platform.txt`) |
| `index_latest_galicia.csv` | Ficheiros diarios galegos dispoñibles (248 filas) |
| `index_history_galicia.csv` | Series históricas galegas (9 filas) |
| `dia_20261031/IR_TS_TG_*_20261031.nc` | 31/10/2026 minuto a minuto nos 8 mareógrafos (0,4 MB) |
| `IR_TS_TG_VigoTG.nc` | Vigo, horario, 1992-11 a 2026-09 (0,87 MB) |
| `rexistro.json` | Hora UTC, URL, bytes e Last-Modified de cada petición |

### Primeira lectura (31/10/2026, lida con `h5py` fóra do repo)

| Mareógrafo | Preamar (UTC) | Baixamar (UTC) | Carreira (m) |
|---|---|---|---|
| Vilagarcía | 05:49 | 12:37 | 2,40 |
| Vigo | 06:02 | 12:21 | 2,33 |
| Marín | 06:24 | 12:26 | 2,40 |
| A Coruña | 06:29 | 12:45 | 2,55 |
| Ferrol / Ferrol 2 | 06:36 | 12:57 / 12:49 | 2,55 / 2,59 |
| Langosteira | 06:38 | 12:55 | 2,56 |
| San Cibrao | 06:48 | 12:59 | 2,63 |

A preamar percorre a costa de sur a norte en uns 45 minutos e a carreira medra cara ao norte. Os ficheiros traen 1.440 valores (San Cibrao 1.438).

## Límites

- Só 8 puntos e ningún entre Vilagarcía e Langosteira (Costa da Morte, Muros, Fisterra) nin ao leste de San Cibrao (Burela, Ribadeo).
- Cero local de porto: para comparar portos hai que traballar con anomalías (nivel menos media do día ou do mes) ou coa carreira.
- Os datos de orixe son de Portos do Estado. A licenza de Copernicus Marine cobre o produto, pero a combinación co *no-go* de Portos do Estado aconsella un correo de confirmación antes de publicar.
- NetCDF4/HDF5: dependencia nova no pipeline (xa sinalada en `pipeline/sources.yaml`).

## Proposta de mapa

**A marea dun día** (`/pulso/marea/`): oito puntos sobre a costa, cada un cun círculo que sobe e baixa minuto a minuto (anomalía sobre a media do día), e unha liña de cor que percorre a costa marcando onde está a preamar. Ao lado, a curva prevista (constantes harmónicas propias) e a observada: a diferenza é a marea meteorolóxica, o que o vento e a presión engaden. O que non pode mostrar: a marea entre portos nin dentro das rías sen mareógrafo (non interpolar ao longo da costa; como moito unha franxa de EOT20 en mar aberto, identificada como modelo), nin alturas absolutas comparables entre portos.
