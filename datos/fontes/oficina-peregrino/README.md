# Oficina del Peregrino · Compostelas por camiño e orixe

Fonte para o mapa **Os camiños que chegan a Santiago**.

**Semáforo: vermello.** As estatísticas só se poden ver nun informe Power BI incrustado na web, sen descarga nin API pública, e o aviso legal prohibe reproducir os contidos sen autorización. Non descargamos nada. Proposta: pedir permiso e un ficheiro á Oficina.

Verificado o 1 de novembro de 2026 (páxinas web e unha visualización do informe no navegador; ningunha consulta á API interna de Power BI).

## Ficha

| Campo | Valor |
|---|---|
| Páxina | https://oficinadelperegrino.com/estadisticas-nueva/ (ligada desde https://oficinadelperegrino.com/estadisticas2/) |
| Visor | Informe Power BI «publicar na web» nun iframe (`https://app.powerbi.com/view?r=…`, URL completa en `mostra/rexistro.json`). Título: «Información Estadística Oficina Peregrino para 2026 hasta octubre». |
| Descarga | Ningunha: sen CSV, XLSX nin ligazóns de descarga na páxina; a busca de ficheiros na biblioteca de medios de WordPress non devolveu nada. Non hai conxunto en abertos.xunta.gal (busca «peregrinos»: 0). |
| Campos que se ven | Filtros: ano, mes, camiño. Táboas e gráficos por camiño (28 valores, de Camino Francés a Camino Mozárabe), país, comunidade autónoma, procedencia (lugar de inicio: Sarria, Tui, Ferrol, Oporto…), motivo, medio, idade, xénero. Indicador «Último día» (31/10/2026: 1.238). |
| Licenza | Ningunha que permita reutilizar. Aviso legal (titular SAMI Catedral de Santiago de Compostela): reprodución e distribución «expresamente prohibidas» sen autorización (https://oficinadelperegrino.com/aviso-legal/, apartado 6). |
| Atribución | Non aplicable ata ter permiso |
| Resolución temporal | No visor: ano e mes, máis a cifra do último día. Unha serie diaria **non verificada**: non a vimos no informe. |
| Resolución territorial | Camiño e lugar de inicio (texto, sen coordenadas); país e comunidade de residencia |
| Último período | 2026 ata o 31/10/2026: 559.078 peregrinos (214.825 españois, 344.253 estranxeiros; +8 % sobre o ano anterior). A cifra de 530.987 compostelas en 2025 **non se comprobou** nesta ronda. |
| Frecuencia | Diaria (o indicador «Último día» era o 31/10 consultado o 1/11) |
| Tamaño | Non aplicable |
| Quebras | Conta compostelas e certificados entregados na oficina, non persoas que camiñan: quen non pide a compostela non aparece. «Procedencia» é o lugar onde se di que comezou, non o percorrido. Lista de camiños con nomes abreviados e duplicados aparentes («Camino de Tenerife…» dúas veces) a revisar. |
| Privacidade | Os rexistros orixinais son persoais (nome, idade, nacionalidade). Só valen agregados; con idade × xénero × país × día pódense dar celas dunha soa persoa. Pedir sempre agregado con mínimo por cela. |

## Mostra (`mostra/`)

`python3 -I descargar.py` (4 peticións, ~8 s). Non descarga datos: só rexistra o comprobado.

| Ficheiro | Contido |
|---|---|
| `rexistro.json` | Estado HTTP de robots.txt, das dúas páxinas de estatísticas e do aviso legal; URL do iframe de Power BI; se segue a cláusula de prohibición |

## Que facer

1. Escribir a oficinadelperegrino@catedraldesantiago.es pedindo permiso para reutilizar agregados e un ficheiro (CSV) por **día × camiño × lugar de inicio**, con país ou comunidade só en agregados con mínimo por cela, e a licenza ou atribución que queiran.
2. Non extraer datos da API interna de Power BI: sería raspar contra o aviso legal.
3. Alternativas sen permiso (non verificadas nesta ronda): o IGE usa ocupación de albergues do Camiño na carga de poboación estacional (ver `datos/fontes/ige-poboacion-estacional`); o INE publica ocupación de albergues por comunidade. Ningunha dá camiño nin lugar de inicio.

## Proposta de mapa

Reloxo de **días** (ou de **meses**, se só nos dan iso): cada camiño é unha liña que engrosa co número de compostelas, saíndo do seu lugar de inicio (Sarria, Tui, Ferrol, Saint-Jean-Pied-de-Port…) cara a Santiago; o verán e os anos santos vense na grosura. O dato non sabe onde está cada peregrino nun día dado, só cando chegou e onde dixo que empezou: as liñas deben ler como chegadas acumuladas, non como fluxo en tempo real.
