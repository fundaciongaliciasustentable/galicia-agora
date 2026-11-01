# Consellería do Mar · Primeira venda nas lonxas (pesca fresca)

Fonte para o mapa **O peixe que entra nas lonxas, día a día**.

**Semáforo: verde.** Hai un ficheiro por ano desde 2003, descargable sen chave, cunha fila por **día × lonxa × especie** (kg, euros e prezo medio). A licenza está declarada en abertos.xunta.gal. Dúas condicións: é CC BY-SA 4.0 (vai na colección BY-SA, fóra da base ODbL, como as outras capas da Xunta; ver `docs/licences.md`), e as lonxas non traen coordenadas, hai que xeolocalizar 60 nomes a man.

Verificado con descargas reais o 1 de novembro de 2026.

## Ficha

| Campo | Valor |
|---|---|
| Conxunto en abertos | https://abertos.xunta.gal/catalogo/economia-empresa-emprego/-/dataset/0154/principais-indicadores-vendas-produtos-pesqueiros («Principais indicadores de vendas de produtos pesqueiros frescos nas lonxas»). As ligazóns CSV/XLS do conxunto redirixen á consulta interactiva https://www.pescadegalicia.gal/informe-notasventa/agregation, non a un ficheiro. |
| Descarga masiva | https://www.pescadegalicia.gal/gl/descargas → `https://www.pescadegalicia.gal/descargas/pescafresca/pescafresca{AAAA}.csv` (e `.xml`), 2003–2025. Instrucións: https://www.pescadegalicia.gal/descargas/pescafresca/pdf/instruccions.pdf |
| Formato | CSV sen cabeceira, separador `;`, coma decimal, UTF-8 con BOM, data `dd/mm/aaaa` (comprobado: o primeiro campo chega a 31). XML co mesmo contido e data ISO. |
| Campos | data, grupo biolóxico, código FAO, especie (galego), provincia, zona administrativa (I Vigo … IX Mariña), lonxa, cantidade (kg), importe (€), prezo medio (€/kg) |
| Consulta interactiva | Engade ano en curso, día da semana, prezo mínimo e máximo. Exporta CSV/XLS/PDF ata 25.000 filas por POST con token CSRF de sesión: non se usou, non é unha API. |
| Licenza | abertos.xunta.gal: «Creative Commons BY SA 4.0», fonte «Consellería do Mar». O aviso legal de pescadegalicia.gal di que a información «é susceptible de reutilización» citando a fonte e sen desnaturalizala (https://www.pescadegalicia.gal/gl/aviso-legal). Dobre declaración, como no resto da Xunta: aplicar BY-SA. |
| Atribución | «Fonte: Consellería do Mar, Xunta de Galicia. Notas de primeira venda (pescadegalicia.gal), CC BY-SA 4.0» |
| Resolución temporal | Día de venda (as lonxas venden de luns a venres e algúns sábados; 327 días con vendas en 2025) |
| Resolución territorial | Lonxa ou centro de venda (60 en 2025), zona administrativa e provincia. Sen coordenadas. |
| Último período | Ficheiro anual: 2025 completo (o de 2026 dá 404). O ano en curso só na consulta interactiva (2026 ata hoxe: 90,9 mil t e 320,8 M€). abertos.xunta.gal marca actualización «diario», última o 01/11/2026. |
| Frecuencia | Ficheiro anual (o ano pechado); consulta diaria |
| Tamaño | 12,6–18,5 MB por ano en CSV (396 MB 2003–2025); un mes ≈ 1,5 MB |
| IGE | Non revisado nesta ronda. Para día e lonxa non fai falta: esta é a fonte primaria. |
| Quebras | Nomes de lonxa con variantes («Ribeira.», «Cariño.», «A Coruña (Lonja Coruña, S.A.)» e «A Coruña (Confraría)» por separado). Códigos FAO agregados (p. ex. `HK0` «Ovas de pescada», grupo «Resto das descargas»). Só pesca fresca: a acuicultura e o conxelado van noutros ficheiros. Non comprobado se as lonxas pechadas ou fusionadas cambian de nome entre 2003 e 2025. |
| Privacidade | Agregado por lonxa, día e especie, sen buque nin comprador. Nunha lonxa pequena unha fila pode corresponder a un só barco: non mostrar prezos dunha especie rara nunha lonxa pequena como se fosen mercado. |

## Mostra (`mostra/`)

`python3 -I descargar.py --ano 2025 --mes 8` (26 peticións, ~45 s). Baixa o ano enteiro en memoria (17,8 MB), garda só agosto e mide os outros anos con HEAD.

| Ficheiro | Contido |
|---|---|
| `pescafresca_2025-08.csv` | Agosto de 2025, 15.860 filas, 27 días, 58 lonxas, con cabeceira engadida |
| `rexistro.json` | URL, estado, bytes de cada ano, licenza lida en abertos e resumo |

### Primeira lectura

- 2025: 189.448 filas, 107.600 t e 407,8 M€ en 60 lonxas e 276 especies.
- Agosto de 2025 por importe: A Coruña (Lonja Coruña) 7,4 M€, Vigo 6,3, Burela 6,2, Ribeira 4,5, Celeiro 3,4. Especies: pescada 7,5 M€, sardiña 3,6, bonito do norte 3,0, bocarte 2,8, xurelo 2,8, ameixa xaponesa 2,4.
- Filas por día da semana en agosto: de martes a venres ≈ 3.000–3.300, luns 2.431, sábado 655, domingo 2. O ritmo semanal vese no mapa.

## Posición das lonxas

Feito o 1 de novembro de 2026 para a capa `lonxas-2025` (`pipeline/layers/lonxas-2025/lonxas.json`). Fonte: Nomenclátor Geográfico Básico de España (IGN, CC BY 4.0), servizo WFS INSPIRE `https://www.ign.es/wfs-inspire/ngbe`, consultado na caixa de cada concello con lonxa.

- Regra: o porto («Puerto» ou «Instalación portuaria») cando o NGBE nomea un co nome da lonxa (23 lonxas); se non, o núcleo que lle dá nome (capital de municipio, entidade singular ou colectiva).
- Excepcións anotadas en `lonxas.json`: Vigo e Ferrol van na capital porque o porto do NGBE nomea a ría enteira; A Illa no peirao do Chufre (Xufre); O Barqueiro no barrio do porto (a entidade homónima está terra adentro); Río Anllóns na capital de Ponteceso, aproximada.
- O Nomenclátor da Xunta (capa `entidades-poboacion`) non serve: faltan os núcleos principais (Vigo, Burela, Cedeira…).
- Sen punto: Baldaio (non está no NGBE nin no Nomenclátor da Xunta) e Coop. Ría de Arosa (sen localización publicada). Van na capa sen xeometría.

## Proposta de mapa

Reloxo de **días** dun ano (2025): cada lonxa é un punto que late co importe ou os kg do día, cor por grupo (peixe, cefalópodos, bivalvos, crustáceos); vense o ritmo semanal, as costeiras (bonito no verán, ameixa no inverno) e os peches por temporal. Como segunda capa, reloxo de **anos** 2003–2025 por lonxa. O dato non mostra onde se pescou (unha lonxa vende capturas de caladoiros afastados), nin a acuicultura, nin o peixe conxelado; e os puntos das lonxas hai que xeolocalizalos nós.
