# Novas capas: proposta (novembro 2026)

Resume tres investigacións feitas o 01/11/2026 con chamadas reais a cada servizo:
[xunta.md](xunta.md), [outras-capas-e-satelite.md](outras-capas-e-satelite.md) e [pulso-redes.md](pulso-redes.md).

## 1. Mapas abertos da Xunta (en curso)

42 candidatas: 31 aptas, 7 condicionais e 4 descartadas. Publícanse na colección CC BY-SA 4.0 (ADR 0005).

Primeiro lote, en construción na rama `xunta-capas`, cun commit por capa:

- praias e bandeiras azuis
- desfibriladores
- sendas e Camiño do Litoral
- intensidade media de tráfico nas estradas (IMD 2025)
- zonas de baño
- zonas de produción de moluscos e bateas
- inundación costeira T100 e T500
- estado das masas de auga
- humidais
- centros de infancia
- puntos limpos
- bibliotecas

Segundo lote, tamén apto:

- establecementos SEVESO
- parques de bombeiros e grupos de emerxencias
- dereitos mineiros
- encoros
- outros centros de servizos sociais
- parques empresariais con solo libre
- Camiños de Santiago delimitados
- museos
- reservas da biosfera
- oficinas da Xunta
- concellos (sedes)
- ITV
- repetidores da Retegal
- comarcas paisaxísticas

Pendentes:

- **Montes veciñais:** licenza por confirmar.
- **Cámaras de MeteoGalicia:** cargarían imaxes doutro servidor no navegador.
- **Microtoponimia:** 538 000 puntos, por tamaño.
- **IFN 2010 de especies:** datado e con dereitos do inventario estatal.

## 2. Outras capas e imaxe de satélite

Todas as capas desta sección son gratuítas e de licenza CC BY 4.0 ou equivalente. Van na colección ODbL.

| Capa | Fonte | Tamaño en Galicia |
| --- | --- | --- |
| Relevo (sombreado e elevación) | IGN MDT25/MDT5 | 80 MB + 40–70 MB |
| Ortofoto PNOA | IGN | z≤14 0,2 GB · z≤16 ~3 GB · z≤17 ~11 GB |
| Mosaico Sentinel-2 mensual (cor real e NDVI) | Copernicus en AWS, sen conta | ~120 MB ao mes, ~1,5 GB en 12 meses |
| Poboación en grella de 1 km (censo 2021) | Eurostat GISCO | pequeno |
| Perda de arborado 2001–2024 | Hansen / GFW | 1 tesela de 46 MB |
| Cuberta do solo 10 m | ESA WorldCover | 4 teselas |
| Densidade arbórea | Copernicus HRL | moderado |
| Rede hidrográfica | IGN | moderado |
| Batimetría | EMODnet | moderado |
| Poboación 1975–2030 | GHSL | moderado |

Descartadas porque a licenza é non comercial (NC) ou non se pode usar aquí:

- EOX cloudless 2018–2025
- Global Fishing Watch
- Maxar Open Data
- Ookla
- Planet NICFI
- Dynamic World
- Catastro en bruto

## 3. Pulso das redes (último ano)

| Capa | Fonte | Veredicto |
| --- | --- | --- |
| Atención en Wikipedia por concello, 12 meses | Wikimedia pageviews (CC0) | apta |
| Galicia nas noticias: artigos e ton por concello | GDELT (uso libre con cita) | apta |
| Bluesky en galego: volume diario e as sete cidades | API pública de Bluesky | condicional |
| Edición de OpenStreetMap por concello e mes | ohsome (ODbL) | condicional |

Descartadas:

- **Google Trends:** sen API pública.
- **Reddit:** acordo comercial.
- **X:** de pago, uns 47 $ ao mes.
- **Meta e TikTok:** só investigación académica.
- **Strava Metro:** só para socios.
- **Mastodon:** pouco volume.

Regras para estas capas:

- só agregados por concello e día;
- limiares mínimos de reconto;
- ningún texto, nome de conta nin ligazón a publicacións.

## Decisións da FGS

1. **Ortofoto PNOA:** ata que nivel. Depende da cota de disco de Dinahosting (z16 ≈ 3 GB).
2. **Mosaico Sentinel-2 mensual:** si ou non. Sen conta funciona en GitHub Actions (1–2 h ao mes). Cunha conta gratuíta de Copernicus Data Space hai mosaicos trimestrais oficiais sen nubes.
3. **Pulso das redes:** aprobar Wikipedia e GDELT; Bluesky e OSM, si ou non.
4. **Contas gratuítas opcionais:**
   - NASA Earthdata, para as luces nocturnas;
   - Copernicus ADS, para o aire CAMS.
