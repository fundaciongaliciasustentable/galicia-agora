# IGE · Galegos residentes no estranxeiro (PERE)

Fonte para un mapa da **Galicia de fóra**: persoas de nacionalidade española inscritas no estranxeiro con concello galego de inscrición.

**Semáforo: amarelo.** Os datos están listos e son sinxelos: 313 concellos, un valor por ano de 2009 a 2026, pola API do IGE sen chave. Pero o cruce pedido **país × concello non se publica**: o país de residencia só vai cruzado coa provincia de inscrición (IGE e INE). Ademais é un stock a 1 de xaneiro, non un fluxo, e tres de cada catro inscritos naceron fóra de España: mide a diáspora con nacionalidade, non a emigración.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Operación IGE | https://www.ige.gal/web/mostrar_actividade_estatistica.jsp?codigo=0201001003&idioma=gl |
| Fonte orixinal | INE, Padrón de Españoles Residentes en el Extranjero (Tempus `PERE`, Id 230): https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177014&idp=1254734710990 |
| Táboas IGE | 2291 concello de inscrición × sexo · 2292 país de residencia × provincia de inscrición × sexo × idade (3 grupos) · 2293 país × provincia × sexo × lugar de nacemento (provincia de inscrición, outra provincia, estranxeiro, N/C) · 2294 nados en Galicia, por país e provincia de nacemento |
| Táboas INE equivalentes | 71118 población por municipio de inscripción y sexo · 71117 / 71121 país (con 1.000 ou máis residentes) × provincia de inscripción · 71124 / 71127 **novas inscricións** por país × provincia (aproximación a un fluxo; non descargada) |
| API | `https://www.ige.gal/igebdt/igeapi/csv/datos/{taboa}/0:{anos}[,eixo:código]` e metadatos `.../json/metadatos/{taboa}/selector`. Exemplo: `.../csv/datos/2292/0:2026,2:0,3:0` |
| Formato | CSV ISO-8859-1. 2291: `CodTempo, Tempo, Sexo, CodEspazo, Espazo, DatoN, DatoT`. 2292: engade `País de residencia, Idade`. 2293: `País de residencia, Lugar de nacemento`. |
| Países | 63 categorías: continentes, 52 países con nome (Arxentina, Brasil, Cuba, Uruguai, Venezuela, Suíza, Francia, Alemaña, Reino Unido, EUA…) e «resto de» cada continente |
| Licenza | Aviso legal do IGE (https://www.ige.gal/web/avisolegal.jsp, Lei 37/2007): «Está prohibido desnaturalizar o sentido da información», cita «Fonte: IGE: https://www.ige.gal». O dato primario é do INE, con licenza CC BY 4.0 (aviso legal do INE: «Creative Commons Reconocimiento 4.0 (CC BY 4.0)»). Se a dúbida da compatibilidade co aviso do IGE pesa, as táboas 71118 e 71117 do INE dan o mesmo baixo CC BY 4.0. |
| Atribución | «Fonte: IGE a partir do Padrón de Españoles Residentes en el Extranjero (INE), datos a 1 de xaneiro de 2026» |
| Resolución temporal | Ano (stock a 1 de xaneiro), 2009–2026 |
| Resolución territorial | Concello de inscrición (313; 4 códigos máis de concellos extinguidos, baleiros en 2026). País só por provincia. |
| Último período | 1/1/2026 |
| Frecuencia | Anual |
| Tamaño | 2291: 65 KB por ano (1,2 MB a serie). 2292 con totais de sexo e idade: 22 KB por ano. 2293 con sexo = total: 115 KB por ano. |
| Quebras | Ningunha anunciada na serie 2009–2026. Notas do IGE: datos de 2009 corrixidos o 3/5/2010 (2291) e erros corrixidos o 7/5/2012 (2294). Os cambios nas leis de nacionalidade (por exemplo, a de memoria democrática) poden subir as inscricións sen que ninguén emigre: o salto 2024 → 2026 (+28.000) hai que lelo con iso en mente. |
| Privacidade | Sen datos persoais; contas agregadas. O concello máis pequeno ten 84 inscritos (Rábade). Os cruces por sexo nun concello pequeno non dan problema; non hai cruces máis finos. |

## Mostra (`mostra/`)

`python3 -I descargar.py` (~6 s). Le os anos dos metadatos de cada táboa e baixa a serie completa.

| Ficheiro | Contido |
|---|---|
| `ige_2291_2009-2026.csv` | Inscritos por concello e sexo, 18 anos |
| `ige_2292_2009-2026.csv` | Por país e provincia (sexo e idade = total) |
| `ige_2293_2009-2026.csv` | Por país, provincia e lugar de nacemento (sexo = total) |
| `rexistro.json` | URL, HTTP, bytes, fonte e notas do IGE |

### Primeira lectura

- Galicia: 383.599 inscritos en 2009, 523.856 en 2021, 563.303 en 2026.
- Concellos con máis inscritos en 2026: A Coruña 38.824, Ourense 29.789, Vigo 28.720, Pontevedra 19.598, Lugo 16.031, Santiago 14.751.
- Países en 2026: Arxentina 191.552, Brasil 53.542, Cuba 51.326, Uruguai 45.176, Suíza 40.825, Venezuela 30.329, EUA 29.774.
- Lugar de nacemento en 2026: 431.511 nados no estranxeiro (76,6 %), 124.331 na provincia de inscrición, 6.501 noutra provincia. En Arxentina, o 80,6 % naceu alí.

## Proposta de mapa

**Reloxo: anos 2009 → 2026** (18 fotogramas, 1 de xaneiro).

- Cara a Galicia: cada concello cun círculo proporcional aos inscritos fóra, e a cor como inscritos fóra por cada 100 residentes (cálculo propio co Padrón, identificado e co valor orixinal ao lado). Mostra onde a diáspora pesa máis que o propio concello.
- Cara ao mundo: catro arcos por país (un por provincia) con grosor proporcional, crecendo ano a ano. Un control separa «nados en Galicia/España» de «nados fóra» (táboa 2293), para non confundir diáspora con emigración recente.

O que non pode mostrar: en que país vive a xente de cada concello (só provincia); cando nin desde onde marchou ninguén (é un stock, non un fluxo; para fluxos ao estranxeiro por concello está a EMCR, ver `../ine-emcr-migracions/`); os emigrantes que xa non teñen nacionalidade española nin os que non se inscriben no consulado.
