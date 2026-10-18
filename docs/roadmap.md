# Folla de ruta

Só a Fase 0 e a Fase 1 están en construción. O resto é backlog: documentado, non construído.

| Fase | Contido | Estado |
|---|---|---|
| 0 | Verificación das fontes | Entregada (provisional ata medir frecuencias) |
| 1 | Lanzamento: 13 capas (12 do encargo e tren), mapa base, buscador, `/estado`, `/fontes`, `/sobre` | Pendente de aprobación |
| 2 | Territorio e litoral | Backlog |
| 3 | Economía, vivenda e transparencia | Backlog |
| 4 | O que ninguén máis pode copiar | Backlog |
| 5 | Actualidade: noticias e redes xeorreferenciadas | Backlog (engadida o 18/10/2026) |

O detalle das fases 2 a 4 está no encargo orixinal (sección 9).

---

## Fase 5: Actualidade

### Obxectivo
Pór no mapa o que está pasando: noticias e publicacións de redes sociais seleccionadas, situadas no concello, na parroquia ou no lugar ao que se refiren. Os datos dinlle a quen le como está o territorio; a actualidade explica por que.

### Principios
1. **Selección por fonte, non por contido.** Escóllense as fontes (medios e contas) cunha lista pública de criterios. Unha vez dentro, non se escollen nin se descartan pezas pola súa liña editorial. Así a selección pódese revisar e non depende de gustos.
2. **Pluralidade.** A lista inclúe medios de distinta liña e escala (xerais, comarcais, dixitais), en galego e en castelán.
3. **Só contas institucionais e colectivas** nas redes: administracións, servizos de emerxencia, organismos técnicos, entidades sociais, universidades, medios. **Nunca contas de particulares**, aínda que sexan públicas: son datos persoais (RGPD) e o encargo prohibe recollelos.
4. **Sen recursos de terceiros no navegador.** Nada de widgets nin embeds de redes, porque cargan scripts e cookies alleas. Amósase un texto propio (titular, fonte, hora, lugar) e unha ligazón á orixe.
5. **Caducidade.** A actualidade caduca: cada peza leva data e desaparece do mapa por defecto aos 7 días (queda no arquivo se a licenza o permite). Se a orixe a borra, bórrase tamén aquí.
6. **Atribución sempre visible**, como nas demais capas.

### Que se amosa de cada peza
- Titular (ou primeira liña da publicación institucional).
- Medio ou conta, hora de publicación e ligazón á orixe.
- Lugar detectado e grao de confianza da localización (concello, parroquia ou lugar).
- **Sen extractos do corpo da noticia** mentres non haxa acordo co medio (ver riscos).

### Fontes posibles (non verificadas)

| Tipo | Vía | Observacións |
|---|---|---|
| Medios galegos | RSS ou Atom propios | Requiren licenza ou acordo para ir alén do titular e a ligazón |
| Administración e emerxencias | RSS, notas de prensa, contas institucionais | Xunta, concellos, 112 Galicia, MeteoGalicia, Augas, Intecmar |
| Bluesky | API pública do AT Protocol | Acceso aberto; termos de reutilización a verificar |
| Mastodon | API de cada instancia | Os termos dependen de cada instancia |
| X (Twitter) | API de pago | Custo: consultar antes de usar |
| Facebook e Instagram | Sen API aberta para este uso | Probablemente non viable |

### Xeorreferenciación
1. Busca de topónimos no texto contra o Nomenclátor e as entidades de poboación (Fase 1).
2. Resolución de ambigüidades: hai moitos lugares co mesmo nome. Úsanse o concello do medio comarcal e outros topónimos próximos no texto.
3. Se non hai un lugar claro, a peza vai ao concello ou á comarca, nunca a un punto inventado.
4. Revisión manual das pezas de baixa confianza antes de publicalas, polo menos ao principio.

### Riscos e preguntas abertas
- **Dereitos de autor dos medios.** A lei española recoñece dereitos aos editores de prensa sobre os seus contidos (RDL 24/2021, que traspón a directiva europea de 2019). Ligar e amosar fragmentos moi breves parece quedar fóra, pero o alcance hai que consultalo cun xurista antes de publicar. A vía máis segura son acordos cos medios.
- **Datos persoais.** Mesmo en contas institucionais poden aparecer nomes de persoas (vítimas, sancionados). Hai que definir unha regra de filtrado.
- **Neutralidade.** A lista de fontes e os criterios publícanse en `/fontes`, cun canal para propor fontes novas.
- **Custo.** As APIs de pago (X) quedan fóra sen aprobación previa.
- **Carga editorial.** A revisión manual precisa horas de persoa. Hai que dimensionala antes de comprometela.

### Decisións que terás que tomar
1. Criterios e lista inicial de medios e contas.
2. Se se buscan acordos con medios para amosar extractos.
3. Quen fai a revisión manual e con que frecuencia.
4. Que redes entran.
