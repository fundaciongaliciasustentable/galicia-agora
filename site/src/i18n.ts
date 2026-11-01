// Interface strings. Galician at the root, Spanish under /es/.

import { BASE } from './paths.ts';

export type Lang = 'gl' | 'es';

export const THEMES: Record<string, { gl: string; es: string }> = {
  'auga-mar': { gl: 'Auga e mar', es: 'Agua y mar' },
  'lume-monte': { gl: 'Lume e monte', es: 'Fuego y monte' },
  'tempo-aire': { gl: 'Tempo e aire', es: 'Tiempo y aire' },
  mobilidade: { gl: 'Mobilidade', es: 'Movilidad' },
  servizos: { gl: 'Servizos', es: 'Servicios' },
  territorio: { gl: 'Territorio', es: 'Territorio' },
};

export const THEME_ORDER = [
  'auga-mar',
  'lume-monte',
  'tempo-aire',
  'mobilidade',
  'servizos',
  'territorio',
];

const STRINGS = {
  tagline: { gl: 'Galicia como é agora mesmo', es: 'Galicia tal como es ahora mismo' },
  nav_map: { gl: 'Mapa', es: 'Mapa' },
  nav_status: { gl: 'Estado', es: 'Estado' },
  nav_sources: { gl: 'Fontes', es: 'Fuentes' },
  nav_about: { gl: 'Sobre', es: 'Acerca de' },
  other_lang: { gl: 'Castelán', es: 'Galego' },
  skip: { gl: 'Ir ao contido', es: 'Ir al contenido' },
  layers: { gl: 'Capas', es: 'Capas' },
  close: { gl: 'Pechar', es: 'Cerrar' },
  operator: { gl: 'Operador', es: 'Operador' },
  published: { gl: 'Publicado pola fonte', es: 'Publicado por la fuente' },
  published_unknown: {
    gl: 'A fonte non indica a hora de publicación',
    es: 'La fuente no indica la hora de publicación',
  },
  fetched: { gl: 'Descargado', es: 'Descargado' },
  licence: { gl: 'Licenza', es: 'Licencia' },
  source: { gl: 'Fonte orixinal', es: 'Fuente original' },
  as_table: { gl: 'Ver como táboa', es: 'Ver como tabla' },
  features: { gl: 'elementos', es: 'elementos' },
  status_fresh: { gl: 'Actualizado', es: 'Actualizado' },
  status_stale: { gl: 'Desactualizado', es: 'Desactualizado' },
  status_failed: { gl: 'Sen datos', es: 'Sin datos' },
  status_none: { gl: 'Aínda sen datos', es: 'Aún sin datos' },
  delay_note: { gl: 'Atraso', es: 'Retraso' },
  context: { gl: 'Cifras e contexto', es: 'Cifras y contexto' },
  search: { gl: 'Buscar lugar', es: 'Buscar lugar' },
  table_limit: {
    gl: 'Móstranse os primeiros {n} elementos. Descarga o ficheiro completo:',
    es: 'Se muestran los primeros {n} elementos. Descarga el fichero completo:',
  },
  download: { gl: 'Descargar datos', es: 'Descargar datos' },
  map_label: {
    gl: 'Mapa de Galicia. As capas tamén se poden consultar como táboa desde o panel.',
    es: 'Mapa de Galicia. Las capas también se pueden consultar como tabla desde el panel.',
  },
  no_layers: {
    gl: 'Activa unha capa no panel para ver datos no mapa.',
    es: 'Activa una capa en el panel para ver datos en el mapa.',
  },
  loading: { gl: 'Cargando…', es: 'Cargando…' },
  load_error: { gl: 'Non se puido cargar a capa.', es: 'No se pudo cargar la capa.' },
  indicator: { gl: 'Indicador', es: 'Indicador' },
  value: { gl: 'Valor', es: 'Valor' },
  comparison: { gl: 'Fronte a Galicia', es: 'Frente a Galicia' },
  period: { gl: 'Período', es: 'Período' },
  own_calc: {
    gl: 'A comparación con Galicia é cálculo propio a partir dos datos orixinais, que se amosan ao lado.',
    es: 'La comparación con Galicia es cálculo propio a partir de los datos originales, que se muestran al lado.',
  },
  legend_index: {
    gl: 'Índice: Galicia = 100. As cores indican distancia á media, non mellor ou peor.',
    es: 'Índice: Galicia = 100. Los colores indican distancia a la media, no mejor o peor.',
  },
  legend_points: {
    gl: 'Diferenza en puntos fronte ao valor de Galicia. As cores indican distancia á media, non mellor ou peor.',
    es: 'Diferencia en puntos frente al valor de Galicia. Los colores indican distancia a la media, no mejor o peor.',
  },
  choose_indicator: { gl: 'Indicador', es: 'Indicador' },
  collection_odbl: { gl: 'Base ODbL', es: 'Base ODbL' },
  collection_bysa: { gl: 'Colección CC BY-SA 4.0', es: 'Colección CC BY-SA 4.0' },
  portrait_nav: { gl: 'Retrato', es: 'Retrato' },
  pulse_nav: { gl: 'Pulso', es: 'Pulso' },
  pulse_title: { gl: 'O pulso de Galicia', es: 'El pulso de Galicia' },
  pulse_index_title: { gl: 'O pulso de Galicia', es: 'El pulso de Galicia' },
  pulse_index_lede: {
    gl: 'Mapas animados dun día de Galicia, cada un co seu reloxo: como se move, onde está a xente, que tempo fai. Cada un di de onde saen os datos e que non mostran.',
    es: 'Mapas animados de un día de Galicia, cada uno con su reloj: cómo se mueve, dónde está la gente, qué tiempo hace. Cada uno dice de dónde salen los datos y qué no muestran.',
  },
  pulse_back: { gl: 'Todos os pulsos', es: 'Todos los pulsos' },
  pulse_index_soon: { gl: 'en preparación', es: 'en preparación' },
  pulse_index_note: {
    gl: 'Os mapas respectan a preferencia de movemento reducido do teu sistema e levan unha táboa coas mesmas cifras.',
    es: 'Los mapas respetan la preferencia de movimiento reducido de tu sistema y llevan una tabla con las mismas cifras.',
  },
  pulse_lede: {
    gl: 'Todos os trens e autobuses públicos dun día, segundo os horarios oficiais. Compara un mércores cun domingo.',
    es: 'Todos los trenes y autobuses públicos de un día, según los horarios oficiales. Compara un miércoles con un domingo.',
  },
  pulse_map_label: {
    gl: 'Mapa de Galicia cos trens e autobuses programados movéndose. As cifras están no panel.',
    es: 'Mapa de Galicia con los trenes y autobuses programados moviéndose. Las cifras están en el panel.',
  },
  pulse_day: { gl: 'Día', es: 'Día' },
  pulse_weekday: { gl: 'Mércores', es: 'Miércoles' },
  pulse_sunday: { gl: 'Domingo', es: 'Domingo' },
  pulse_train: { gl: 'Tren', es: 'Tren' },
  pulse_bus: { gl: 'Autobús', es: 'Autobús' },
  pulse_play: { gl: 'Reproducir', es: 'Reproducir' },
  pulse_pause: { gl: 'Pausa', es: 'Pausa' },
  pulse_speed: { gl: 'Velocidade', es: 'Velocidad' },
  pulse_speed_opt: { gl: 'O día en {s} s', es: 'El día en {s} s' },
  pulse_time: { gl: 'Hora', es: 'Hora' },
  pulse_running: {
    gl: 'En circulación: {tren} trens · {bus} autobuses',
    es: 'En circulación: {tren} trenes · {bus} autobuses',
  },
  pulse_weekdays: {
    gl: 'domingo,luns,martes,mércores,xoves,venres,sábado',
    es: 'domingo,lunes,martes,miércoles,jueves,viernes,sábado',
  },
  pulse_months: {
    gl: 'xaneiro,febreiro,marzo,abril,maio,xuño,xullo,agosto,setembro,outubro,novembro,decembro',
    es: 'enero,febrero,marzo,abril,mayo,junio,julio,agosto,septiembre,octubre,noviembre,diciembre',
  },
  pulse_date: { gl: '{weekday} {day} de {month}', es: '{weekday} {day} de {month}' },
  pulse_day_total: {
    gl: 'O {dia}: {tren} viaxes de tren e {bus} de autobús.',
    es: 'El {dia}: {tren} viajes de tren y {bus} de autobús.',
  },
  pulse_curve: {
    gl: 'Vehículos en circulación ao longo do día (raiado: o outro día)',
    es: 'Vehículos en circulación a lo largo del día (rayado: el otro día)',
  },
  pulse_curve_label: {
    gl: 'Curva de vehículos en circulación o {dia}; máximo de {max} á vez.',
    es: 'Curva de vehículos en circulación el {dia}; máximo de {max} a la vez.',
  },
  pulse_about: { gl: 'Como se fai e fontes', es: 'Cómo se hace y fuentes' },
  pulse_note: {
    gl: 'Horas programadas nos horarios oficiais (GTFS), non posicións reais: atrasos e supresións non se ven. Cada vehículo vai en liña recta entre dúas paradas. Mércores de referencia e o domingo seguinte. Só a parte das viaxes dentro de Galicia.',
    es: 'Horas programadas en los horarios oficiales (GTFS), no posiciones reales: retrasos y supresiones no se ven. Cada vehículo va en línea recta entre dos paradas. Miércoles de referencia y el domingo siguiente. Solo la parte de los viajes dentro de Galicia.',
  },
  pulse_missing_all: {
    gl: 'Aínda non hai datos de horarios publicados.',
    es: 'Aún no hay datos de horarios publicados.',
  },
  fire_title: { gl: 'Focos de calor, agosto de 2025', es: 'Focos de calor, agosto de 2025' },
  fire_lede: {
    gl: 'O que viron os satélites sobre Galicia no mes dos grandes lumes, pasada a pasada. Cada foco escintila ao velo o satélite e arrefría nos días seguintes.',
    es: 'Lo que vieron los satélites sobre Galicia en el mes de los grandes incendios, pasada a pasada. Cada foco destella al verlo el satélite y se enfría en los días siguientes.',
  },
  fire_map_label: {
    gl: 'Mapa de Galicia cos focos de calor detectados por satélite en agosto de 2025. As cifras están no panel e na táboa.',
    es: 'Mapa de Galicia con los focos de calor detectados por satélite en agosto de 2025. Las cifras están en el panel y en la tabla.',
  },
  fire_now: {
    gl: 'Vistos ata agora: {n} focos en {c} concellos. Última pasada: {product}, {when}, {k} focos.',
    es: 'Vistos hasta ahora: {n} focos en {c} ayuntamientos. Última pasada: {product}, {when}, {k} focos.',
  },
  fire_now_none: { gl: 'Aínda ningún foco este mes.', es: 'Aún ningún foco este mes.' },
  fire_now_seen: { gl: 'ao velo', es: 'al verlo' },
  fire_days_after: { gl: '3 días despois', es: '3 días después' },
  fire_legend: {
    gl: 'Cada punto é un píxel quente nunha pasada (375 m VIIRS, 1 km MODIS): non é un lume nin unha superficie. Entre pasadas non se ve nada novo; a animación vai a saltos.',
    es: 'Cada punto es un píxel caliente en una pasada (375 m VIIRS, 1 km MODIS): no es un incendio ni una superficie. Entre pasadas no se ve nada nuevo; la animación va a saltos.',
  },
  fire_speed_opt: { gl: 'O mes en {s} s', es: 'El mes en {s} s' },
  fire_curve: {
    gl: 'Focos detectados cada día de agosto',
    es: 'Focos detectados cada día de agosto',
  },
  fire_curve_label: {
    gl: 'Focos detectados cada día de agosto de 2025: máximo de {max} o día {day}.',
    es: 'Focos detectados cada día de agosto de 2025: máximo de {max} el día {day}.',
  },
  fire_table_caption: {
    gl: 'Os 15 concellos con máis focos no mes ({n} focos en total).',
    es: 'Los 15 ayuntamientos con más focos en el mes ({n} focos en total).',
  },
  fire_col_concello: { gl: 'Concello', es: 'Ayuntamiento' },
  fire_col_count: { gl: 'Focos', es: 'Focos' },
  fire_col_first: { gl: 'Primeiro', es: 'Primero' },
  fire_col_peak: { gl: 'Día con máis', es: 'Día con más' },
  fire_date: { gl: '{day} de agosto ás {time}', es: '{day} de agosto a las {time}' },
  fire_note: {
    gl: 'Detección de calor de NASA FIRMS (arquivos anuais por país) dos satélites VIIRS S-NPP (píxel de 375 m) e MODIS Aqua e Terra (1 km), só os clasificados como lume de vexetación e só os que caen dentro dun concello galego. NOAA-20 e NOAA-21 tamén pasan sobre Galicia pero non teñen arquivo descargable sen chave e quedan fóra, así que hai máis pasadas das que se ven. Os satélites pasan poucas veces ao día (en Galicia, arredor das 03–06, 11–13, 14–17 e 22–24 h): a animación vai a saltos. Unha detección non é un lume nin unha hectárea, e o fume ou as nubes poden tapar un lume activo. A superficie queimada oficial e a estimada por satélite (EFFIS) son outras cifras, con outras fontes; ver a capa de áreas queimadas no mapa. Horas en hora oficial de Galicia.',
    es: 'Detecciones de calor de NASA FIRMS (archivos anuales por país) de los satélites VIIRS S-NPP (píxel de 375 m) y MODIS Aqua y Terra (1 km), solo las clasificadas como incendio de vegetación y solo las que caen dentro de un ayuntamiento gallego. NOAA-20 y NOAA-21 también pasan sobre Galicia pero no tienen archivo descargable sin clave y quedan fuera, así que hay más pasadas de las que se ven. Los satélites pasan pocas veces al día (en Galicia, hacia las 03–06, 11–13, 14–17 y 22–24 h): la animación va a saltos. Una detección no es un incendio ni una hectárea, y el humo o las nubes pueden tapar un incendio activo. La superficie quemada oficial y la estimada por satélite (EFFIS) son otras cifras, con otras fuentes; ver la capa de áreas quemadas en el mapa. Horas en hora oficial de Galicia.',
  },
  fire_missing: {
    gl: 'Aínda non están publicados os focos de agosto de 2025.',
    es: 'Aún no están publicados los focos de agosto de 2025.',
  },
  weather_title: { gl: 'O tempo hora a hora', es: 'El tiempo hora a hora' },
  weather_lede: {
    gl: 'As estacións de MeteoGalicia hora a hora: a luz do sol medida, a temperatura, o vento e a choiva. O día de referencia da serie ou as últimas 24 horas.',
    es: 'Las estaciones de MeteoGalicia hora a hora: la luz del sol medida, la temperatura, el viento y la lluvia. El día de referencia de la serie o las últimas 24 horas.',
  },
  weather_map_label: {
    gl: 'Mapa de Galicia coas estacións meteorolóxicas: cor pola temperatura, partículas polo vento e pingas pola choiva. As cifras están no panel e na táboa.',
    es: 'Mapa de Galicia con las estaciones meteorológicas: color por la temperatura, partículas por el viento y gotas por la lluvia. Las cifras están en el panel y en la tabla.',
  },
  weather_mode: { gl: 'Período', es: 'Periodo' },
  weather_mode_day: { gl: '21 de maio de 2025', es: '21 de mayo de 2025' },
  weather_mode_live: { gl: 'Últimas 24 horas', es: 'Últimas 24 horas' },
  weather_period_day: {
    gl: 'Mércores 21 de maio de 2025, o día de referencia da serie.',
    es: 'Miércoles 21 de mayo de 2025, el día de referencia de la serie.',
  },
  weather_period_live: {
    gl: 'As 24 horas ata a última lectura: as {hour} do {date}. Actualízase cada hora.',
    es: 'Las 24 horas hasta la última lectura: las {hour} del {date}. Se actualiza cada hora.',
  },
  weather_period_stale: {
    gl: 'Ollo: estes datos levan máis de tres horas sen actualizarse.',
    es: 'Ojo: estos datos llevan más de tres horas sin actualizarse.',
  },
  weather_temp: { gl: 'Temperatura', es: 'Temperatura' },
  weather_wind: { gl: 'Vento', es: 'Viento' },
  weather_rain: { gl: 'Choiva', es: 'Lluvia' },
  weather_now: {
    gl: 'Media {mean} °C · máxima {max} °C en {maxAt} · mínima {min} °C en {minAt}.',
    es: 'Media {mean} °C · máxima {max} °C en {maxAt} · mínima {min} °C en {minAt}.',
  },
  weather_legend: {
    gl: 'A cor arredor de cada estación é a súa temperatura (non se calcula nada entre estacións). As partículas van cara a onde sopra o vento; o fondo aclara coa radiación solar media medida.',
    es: 'El color alrededor de cada estación es su temperatura (no se calcula nada entre estaciones). Las partículas van hacia donde sopla el viento; el fondo se aclara con la radiación solar media medida.',
  },
  weather_curve: {
    gl: 'Temperatura media das estacións e franxa entre a mínima e a máxima (fondo: sol)',
    es: 'Temperatura media de las estaciones y franja entre la mínima y la máxima (fondo: sol)',
  },
  weather_curve_label: {
    gl: 'Temperatura media das estacións ao longo do día: de {low} °C ás {lowAt} a {high} °C ás {highAt}.',
    es: 'Temperatura media de las estaciones a lo largo del día: de {low} °C a las {lowAt} a {high} °C a las {highAt}.',
  },
  weather_table_caption: {
    gl: 'Resumo das {n} estacións, hora a hora. Choiva: estacións con algo de choiva nesa hora.',
    es: 'Resumen de las {n} estaciones, hora a hora. Lluvia: estaciones con algo de lluvia en esa hora.',
  },
  weather_col_mean: { gl: 'Media °C', es: 'Media °C' },
  weather_col_min: { gl: 'Mín. °C', es: 'Mín. °C' },
  weather_col_max: { gl: 'Máx. °C', es: 'Máx. °C' },
  weather_col_rain: { gl: 'Choiva', es: 'Lluvia' },
  weather_col_wind: { gl: 'Vento m/s', es: 'Viento m/s' },
  weather_note: {
    gl: 'Observación horaria das estacións de MeteoGalicia, só lecturas validadas, en hora oficial de Galicia. «Últimas 24 horas» renóvase cada hora cunha soa petición a MeteoGalicia. O día de referencia é o mesmo mércores que un dos catro da media de mobilidade, escollido por ser o máis común dos catro: suave e case seco (o 28 de maio pasou dos 35 °C e o 14 choveu). A cor arredor de cada estación só representa esa estación; entre estacións non se calcula nada. O vento é o medio da hora a 10 m (ou a 2 m onde non hai mastro de 10 m); as partículas son un esquema da dirección e da forza. O fondo aclara coa radiación solar media de todas as estacións.',
    es: 'Observación horaria de las estaciones de MeteoGalicia, solo lecturas validadas, en hora oficial de Galicia. «Últimas 24 horas» se renueva cada hora con una sola petición a MeteoGalicia. El día de referencia es el mismo miércoles que uno de los cuatro de la media de movilidad, elegido por ser el más común de los cuatro: suave y casi seco (el 28 de mayo pasó de 35 °C y el 14 llovió). El color alrededor de cada estación solo representa esa estación; entre estaciones no se calcula nada. El viento es el medio de la hora a 10 m (o a 2 m donde no hay mástil de 10 m); las partículas son un esquema de la dirección y la fuerza. El fondo se aclara con la radiación solar media de todas las estaciones.',
  },
  weather_missing: {
    gl: 'Aínda non están publicados os datos do tempo dese día.',
    es: 'Aún no están publicados los datos del tiempo de ese día.',
  },
  moves_title: { gl: 'Galicia en movemento', es: 'Galicia en movimiento' },
  moves_lede: {
    gl: 'As viaxes entre concellos dun mércores e dun domingo medios de maio de 2025, hora a hora. Cada sentido vai polo seu carril.',
    es: 'Los viajes entre ayuntamientos de un miércoles y un domingo medios de mayo de 2025, hora a hora. Cada sentido va por su carril.',
  },
  moves_map_label: {
    gl: 'Mapa de Galicia con partículas que viaxan entre concellos. As cifras están no panel e na táboa.',
    es: 'Mapa de Galicia con partículas que viajan entre ayuntamientos. Las cifras están en el panel y en la tabla.',
  },
  moves_now: {
    gl: 'Nesta hora: {n} viaxes entre concellos.',
    es: 'En esta hora: {n} viajes entre ayuntamientos.',
  },
  moves_legend: {
    gl: 'Cada punto son 100 viaxes. Van en liña curva do centro dunha zona ao doutra, a unha velocidade esquemática: non son traxectos reais.',
    es: 'Cada punto son 100 viajes. Van en línea curva del centro de una zona al de otra, a una velocidad esquemática: no son trayectos reales.',
  },
  moves_curve: {
    gl: 'Viaxes entre concellos por hora (raiado: o outro día)',
    es: 'Viajes entre ayuntamientos por hora (rayado: el otro día)',
  },
  moves_curve_label: {
    gl: 'Viaxes entre concellos por hora o {dia} medio; máximo de {max} ás {hour}.',
    es: 'Viajes entre ayuntamientos por hora el {dia} medio; máximo de {max} a las {hour}.',
  },
  moves_table_caption: {
    gl: 'As 20 relacións con máis viaxes no {dia} medio (os dous sentidos sumados).',
    es: 'Las 20 relaciones con más viajes en el {dia} medio (los dos sentidos sumados).',
  },
  moves_col_pair: { gl: 'Entre', es: 'Entre' },
  moves_col_km: { gl: 'km', es: 'km' },
  moves_col_day: { gl: 'Viaxes ao día', es: 'Viajes al día' },
  moves_col_peak: { gl: 'Hora punta', es: 'Hora punta' },
  moves_note: {
    gl: 'Datos de telefonía móbil do Ministerio de Transportes (estudos básicos por municipios): media de catro mércores (7, 14, 21 e 28 de maio de 2025) e catro domingos (11, 18 e 25 de maio e 1 de xuño). Contan viaxes, non persoas, e só de residentes en España. Móstranse os pares de zonas con polo menos 50 viaxes ao día, que suman o 97 % das viaxes entre zonas; quedan fóra as viaxes dentro dunha mesma zona e as que entran ou saen de Galicia. O ministerio agrupa moitos concellos rurais en zonas: a viaxe sae do centro do grupo, non do concello. A curva e a velocidade son un esquema: só a hora de saída e os extremos veñen dos datos.',
    es: 'Datos de telefonía móvil del Ministerio de Transportes (estudios básicos por municipios): media de cuatro miércoles (7, 14, 21 y 28 de mayo de 2025) y cuatro domingos (11, 18 y 25 de mayo y 1 de junio). Cuentan viajes, no personas, y solo de residentes en España. Se muestran los pares de zonas con al menos 50 viajes al día, que suman el 97 % de los viajes entre zonas; quedan fuera los viajes dentro de una misma zona y los que entran o salen de Galicia. El ministerio agrupa muchos municipios rurales en zonas: el viaje sale del centro del grupo, no del municipio. La curva y la velocidad son un esquema: solo la hora de salida y los extremos vienen de los datos.',
  },
  moves_missing: {
    gl: 'Aínda non están publicados os datos de viaxes entre concellos.',
    es: 'Aún no están publicados los datos de viajes entre ayuntamientos.',
  },
  cities_title: {
    gl: 'Entradas e saídas das sete cidades',
    es: 'Entradas y salidas de las siete ciudades',
  },
  cities_lede: {
    gl: 'Viaxes que entran e saen de cada cidade hora a hora, nun mércores e nun domingo medios de maio de 2025. Cada cidade mídese contra os seus residentes.',
    es: 'Viajes que entran y salen de cada ciudad hora a hora, en un miércoles y un domingo medios de mayo de 2025. Cada ciudad se mide contra sus residentes.',
  },
  cities_map_label: {
    gl: 'Mapa das sete cidades galegas con partículas que entran e saen. As cifras están no panel e na táboa.',
    es: 'Mapa de las siete ciudades gallegas con partículas que entran y salen. Las cifras están en el panel y en la tabla.',
  },
  cities_ring: { gl: 'Ámbito', es: 'Ámbito' },
  cities_ring0: { gl: 'Concello', es: 'Concello' },
  cities_ring1: { gl: 'Área urbana', es: 'Área urbana' },
  cities_legend: {
    gl: 'Cada punto é o 0,1 % dos residentes: amarelo entra, azul sae. O aro mide a xente de máis (ou de menos) respecto ás 00:00.',
    es: 'Cada punto es el 0,1 % de los residentes: amarillo entra, azul sale. El aro mide la gente de más (o de menos) respecto a las 00:00.',
  },
  cities_now: {
    gl: 'Agora entran {in} e saen {out} viaxes por hora nas sete cidades.',
    es: 'Ahora entran {in} y salen {out} viajes por hora en las siete ciudades.',
  },
  cities_curves: {
    gl: 'Xente de máis respecto ás 00:00, en % dos residentes (raiado: o outro día)',
    es: 'Gente de más respecto a las 00:00, en % de los residentes (rayado: el otro día)',
  },
  cities_curve_label: {
    gl: '{city}: máximo de {max} % ás {hour}.',
    es: '{city}: máximo de {max} % a las {hour}.',
  },
  cities_curve_label_neg: {
    gl: '{city}: non gaña xente en todo o día; mínimo de {min} % ás {hour}.',
    es: '{city}: no gana gente en todo el día; mínimo de {min} % a las {hour}.',
  },
  cities_table: { gl: 'Táboa', es: 'Tabla' },
  cities_table_caption: {
    gl: '{ambito}, {dia} medio. Viaxes por día; presenza máxima = maior saldo acumulado desde as 00:00.',
    es: '{ambito}, {dia} medio. Viajes por día; presencia máxima = mayor saldo acumulado desde las 00:00.',
  },
  cities_col_city: { gl: 'Cidade', es: 'Ciudad' },
  cities_col_res: { gl: 'Residentes', es: 'Residentes' },
  cities_col_in: { gl: 'Entradas', es: 'Entradas' },
  cities_col_out: { gl: 'Saídas', es: 'Salidas' },
  cities_col_peak: { gl: 'Presenza máxima', es: 'Presencia máxima' },
  cities_col_hour: { gl: 'Hora', es: 'Hora' },
  cities_note: {
    gl: 'Datos de telefonía móbil do Ministerio de Transportes (estudos básicos por municipios): media de catro mércores (7, 14, 21 e 28 de maio de 2025) e catro domingos (11, 18 e 25 de maio e 1 de xuño; o 4 de maio, volta da ponte, queda fóra). Contan viaxes, non persoas, e só de residentes en España. Entrada é unha viaxe que empeza fóra e acaba dentro. O «Concello» é o termo municipal; a «Área urbana» suma os concellos contiguos (a partir das áreas urbanas do ministerio; a de Vigo e Pontevedra pártese en dúas). Cada cidade mídese en % dos seus residentes: non comparar volumes. Ourense case non gaña xente de día porque o seu polo de emprego (San Cibrao das Viñas, O Pereiro de Aguiar) queda fóra do ámbito. Desde xullo de 2025 o ministerio só publica semanas soltas e cambiou o método, por iso o período é fixo.',
    es: 'Datos de telefonía móvil del Ministerio de Transportes (estudios básicos por municipios): media de cuatro miércoles (7, 14, 21 y 28 de mayo de 2025) y cuatro domingos (11, 18 y 25 de mayo y 1 de junio; el 4 de mayo, vuelta del puente, queda fuera). Cuentan viajes, no personas, y solo de residentes en España. Entrada es un viaje que empieza fuera y acaba dentro. El «Concello» es el término municipal; el «Área urbana» suma los municipios contiguos (a partir de las áreas urbanas del ministerio; la de Vigo y Pontevedra se parte en dos). Cada ciudad se mide en % de sus residentes: no comparar volúmenes. Ourense casi no gana gente de día porque su polo de empleo (San Cibrao das Viñas, O Pereiro de Aguiar) queda fuera del ámbito. Desde julio de 2025 el ministerio solo publica semanas sueltas y cambió el método, por eso el periodo es fijo.',
  },
  cities_missing: {
    gl: 'Aínda non están publicados os datos das cidades.',
    es: 'Aún no están publicados los datos de las ciudades.',
  },
} as const;

export type Key = keyof typeof STRINGS;

export function t(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  let s: string = STRINGS[key][lang];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** All strings for one language, for client scripts. */
export function dictionary(lang: Lang): Record<Key, string> {
  return Object.fromEntries(Object.entries(STRINGS).map(([k, v]) => [k, v[lang]])) as Record<
    Key,
    string
  >;
}

export function base(lang: Lang): string {
  return lang === 'gl' ? BASE : `${BASE}es/`;
}

export function relativeTime(iso: string | null, lang: Lang, now = new Date()): string | null {
  if (!iso) return null;
  const diff = (Date.parse(iso) - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function absoluteTime(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(lang === 'gl' ? 'gl-ES' : 'es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(iso));
}
