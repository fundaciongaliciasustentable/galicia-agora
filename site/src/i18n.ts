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
  active_layers: { gl: 'No mapa', es: 'En el mapa' },
  layer_info: { gl: 'Ficha da capa', es: 'Ficha de la capa' },
  remove_layer: { gl: 'Quitar do mapa', es: 'Quitar del mapa' },
  clear_layers: { gl: 'Quitar todas', es: 'Quitar todas' },
  show_legend: { gl: 'Mostrar ou ocultar a lenda', es: 'Mostrar u ocultar la leyenda' },
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
  pulse_index_layers: { gl: 'Mapas', es: 'Mapas' },
  pulse_index_hide: { gl: 'Recoller a lista de mapas', es: 'Recoger la lista de mapas' },
  pulse_index_show: { gl: 'Ver a lista de mapas', es: 'Ver la lista de mapas' },
  pulse_index_open: { gl: 'Abrir só este mapa', es: 'Abrir solo este mapa' },
  pulse_index_frame: { gl: 'Mapa: {title}', es: 'Mapa: {title}' },
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
  pulse_week_of: { gl: 'semana do {day}', es: 'semana del {day}' },
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
  century_title: { gl: 'Un século de poboación', es: 'Un siglo de población' },
  century_lede: {
    gl: 'Os censos de 1900 a 2021, concello a concello e sobre os límites de hoxe: onde se foi a xente e onde se xuntou. Cada cor compara co mesmo concello en 1900.',
    es: 'Los censos de 1900 a 2021, ayuntamiento a ayuntamiento y sobre los límites de hoy: dónde se fue la gente y dónde se juntó. Cada color compara con el mismo ayuntamiento en 1900.',
  },
  century_map_label: {
    gl: 'Mapa dos concellos de Galicia coloreados pola súa poboación respecto a 1900 no censo escollido. As cifras están no panel e na táboa.',
    es: 'Mapa de los ayuntamientos de Galicia coloreados por su población respecto a 1900 en el censo elegido. Las cifras están en el panel y en la tabla.',
  },
  century_census: { gl: 'Censo de {y}', es: 'Censo de {y}' },
  century_now: {
    gl: 'Galicia: {pop} habitantes ({index} % de 1900). Medran respecto a 1900: {up} concellos; perden: {down}.',
    es: 'Galicia: {pop} habitantes ({index} % de 1900). Crecen respecto a 1900: {up} ayuntamientos; pierden: {down}.',
  },
  century_detail: {
    gl: '{name}: {pop} habitantes en {y}, o {index} % de 1900.',
    es: '{name}: {pop} habitantes en {y}, el {index} % de 1900.',
  },
  century_detail_unit: {
    gl: 'Compárase xunto con {others}: unha parte do seu territorio era deles en 1900.',
    es: 'Se compara junto con {others}: una parte de su territorio era suya en 1900.',
  },
  century_detail_includes: {
    gl: 'Inclúe os antigos municipios de {names}.',
    es: 'Incluye los antiguos municipios de {names}.',
  },
  century_pick: {
    gl: 'Toca un concello no mapa para ver os seus cen anos.',
    es: 'Toca un ayuntamiento en el mapa para ver sus cien años.',
  },
  century_legend: {
    gl: 'Marrón: ten menos xente ca en 1900. Branco: a mesma. Morado: máis. A escala é de 25 % a 400 %.',
    es: 'Marrón: tiene menos gente que en 1900. Blanco: la misma. Morado: más. La escala va de 25 % a 400 %.',
  },
  century_curve: {
    gl: 'Poboación de Galicia en cada censo (branco: o concello escollido, en % de 1900)',
    es: 'Población de Galicia en cada censo (blanco: el ayuntamiento elegido, en % de 1900)',
  },
  century_curve_label: {
    gl: 'Poboación de Galicia en cada censo: de {first} en 1900 a {last} en 2021, cun máximo de {max} en {maxYear}.',
    es: 'Población de Galicia en cada censo: de {first} en 1900 a {last} en 2021, con un máximo de {max} en {maxYear}.',
  },
  century_table_caption: {
    gl: 'Os 15 concellos que máis medraron e os 15 que máis perderon entre 1900 e {y} (% de 1900).',
    es: 'Los 15 ayuntamientos que más crecieron y los 15 que más perdieron entre 1900 y {y} (% de 1900).',
  },
  century_col_year: { gl: 'Censo', es: 'Censo' },
  century_col_index: { gl: '% de 1900', es: '% de 1900' },
  century_speed_opt: { gl: '{s} s por censo', es: '{s} s por censo' },
  century_note: {
    gl: 'INE, «Alteraciones de los municipios en los Censos de Población desde 1842»: poboación de dereito nos censos de 1900 a 1991 e residente de 2001 a 2021. Cálculo propio para levala aos 313 concellos de hoxe: os municipios desaparecidos (Conxo e Enfesta en Santiago, Oza na Coruña, Serantes en Ferrol, Bouzas e Lavadores en Vigo, Geve e Ponte Sampaio en Pontevedra, Carril e Vilaxoán en Vilagarcía, entre outros), as fusións de Oza-Cesuras e Cerdedo-Cotobade e o cambio de Neira de Xusá a Baralla súmanse ao concello de hoxe. Os concellos segregados despois de 1900 (Rábade, Negueira de Muñiz, Ribeira de Piquín, Mondariz-Balneario, Pontecesures, Cariño, Burela e A Illa de Arousa) compáranse xunto co concello do que saíron, porque en 1900 a súa xente estaba nel. Os cambios parciais de termo non se poden corrixir. Nos primeiros censos a poboación de dereito conta como veciños moitos emigrantes ausentes. Os censos saltan sen interpolar.',
    es: 'INE, «Alteraciones de los municipios en los Censos de Población desde 1842»: población de derecho en los censos de 1900 a 1991 y residente de 2001 a 2021. Cálculo propio para llevarla a los 313 ayuntamientos de hoy: los municipios desaparecidos (Conxo y Enfesta en Santiago, Oza en A Coruña, Serantes en Ferrol, Bouzas y Lavadores en Vigo, Geve y Ponte Sampaio en Pontevedra, Carril y Vilaxoán en Vilagarcía, entre otros), las fusiones de Oza-Cesuras y Cerdedo-Cotobade y el cambio de Neira de Xusá a Baralla se suman al ayuntamiento de hoy. Los ayuntamientos segregados después de 1900 (Rábade, Negueira de Muñiz, Ribeira de Piquín, Mondariz-Balneario, Pontecesures, Cariño, Burela y A Illa de Arousa) se comparan junto con el ayuntamiento del que salieron, porque en 1900 su gente estaba en él. Los cambios parciales de término no se pueden corregir. En los primeros censos la población de derecho cuenta como vecinos a muchos emigrantes ausentes. Los censos saltan sin interpolar.',
  },
  century_missing: {
    gl: 'Aínda non están publicados os datos dos censos.',
    es: 'Aún no están publicados los datos de los censos.',
  },
  season_title: { gl: 'Poboación estacional', es: 'Población estacional' },
  season_lede: {
    gl: 'Canta xente soporta cada concello, trimestre a trimestre, contra os seus residentes: turismo, segundas vivendas, estudos, traballo e saúde. 2025 é provisional e só ten dous trimestres; 2024 vai como referencia.',
    es: 'Cuánta gente soporta cada ayuntamiento, trimestre a trimestre, frente a sus residentes: turismo, segundas viviendas, estudios, trabajo y salud. 2025 es provisional y solo tiene dos trimestres; 2024 va como referencia.',
  },
  season_map_label: {
    gl: 'Mapa dos concellos de Galicia coloreados pola súa taxa de carga poboacional no trimestre. As cifras están no panel e na táboa.',
    es: 'Mapa de los ayuntamientos de Galicia coloreados por su tasa de carga poblacional en el trimestre. Las cifras están en el panel y en la tabla.',
  },
  season_quarter: { gl: '{q} trimestre', es: '{q} trimestre' },
  season_provisional: { gl: 'provisional', es: 'provisional' },
  season_missing_quarter: {
    gl: 'Aínda sen publicar: o IGE publica cada ano completo dous anos despois.',
    es: 'Aún sin publicar: el IGE publica cada año completo dos años después.',
  },
  season_now: {
    gl: 'Galicia: {rate} % dos residentes. Máis carga: {top}.',
    es: 'Galicia: {rate} % de los residentes. Más carga: {top}.',
  },
  season_detail: {
    gl: '{name}: {rate} % ({load} persoas para {res} residentes).',
    es: '{name}: {rate} % ({load} personas para {res} residentes).',
  },
  season_parts: {
    gl: 'Achegan: turismo {tur}, segundas vivendas {sv}, estudos {est}, traballo {tra}, saúde {sau}.',
    es: 'Aportan: turismo {tur}, segundas viviendas {sv}, estudios {est}, trabajo {tra}, salud {sau}.',
  },
  season_pick: {
    gl: 'Toca un concello no mapa para ver o seu detalle.',
    es: 'Toca un ayuntamiento en el mapa para ver su detalle.',
  },
  season_legend: {
    gl: 'Azul: soporta menos xente ca a que vive nel (saen máis dos que chegan). Laranxa e vermello: máis. O 100 % son os seus residentes.',
    es: 'Azul: soporta menos gente de la que vive en él (salen más de los que llegan). Naranja y rojo: más. El 100 % son sus residentes.',
  },
  season_curve: {
    gl: 'Taxa de carga de Galicia por trimestre (branco: o concello escollido)',
    es: 'Tasa de carga de Galicia por trimestre (blanco: el ayuntamiento elegido)',
  },
  season_curve_label: {
    gl: 'Taxa de carga de Galicia por trimestre: de {min} % a {max} %.',
    es: 'Tasa de carga de Galicia por trimestre: de {min} % a {max} %.',
  },
  season_table_caption: {
    gl: 'Os 20 concellos con máis carga en {q}, en % dos residentes.',
    es: 'Los 20 ayuntamientos con más carga en {q}, en % de los residentes.',
  },
  season_col_rate: { gl: 'Taxa %', es: 'Tasa %' },
  season_col_load: { gl: 'Carga', es: 'Carga' },
  season_col_res: { gl: 'Residentes', es: 'Residentes' },
  season_speed_opt: { gl: '{s} s por trimestre', es: '{s} s por trimestre' },
  season_note: {
    gl: 'Estimación do IGE («Carga de poboación estacional dos concellos de Galicia», táboas 9043 e 9046): media trimestral de persoas equivalentes a tempo completo que soporta cada concello, sumando aos residentes os que chegan e restando os que saen por turismo, segundas vivendas, estudos, traballo e saúde (un terzo de peso á noite e dous terzos ao día). É un cálculo con modelos sobre enquisas e rexistros, non un reconto. 2025 é provisional e só ten os trimestres I e II: o IGE publica cada ano completo dous anos despois, así que o verán de 2025 non está; 2024 é o último ano definitivo e vai ao lado como referencia. Os trimestres saltan sen interpolar. A diferenza con Galicia é cálculo propio. Este produto emprega a API de datos do IGE, pero non está certificado nin aprobado polo IGE.',
    es: 'Estimación del IGE («Carga de poboación estacional dos concellos de Galicia», tablas 9043 y 9046): media trimestral de personas equivalentes a tiempo completo que soporta cada ayuntamiento, sumando a los residentes los que llegan y restando los que salen por turismo, segundas viviendas, estudios, trabajo y salud (un tercio de peso por la noche y dos tercios por el día). Es un cálculo con modelos sobre encuestas y registros, no un recuento. 2025 es provisional y solo tiene los trimestres I y II: el IGE publica cada año completo dos años después, así que el verano de 2025 no está; 2024 es el último año definitivo y va al lado como referencia. Los trimestres saltan sin interpolar. La diferencia con Galicia es cálculo propio. Este producto emplea la API de datos del IGE, pero no está certificado ni aprobado por el IGE.',
  },
  season_missing: {
    gl: 'Aínda non están publicados os datos de poboación estacional.',
    es: 'Aún no están publicados los datos de población estacional.',
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
  fish_title: { gl: 'O peixe das lonxas, 2025', es: 'El pescado de las lonjas, 2025' },
  fish_lede: {
    gl: 'A primeira venda de peixe e marisco fresco en cada lonxa galega, día a día durante 2025. Cada círculo é o importe vendido ese día, por grupos de especies.',
    es: 'La primera venta de pescado y marisco fresco en cada lonja gallega, día a día durante 2025. Cada círculo es el importe vendido ese día, por grupos de especies.',
  },
  fish_map_label: {
    gl: 'Mapa de Galicia coas lonxas e o importe vendido cada día de 2025. As cifras están no panel e na táboa.',
    es: 'Mapa de Galicia con las lonjas y el importe vendido cada día de 2025. Las cifras están en el panel y en la tabla.',
  },
  fish_group_peixes: { gl: 'Peixe', es: 'Pescado' },
  fish_group_bivalvos: { gl: 'Bivalvos', es: 'Bivalvos' },
  fish_group_cefalopodos: { gl: 'Cefalópodos', es: 'Cefalópodos' },
  fish_group_crustaceos: { gl: 'Crustáceos', es: 'Crustáceos' },
  fish_group_outros: { gl: 'Outros', es: 'Otros' },
  fish_now: {
    gl: '{eur} en {n} lonxas. Máis vendido en Galicia: {species}. Á cabeza: {top} ({topEur}).',
    es: '{eur} en {n} lonjas. Más vendido en Galicia: {species}. En cabeza: {top} ({topEur}).',
  },
  fish_now_none: {
    gl: 'Sen vendas: as lonxas pecharon este día.',
    es: 'Sin ventas: las lonjas cerraron este día.',
  },
  fish_year: {
    gl: 'No ano: {eur} e {t} toneladas en {n} lonxas.',
    es: 'En el año: {eur} y {t} toneladas en {n} lonjas.',
  },
  fish_legend: {
    gl: 'A superficie do círculo é o importe do día; as porcións, os grupos de especies. Un punto apagado é unha lonxa sen vendas ese día. Os días pasan a saltos, sen mesturar un co seguinte.',
    es: 'La superficie del círculo es el importe del día; las porciones, los grupos de especies. Un punto apagado es una lonja sin ventas ese día. Los días pasan a saltos, sin mezclar uno con el siguiente.',
  },
  fish_speed_opt: { gl: 'O ano en {s} s', es: 'El año en {s} s' },
  fish_curve: {
    gl: 'Importe vendido cada día en Galicia',
    es: 'Importe vendido cada día en Galicia',
  },
  fish_curve_label: {
    gl: 'Importe da primeira venda cada día de 2025 en Galicia: máximo de {max} o {day}.',
    es: 'Importe de la primera venta cada día de 2025 en Galicia: máximo de {max} el {day}.',
  },
  fish_table_caption: {
    gl: 'As {n} lonxas de 2025, por importe no ano. Con * as que non están no mapa.',
    es: 'Las {n} lonjas de 2025, por importe en el año. Con * las que no están en el mapa.',
  },
  fish_col_lonxa: { gl: 'Lonxa', es: 'Lonja' },
  fish_col_eur: { gl: 'M€', es: 'M€' },
  fish_col_t: { gl: 't', es: 't' },
  fish_col_days: { gl: 'Días', es: 'Días' },
  fish_col_species: { gl: 'Especie principal', es: 'Especie principal' },
  fish_note: {
    gl: 'Notas de primeira venda da Consellería do Mar (pescadegalicia.gal), ficheiro de pesca fresca de 2025: unha fila por día, lonxa e especie, con quilos e euros. Só pesca fresca: a acuicultura (o mexillón de batea, por exemplo) e o peixe conxelado van noutras estatísticas e non están aquí. A lonxa é onde se vende, non onde se pescou: Vigo, A Coruña, Burela ou Celeiro venden capturas de caladoiros afastados. As lonxas non traen coordenadas: cada unha está no porto que lle corresponde no Nomenclátor Geográfico Básico do IGN ou, se o IGN non o nomea, no núcleo que lle dá nome; Baldaio e a Cooperativa Ría de Arosa non teñen un punto verificable e só están na táboa. Non se mostran prezos de especies por lonxa: nunha lonxa pequena unha venda pode ser dun só barco. Euros correntes de 2025.',
    es: 'Notas de primera venta de la Consellería do Mar (pescadegalicia.gal), fichero de pesca fresca de 2025: una fila por día, lonja y especie, con kilos y euros. Solo pesca fresca: la acuicultura (el mejillón de batea, por ejemplo) y el pescado congelado van en otras estadísticas y no están aquí. La lonja es donde se vende, no donde se pescó: Vigo, A Coruña, Burela o Celeiro venden capturas de caladeros lejanos. Las lonjas no traen coordenadas: cada una está en el puerto que le corresponde en el Nomenclátor Geográfico Básico del IGN o, si el IGN no lo nombra, en el núcleo que le da nombre; Baldaio y la Cooperativa Ría de Arosa no tienen un punto verificable y solo están en la tabla. No se muestran precios de especies por lonja: en una lonja pequeña una venta puede ser de un solo barco. Euros corrientes de 2025.',
  },
  fish_missing: {
    gl: 'Aínda non están publicadas as vendas das lonxas de 2025.',
    es: 'Aún no están publicadas las ventas de las lonjas de 2025.',
  },
  sun_title: { gl: 'O día e a noite sobre Galicia', es: 'El día y la noche sobre Galicia' },
  sun_lede: {
    gl: 'A sombra da noite e os crepúsculos cruzando Galicia nun día que escollas. Cada concello acéndese cando sae o sol alí.',
    es: 'La sombra de la noche y los crepúsculos cruzando Galicia en el día que elijas. Cada ayuntamiento se enciende cuando sale el sol allí.',
  },
  sun_map_label: {
    gl: 'Mapa de Galicia coa luz do sol e a noite ao longo dun día. As horas de cada concello están no panel e na táboa.',
    es: 'Mapa de Galicia con la luz del sol y la noche a lo largo de un día. Las horas de cada ayuntamiento están en el panel y en la tabla.',
  },
  sun_presets: { gl: 'Días sinalados', es: 'Días señalados' },
  sun_preset_inverno: { gl: 'Inverno', es: 'Invierno' },
  sun_preset_equinoccio: { gl: 'Equinoccio', es: 'Equinoccio' },
  sun_preset_veran: { gl: 'Verán', es: 'Verano' },
  sun_preset_hoxe: { gl: 'Hoxe', es: 'Hoy' },
  sun_date: { gl: 'Data', es: 'Fecha' },
  sun_speed_opt: { gl: 'O día en {s} s', es: 'El día en {s} s' },
  sun_band_day: { gl: 'Día', es: 'Día' },
  sun_band_civil: { gl: 'Crepúsculo civil', es: 'Crepúsculo civil' },
  sun_band_nautical: { gl: 'Náutico', es: 'Náutico' },
  sun_band_astro: { gl: 'Astronómico', es: 'Astronómico' },
  sun_band_night: { gl: 'Noite', es: 'Noche' },
  sun_now: {
    gl: 'Sol sobre o horizonte en {n} de {total} concellos.',
    es: 'Sol sobre el horizonte en {n} de {total} ayuntamientos.',
  },
  sun_rises: {
    gl: 'Amence primeiro en {first} ({t1}) e último en {last} ({t2}): {m} min despois.',
    es: 'Amanece primero en {first} ({t1}) y último en {last} ({t2}): {m} min después.',
  },
  sun_place: {
    gl: '{name}: amence ás {rise} e ponse ás {set}, {light} de luz. Altura do sol agora: {elev}°.',
    es: '{name}: amanece a las {rise} y se pone a las {set}, {light} de luz. Altura del sol ahora: {elev}°.',
  },
  sun_legend: {
    gl: 'Preme nun concello para ver as súas horas. A animación vai máis amodo mentres amence ou se pon o sol nalgún concello.',
    es: 'Pulsa en un ayuntamiento para ver sus horas. La animación va más despacio mientras amanece o se pone el sol en algún ayuntamiento.',
  },
  sun_curve: { gl: 'Altura do sol en {name}', es: 'Altura del sol en {name}' },
  sun_curve_label: {
    gl: 'Altura do sol ao longo do día en {name}: máximo de {max}° ás {time}.',
    es: 'Altura del sol a lo largo del día en {name}: máximo de {max}° a las {time}.',
  },
  sun_table_caption: {
    gl: 'Os {n} concellos, do primeiro ao último en ver o sol o {date}.',
    es: 'Los {n} ayuntamientos, del primero al último en ver el sol el {date}.',
  },
  sun_col_rise: { gl: 'Amence', es: 'Amanece' },
  sun_col_set: { gl: 'Ponse', es: 'Se pone' },
  sun_col_light: { gl: 'Luz', es: 'Luz' },
  sun_note: {
    gl: 'Calculado no navegador coas ecuacións do calculador solar da NOAA (algoritmos de Meeus), sen datos externos; contrastado coa táboa da NOAA para Santiago, con menos dun minuto de diferenza. O amencer e o solpor son o momento en que o bordo de arriba do sol toca o horizonte, coa refracción media (centro do sol a −0,833°); os crepúsculos civil, náutico e astronómico rematan co sol a −6°, −12° e −18°. Horizonte ideal: as montañas e os vales adiantan o solpor e atrasan o amencer, e iso non se ve aquí. Cada concello mídese no seu punto representativo (capa perfil-concellos). Horas en hora oficial de Galicia; os días de cambio de hora teñen 23 ou 25 horas.',
    es: 'Calculado en el navegador con las ecuaciones del calculador solar de la NOAA (algoritmos de Meeus), sin datos externos; contrastado con la tabla de la NOAA para Santiago, con menos de un minuto de diferencia. El amanecer y la puesta son el momento en que el borde superior del sol toca el horizonte, con la refracción media (centro del sol a −0,833°); los crepúsculos civil, náutico y astronómico terminan con el sol a −6°, −12° y −18°. Horizonte ideal: las montañas y los valles adelantan la puesta y retrasan el amanecer, y eso no se ve aquí. Cada ayuntamiento se mide en su punto representativo (capa perfil-concellos). Horas en hora oficial de Galicia; los días de cambio de hora tienen 23 o 25 horas.',
  },
  sun_missing: {
    gl: 'Non se puideron cargar os puntos dos concellos.',
    es: 'No se pudieron cargar los puntos de los ayuntamientos.',
  },
  bolt_title: { gl: 'Lóstregos, doce meses', es: 'Rayos, doce meses' },
  bolt_lede: {
    gl: 'Cada raio que detectou a rede de MeteoGalicia sobre Galicia no último ano, á súa hora. Os días sen tormenta pásanse de largo.',
    es: 'Cada rayo que detectó la red de MeteoGalicia sobre Galicia en el último año, a su hora. Los días sin tormenta se pasan de largo.',
  },
  bolt_map_label: {
    gl: 'Mapa de Galicia cos raios detectados día a día durante doce meses. As cifras están no panel e na táboa.',
    es: 'Mapa de Galicia con los rayos detectados día a día durante doce meses. Las cifras están en el panel y en la tabla.',
  },
  bolt_now: {
    gl: '{n} raios este día; o momento máis intenso, entre as {h}:00 e as {h2}:00 ({k}). No período ata agora: {total} raios en {days} días con tormenta.',
    es: '{n} rayos este día; el momento más intenso, entre las {h}:00 y las {h2}:00 ({k}). En el periodo hasta ahora: {total} rayos en {days} días con tormenta.',
  },
  bolt_quiet: {
    gl: 'Día sen raios. No período ata agora: {total} raios en {days} días con tormenta.',
    es: 'Día sin rayos. En el periodo hasta ahora: {total} rayos en {days} días con tormenta.',
  },
  bolt_legend: {
    gl: 'Cada raio escintila ao caer, arrefría nunha hora e queda como marca tenue o resto do ano. A rede tamén detecta raios no mar e nos bordos de Asturias, León e Portugal.',
    es: 'Cada rayo destella al caer, se enfría en una hora y queda como marca tenue el resto del año. La red también detecta rayos en el mar y en los bordes de Asturias, León y Portugal.',
  },
  bolt_speed_opt: { gl: 'Cada día de tormenta en {s} s', es: 'Cada día de tormenta en {s} s' },
  bolt_curve: {
    gl: 'Raios cada día (escala de raíz cadrada)',
    es: 'Rayos cada día (escala de raíz cuadrada)',
  },
  bolt_curve_label: {
    gl: 'Raios detectados cada día de {from} a {to}: máximo de {max} o {day}.',
    es: 'Rayos detectados cada día de {from} a {to}: máximo de {max} el {day}.',
  },
  bolt_table_caption: {
    gl: 'Os 15 días con máis raios ({n} raios en {days} días con tormenta).',
    es: 'Los 15 días con más rayos ({n} rayos en {days} días con tormenta).',
  },
  bolt_col_day: { gl: 'Día', es: 'Día' },
  bolt_col_n: { gl: 'Raios', es: 'Rayos' },
  bolt_col_peak: { gl: 'Hora con máis', es: 'Hora con más' },
  bolt_note: {
    gl: 'Rede de detección de raios de MeteoGalicia, descargada en xanelas de sete días (o servizo garda o histórico desde 2010). Doce meses enteiros anteriores ao mes en curso; renóvase cada mes. Horas en hora oficial de Galicia. Recorte rectangular arredor de Galicia, con mar e parte das comunidades veciñas. A documentación non di se a rede conta tamén descargas entre nubes; case a metade dos raios son de polaridade positiva, máis do habitual nos raios que chegan ao chan. Unha detección é un raio rexistrado pola rede, non un impacto comprobado no terreo.',
    es: 'Red de detección de rayos de MeteoGalicia, descargada en ventanas de siete días (el servicio guarda el histórico desde 2010). Doce meses enteros anteriores al mes en curso; se renueva cada mes. Horas en hora oficial de Galicia. Recorte rectangular alrededor de Galicia, con mar y parte de las comunidades vecinas. La documentación no dice si la red cuenta también descargas entre nubes; casi la mitad de los rayos son de polaridad positiva, más de lo habitual en los rayos que llegan al suelo. Una detección es un rayo registrado por la red, no un impacto comprobado en el terreno.',
  },
  bolt_missing: {
    gl: 'Aínda non están publicados os raios dos últimos doce meses.',
    es: 'Aún no están publicados los rayos de los últimos doce meses.',
  },
  pulse_provisional: { gl: 'provisional', es: 'provisional' },
  build_title: { gl: 'Como se construíu Galicia', es: 'Cómo se construyó Galicia' },
  build_lede: {
    gl: 'Cada cela de 250 metros acéndese no ano de construción que consta no Catastro para os edificios que hai nela hoxe, na cor do seu uso principal.',
    es: 'Cada celda de 250 metros se enciende en el año de construcción que consta en el Catastro para los edificios que hay en ella hoy, en el color de su uso principal.',
  },
  build_map_label: {
    gl: 'Mapa de Galicia cos edificios de hoxe acendéndose no seu ano de construción, desde 1900. As cifras están no panel e na táboa.',
    es: 'Mapa de Galicia con los edificios de hoy encendiéndose en su año de construcción, desde 1900. Las cifras están en el panel y en la tabla.',
  },
  build_now: {
    gl: '{n} edificios con este ano de construción, {v} deles de vivenda. Desde 1900 ata este ano: {cum} dos {dated} que teñen un ano fiable.',
    es: '{n} edificios con este año de construcción, {v} de ellos de vivienda. Desde 1900 hasta este año: {cum} de los {dated} que tienen un año fiable.',
  },
  build_speed_opt: { gl: 'Un ano cada {s} s', es: 'Un año cada {s} s' },
  build_curve: {
    gl: 'Edificios por ano de construción e uso',
    es: 'Edificios por año de construcción y uso',
  },
  build_curve_label: {
    gl: 'Edificios que existen hoxe por ano de construción, de {from} a {to}: máximo de {max} en {year}.',
    es: 'Edificios que existen hoy por año de construcción, de {from} a {to}: máximo de {max} en {year}.',
  },
  build_table_caption: {
    gl: '{n} edificios cun ano fiable desde 1900, por década e uso. Ademais, {before} anteriores a 1900 e {base} sen ano fiable.',
    es: '{n} edificios con un año fiable desde 1900, por década y uso. Además, {before} anteriores a 1900 y {base} sin año fiable.',
  },
  build_col_decade: { gl: 'Década', es: 'Década' },
  build_use_vivenda: { gl: 'Vivenda', es: 'Vivienda' },
  build_use_agrario: { gl: 'Agrario', es: 'Agrario' },
  build_use_industrial: { gl: 'Industria e almacén', es: 'Industria y almacén' },
  build_use_servizos: { gl: 'Servizos', es: 'Servicios' },
  build_use_outro: { gl: 'Outros', es: 'Otros' },
  build_use_base: {
    gl: 'Anterior a 1900 ou sen ano fiable',
    es: 'Anterior a 1900 o sin año fiable',
  },
  build_note: {
    gl: 'Edificios INSPIRE da Dirección General del Catastro. Un «edificio» é todo o construído sobre unha parcela catastral, e o seu ano é o da construción máis antiga da parcela, non o da última reforma. O Catastro só ten o que existe hoxe: os edificios derrubados non están, e un barrio renovado aparece como novo. Moitos anos antigos son estimacións redondas (por iso sobresaen 1940, 1950 ou 1960), e varios concellos enchen os edificios vellos sen data cun mesmo ano: eses anos de recheo, os anos posteriores á publicación e os edificios sen ano debúxanse en gris desde o comezo. O uso é o de maior superficie da parcela. Elaboración propia, con contas de edificios por cela de 250 metros: non é cartografía catastral.',
    es: 'Edificios INSPIRE de la Dirección General del Catastro. Un «edificio» es todo lo construido sobre una parcela catastral, y su año es el de la construcción más antigua de la parcela, no el de la última reforma. El Catastro solo tiene lo que existe hoy: los edificios derribados no están, y un barrio renovado aparece como nuevo. Muchos años antiguos son estimaciones redondas (por eso sobresalen 1940, 1950 o 1960), y varios ayuntamientos rellenan los edificios viejos sin fecha con un mismo año: esos años de relleno, los años posteriores a la publicación y los edificios sin año se dibujan en gris desde el comienzo. El uso es el de mayor superficie de la parcela. Elaboración propia, con recuentos de edificios por celda de 250 metros: no es cartografía catastral.',
  },
  build_fillers: {
    gl: 'Anos de recheo detectados ({n} concellos): {list}.',
    es: 'Años de relleno detectados ({n} ayuntamientos): {list}.',
  },
  build_missing: {
    gl: 'Aínda non están publicados os datos deste mapa.',
    es: 'Aún no están publicados los datos de este mapa.',
  },
  life_title: {
    gl: 'Nacer e morrer, concello a concello',
    es: 'Nacer y morir, ayuntamiento a ayuntamiento',
  },
  life_lede: {
    gl: 'Nacementos por cada 100 mortes en cada concello, ano a ano desde 1975. Por debaixo de 100 morre máis xente da que nace.',
    es: 'Nacimientos por cada 100 defunciones en cada ayuntamiento, año a año desde 1975. Por debajo de 100 muere más gente de la que nace.',
  },
  life_map_label: {
    gl: 'Mapa dos concellos de Galicia coloreados polos nacementos por cada 100 mortes de cada ano. As cifras están no panel e na táboa.',
    es: 'Mapa de los ayuntamientos de Galicia coloreados por los nacimientos por cada 100 defunciones de cada año. Las cifras están en el panel y en la tabla.',
  },
  life_legend: {
    gl: 'Nacementos por cada 100 mortes: marrón, máis mortes; branco, igual; verde, máis nacementos. Gris: sen dato (o concello aínda non existía).',
    es: 'Nacimientos por cada 100 defunciones: marrón, más defunciones; blanco, igual; verde, más nacimientos. Gris: sin dato (el ayuntamiento aún no existía).',
  },
  life_now: {
    gl: 'Galicia: {births} nacementos e {deaths} mortes (saldo {balance}). Concellos con máis nacementos ca mortes: {positive}.',
    es: 'Galicia: {births} nacimientos y {deaths} defunciones (saldo {balance}). Ayuntamientos con más nacimientos que defunciones: {positive}.',
  },
  life_detail: {
    gl: '{name}, {when}: {births} nacementos e {deaths} mortes, {value} nacementos por cada 100 mortes.',
    es: '{name}, {when}: {births} nacimientos y {deaths} defunciones, {value} nacimientos por cada 100 defunciones.',
  },
  life_pick: {
    gl: 'Preme nun concello para ver as súas cifras.',
    es: 'Pulsa en un ayuntamiento para ver sus cifras.',
  },
  life_speed_opt: { gl: 'Un ano cada {s} s', es: 'Un año cada {s} s' },
  life_curve: { gl: 'Nacementos en Galicia cada ano', es: 'Nacimientos en Galicia cada año' },
  life_curve_label: {
    gl: 'Nacementos en Galicia: {first} en {firstWhen}, {last} en {lastWhen}; máximo de {max} en {maxWhen}.',
    es: 'Nacimientos en Galicia: {first} en {firstWhen}, {last} en {lastWhen}; máximo de {max} en {maxWhen}.',
  },
  life_table_caption: {
    gl: 'Os 15 concellos con máis e menos nacementos por cada 100 mortes en {when}.',
    es: 'Los 15 ayuntamientos con más y menos nacimientos por cada 100 defunciones en {when}.',
  },
  life_col_a: { gl: 'Nacementos', es: 'Nacimientos' },
  life_col_b: { gl: 'Mortes', es: 'Defunciones' },
  life_col_value: { gl: 'Por 100 mortes', es: 'Por 100 defunciones' },
  life_note: {
    gl: 'Movemento natural da poboación (IGE, INE), táboas 57 e 30 do IGE: nacementos segundo o concello de residencia da nai e defuncións segundo o concello de residencia, non onde ocorren. O último ano é provisional. Sobre os 313 concellos de hoxe: Oza dos Ríos e Cesuras suman en Oza-Cesuras e Cerdedo e Cotobade en Cerdedo-Cotobade antes da fusión; Cariño (1988), Burela (1995) e A Illa de Arousa (1997) non teñen dato antes de existir e os concellos dos que saíron inclúen esa poboación ata entón. O dato de Laxe en 1981 e 1982 é dubidoso na fonte. A relación nacementos por cada 100 mortes é cálculo propio; nos concellos pequenos un ano pode cambiar moito por poucos casos.',
    es: 'Movimiento natural de la población (IGE, INE), tablas 57 y 30 del IGE: nacimientos según el ayuntamiento de residencia de la madre y defunciones según el ayuntamiento de residencia, no donde ocurren. El último año es provisional. Sobre los 313 ayuntamientos de hoy: Oza dos Ríos y Cesuras suman en Oza-Cesuras y Cerdedo y Cotobade en Cerdedo-Cotobade antes de la fusión; Cariño (1988), Burela (1995) y A Illa de Arousa (1997) no tienen dato antes de existir y los ayuntamientos de los que salieron incluyen esa población hasta entonces. El dato de Laxe en 1981 y 1982 es dudoso en la fuente. La relación nacimientos por cada 100 defunciones es cálculo propio; en los ayuntamientos pequeños un año puede cambiar mucho por pocos casos.',
  },
  life_missing: {
    gl: 'Aínda non están publicados os nacementos e as mortes por concello.',
    es: 'Aún no están publicados los nacimientos y las defunciones por ayuntamiento.',
  },
  flats_title: { gl: 'Pisos turísticos, mes a mes', es: 'Pisos turísticos, mes a mes' },
  flats_lede: {
    gl: 'As vivendas de uso turístico inscritas en cada concello desde 2017, por cada 1.000 habitantes.',
    es: 'Las viviendas de uso turístico inscritas en cada ayuntamiento desde 2017, por cada 1.000 habitantes.',
  },
  flats_map_label: {
    gl: 'Mapa dos concellos de Galicia coloreados polas vivendas de uso turístico por cada 1.000 habitantes de cada mes. As cifras están no panel e na táboa.',
    es: 'Mapa de los ayuntamientos de Galicia coloreados por las viviendas de uso turístico por cada 1.000 habitantes de cada mes. Las cifras están en el panel y en la tabla.',
  },
  flats_legend: {
    gl: 'Vivendas de uso turístico por cada 1.000 habitantes (censo de 2021). Son inscricións no rexistro, non vivendas alugadas.',
    es: 'Viviendas de uso turístico por cada 1.000 habitantes (censo de 2021). Son inscripciones en el registro, no viviendas alquiladas.',
  },
  flats_now: {
    gl: 'Galicia: {flats} vivendas de uso turístico ({places} prazas) en {with} concellos.',
    es: 'Galicia: {flats} viviendas de uso turístico ({places} plazas) en {with} ayuntamientos.',
  },
  flats_detail: {
    gl: '{name}, {when}: {flats} vivendas de uso turístico, {places} prazas, {value} por cada 1.000 habitantes.',
    es: '{name}, {when}: {flats} viviendas de uso turístico, {places} plazas, {value} por cada 1.000 habitantes.',
  },
  flats_pick: {
    gl: 'Preme nun concello para ver as súas cifras.',
    es: 'Pulsa en un ayuntamiento para ver sus cifras.',
  },
  flats_speed_opt: { gl: 'Un mes cada {s} s', es: 'Un mes cada {s} s' },
  flats_curve: {
    gl: 'Vivendas de uso turístico en Galicia',
    es: 'Viviendas de uso turístico en Galicia',
  },
  flats_curve_label: {
    gl: 'Vivendas de uso turístico en Galicia: {first} en {firstWhen}, {last} en {lastWhen}; máximo de {max} en {maxWhen}.',
    es: 'Viviendas de uso turístico en Galicia: {first} en {firstWhen}, {last} en {lastWhen}; máximo de {max} en {maxWhen}.',
  },
  flats_table_caption: {
    gl: 'Os 15 concellos con máis e menos vivendas de uso turístico por habitante en {when}.',
    es: 'Los 15 ayuntamientos con más y menos viviendas de uso turístico por habitante en {when}.',
  },
  flats_col_a: { gl: 'VUT', es: 'VUT' },
  flats_col_b: { gl: 'Prazas', es: 'Plazas' },
  flats_col_value: { gl: 'Por 1.000 hab.', es: 'Por 1.000 hab.' },
  flats_note: {
    gl: 'Serie mensual do Rexistro de Empresas e Actividades Turísticas (REAT) de Turismo de Galicia: as vivendas de uso turístico inscritas cada mes en cada concello, desde xuño de 2017. É o stock de cada mes, así que conta tamén as que despois deron de baixa mentres estiveron inscritas. Unha inscrición non di se a vivenda se aluga nin cantos días. O tipo «vivendas turísticas», outro do rexistro, non se suma. A taxa por 1.000 habitantes usa a poboación do censo de 2021 (INE) para todos os meses: é cálculo propio.',
    es: 'Serie mensual del Registro de Empresas y Actividades Turísticas (REAT) de Turismo de Galicia: las viviendas de uso turístico inscritas cada mes en cada ayuntamiento, desde junio de 2017. Es el stock de cada mes, así que cuenta también las que después se dieron de baja mientras estuvieron inscritas. Una inscripción no dice si la vivienda se alquila ni cuántos días. El tipo «viviendas turísticas», otro del registro, no se suma. La tasa por 1.000 habitantes usa la población del censo de 2021 (INE) para todos los meses: es cálculo propio.',
  },
  flats_missing: {
    gl: 'Aínda non está publicada a serie mensual de vivendas de uso turístico.',
    es: 'Aún no está publicada la serie mensual de viviendas de uso turístico.',
  },
  school_title: { gl: 'Escolas abertas e pechadas', es: 'Escuelas abiertas y cerradas' },
  school_lede: {
    gl: 'Os centros de ensino de cada concello ano a ano desde 2005, contra os que tiña ese ano.',
    es: 'Los centros de enseñanza de cada ayuntamiento año a año desde 2005, frente a los que tenía ese año.',
  },
  school_map_label: {
    gl: 'Mapa dos concellos de Galicia coloreados pola diferenza de centros de ensino con 2005. As cifras están no panel e na táboa.',
    es: 'Mapa de los ayuntamientos de Galicia coloreados por la diferencia de centros de enseñanza con 2005. Las cifras están en el panel y en la tabla.',
  },
  school_legend: {
    gl: 'Centros de diferenza con 2005: marrón, menos; branco, os mesmos; verde, máis. Negro: o concello non ten ningún centro.',
    es: 'Centros de diferencia con 2005: marrón, menos; blanco, los mismos; verde, más. Negro: el ayuntamiento no tiene ningún centro.',
  },
  school_now: {
    gl: 'Galicia: {schools} centros ({first} en 2005). {fewer} concellos teñen menos ca en 2005 e {none} non teñen ningún.',
    es: 'Galicia: {schools} centros ({first} en 2005). {fewer} ayuntamientos tienen menos que en 2005 y {none} no tienen ninguno.',
  },
  school_detail: {
    gl: '{name}, {when}: {schools} centros ({first} en 2005).',
    es: '{name}, {when}: {schools} centros ({first} en 2005).',
  },
  school_pick: {
    gl: 'Preme nun concello para ver as súas cifras.',
    es: 'Pulsa en un ayuntamiento para ver sus cifras.',
  },
  school_speed_opt: { gl: 'Un ano cada {s} s', es: 'Un año cada {s} s' },
  school_curve: { gl: 'Centros de ensino en Galicia', es: 'Centros de enseñanza en Galicia' },
  school_curve_label: {
    gl: 'Centros de ensino en Galicia: {first} en {firstWhen}, {last} en {lastWhen}.',
    es: 'Centros de enseñanza en Galicia: {first} en {firstWhen}, {last} en {lastWhen}.',
  },
  school_table_caption: {
    gl: 'Os concellos que máis centros gañaron e perderon desde 2005, en {when}.',
    es: 'Los ayuntamientos que más centros ganaron y perdieron desde 2005, en {when}.',
  },
  school_col_a: { gl: '2005', es: '2005' },
  school_col_b: { gl: 'Centros', es: 'Centros' },
  school_col_value: { gl: 'Diferenza', es: 'Diferencia' },
  school_note: {
    gl: 'IGE, táboa 1653: centros de ensino non universitario de réxime xeral por concello, públicos e privados, desde 2005 (non hai serie por concello anterior). Só o total: os tipos de ensinanza cambian de contido sen nota. É un reconto por ano, non a lista das escolas que abriron ou pecharon, e un centro rural agrupado (CRA) conta como un centro aínda que teña varias escolas; por iso non se ven os peches de escolas unitarias anteriores a 2005. Quedan fóra conservatorios, escolas de idiomas e de artes. Oza-Cesuras e Cerdedo-Cotobade suman os concellos de antes da fusión. A diferenza con 2005 é cálculo propio.',
    es: 'IGE, tabla 1653: centros de enseñanza no universitaria de régimen general por ayuntamiento, públicos y privados, desde 2005 (no hay serie por ayuntamiento anterior). Solo el total: los tipos de enseñanza cambian de contenido sin nota. Es un recuento por año, no la lista de las escuelas que abrieron o cerraron, y un centro rural agrupado (CRA) cuenta como un centro aunque tenga varias escuelas; por eso no se ven los cierres de escuelas unitarias anteriores a 2005. Quedan fuera conservatorios, escuelas de idiomas y de artes. Oza-Cesuras y Cerdedo-Cotobade suman los ayuntamientos de antes de la fusión. La diferencia con 2005 es cálculo propio.',
  },
  school_missing: {
    gl: 'Aínda non están publicados os centros de ensino por concello.',
    es: 'Aún no están publicados los centros de enseñanza por ayuntamiento.',
  },
  wiki_title: { gl: 'Atención en Wikipedia', es: 'Atención en Wikipedia' },
  wiki_lede: {
    gl: 'Cantas veces se abriu o artigo de cada concello na Wikipedia en galego e en castelán, sumadas día a día ao longo do último ano.',
    es: 'Cuántas veces se abrió el artículo de cada ayuntamiento en la Wikipedia en gallego y en castellano, sumadas día a día a lo largo del último año.',
  },
  wiki_map_label: {
    gl: 'Mapa dos concellos de Galicia coloreados polas vistas acumuladas do seu artigo na Wikipedia por cada 1.000 habitantes, desde o primeiro día ata o día mostrado. As cifras están no panel e na táboa.',
    es: 'Mapa de los ayuntamientos de Galicia coloreados por las visitas acumuladas de su artículo en la Wikipedia por cada 1.000 habitantes, desde el primer día hasta el día mostrado. Las cifras están en el panel y en la tabla.',
  },
  wiki_legend: {
    gl: 'Vistas acumuladas por cada 1.000 habitantes desde o primeiro día: escuro, poucas; laranxa e claro, moitas.',
    es: 'Visitas acumuladas por cada 1.000 habitantes desde el primer día: oscuro, pocas; naranja y claro, muchas.',
  },
  wiki_now: {
    gl: 'Galicia: {total} vistas acumuladas; {views} ese día.',
    es: 'Galicia: {total} visitas acumuladas; {views} ese día.',
  },
  wiki_detail: {
    gl: '{name}, ata o {when}: {total} vistas acumuladas, {value} por cada 1.000 habitantes; {views} ese día.',
    es: '{name}, hasta el {when}: {total} visitas acumuladas, {value} por cada 1.000 habitantes; {views} ese día.',
  },
  wiki_pick: {
    gl: 'Preme nun concello para ver as súas cifras.',
    es: 'Pulsa en un ayuntamiento para ver sus cifras.',
  },
  wiki_speed_opt: { gl: 'Un día cada {s} s', es: 'Un día cada {s} s' },
  wiki_curve: {
    gl: 'Vistas acumuladas dos artigos dos 313 concellos',
    es: 'Visitas acumuladas de los artículos de los 313 ayuntamientos',
  },
  wiki_curve_label: {
    gl: 'Vistas acumuladas dos artigos dos concellos: {first} o {firstWhen}, {last} o {lastWhen}.',
    es: 'Visitas acumuladas de los artículos de los ayuntamientos: {first} el {firstWhen}, {last} el {lastWhen}.',
  },
  wiki_table_caption: {
    gl: 'Os 15 concellos con máis e con menos vistas acumuladas por habitante ata o {when}.',
    es: 'Los 15 ayuntamientos con más y con menos visitas acumuladas por habitante hasta el {when}.',
  },
  wiki_col_a: {
    gl: 'Vistas ese día',
    es: 'Visitas ese día',
  },
  wiki_col_b: {
    gl: 'Acumuladas',
    es: 'Acumuladas',
  },
  wiki_col_value: {
    gl: 'Por 1.000 hab.',
    es: 'Por 1.000 hab.',
  },
  wiki_note: {
    gl: 'Vistas de páxina da Wikimedia Foundation (CC0): as veces que alguén abriu o artigo do concello na Wikipedia en galego ou en castelán, sen os bots que Wikimedia detecta. Non di quen le nin desde onde: unha vista pode ser de calquera parte do mundo e unha persoa pode contar varias veces. Sobe con festas, sucesos, eleccións, lumes, partidos ou unha noticia que enlaza a páxina; tamén cando cambia a portada da Wikipedia ou un buscador. Algúns picos dun só día con centos de vistas nun concello pequeno son, seguramente, programas automáticos que Wikimedia non distinguiu dunha persoa. Conta só o título principal de cada artigo (as redireccións non), lido de Wikidata polo código INE. O mapa suma as vistas día a día desde o primeiro día da serie; as vistas por 1.000 habitantes usan o censo de 2021 (INE) e son cálculo propio. O último día é o de onte.',
    es: 'Visitas de página de la Wikimedia Foundation (CC0): las veces que alguien abrió el artículo del ayuntamiento en la Wikipedia en gallego o en castellano, sin los bots que Wikimedia detecta. No dice quién lee ni desde dónde: una visita puede ser de cualquier parte del mundo y una persona puede contar varias veces. Sube con fiestas, sucesos, elecciones, incendios, partidos o una noticia que enlaza la página; también cuando cambia la portada de la Wikipedia o un buscador. Algunos picos de un solo día con cientos de visitas en un ayuntamiento pequeño son, seguramente, programas automáticos que Wikimedia no distinguió de una persona. Cuenta solo el título principal de cada artículo (las redirecciones no), leído de Wikidata por el código INE. El mapa suma las visitas día a día desde el primer día de la serie; las visitas por 1.000 habitantes usan el censo de 2021 (INE) y son cálculo propio. El último día es el de ayer.',
  },
  wiki_missing: {
    gl: 'Aínda non están publicadas as vistas dos artigos dos concellos.',
    es: 'Aún no están publicadas las visitas de los artículos de los ayuntamientos.',
  },
  news_title: { gl: 'Os concellos nas noticias', es: 'Los ayuntamientos en las noticias' },
  news_lede: {
    gl: 'Cantos artigos de medios dixitais con sede en España nomean cada concello, día a día, segundo o GDELT.',
    es: 'Cuántos artículos de medios digitales con sede en España nombran cada ayuntamiento, día a día, según GDELT.',
  },
  news_map_label: {
    gl: 'Mapa dos concellos de Galicia coloreados polos artigos de prensa que os nomean nos últimos 7 días. As cifras están no panel e na táboa.',
    es: 'Mapa de los ayuntamientos de Galicia coloreados por los artículos de prensa que los nombran en los últimos 7 días. Las cifras están en el panel y en la tabla.',
  },
  news_legend: {
    gl: 'Artigos que nomean o concello nos 7 días ata a data. Gris escuro: sen dato ou concello fóra do mapa por ter un nome ambiguo.',
    es: 'Artículos que nombran el ayuntamiento en los 7 días hasta la fecha. Gris oscuro: sin dato o ayuntamiento fuera del mapa por tener un nombre ambiguo.',
  },
  news_now: {
    gl: 'Galicia: {articles} artigos nos concellos do mapa; {with} concellos con algún na semana; ton medio {tone} (de −10, negativo, a +10, positivo).',
    es: 'Galicia: {articles} artículos en los ayuntamientos del mapa; {with} ayuntamientos con alguno en la semana; tono medio {tone} (de −10, negativo, a +10, positivo).',
  },
  news_detail: {
    gl: '{name}, {when}: {articles} artigos ese día, {value} nos últimos 7; ton {tone} (só con 5 artigos ou máis).',
    es: '{name}, {when}: {articles} artículos ese día, {value} en los últimos 7; tono {tone} (solo con 5 artículos o más).',
  },
  news_detail_excluded: {
    gl: '{name} non está no mapa: o seu nome tamén é unha palabra común, un apelido ou outro lugar, e os artigos contados non serían del.',
    es: '{name} no está en el mapa: su nombre también es una palabra común, un apellido u otro lugar, y los artículos contados no serían suyos.',
  },
  news_pick: {
    gl: 'Preme nun concello para ver as súas cifras.',
    es: 'Pulsa en un ayuntamiento para ver sus cifras.',
  },
  news_speed_opt: { gl: 'Un día cada {s} s', es: 'Un día cada {s} s' },
  news_curve: {
    gl: 'Artigos que nomean concellos galegos, cada día',
    es: 'Artículos que nombran ayuntamientos gallegos, cada día',
  },
  news_curve_label: {
    gl: 'Artigos diarios que nomean os concellos do mapa: {first} o {firstWhen}, {last} o {lastWhen}; máximo de {max} o {maxWhen}.',
    es: 'Artículos diarios que nombran los ayuntamientos del mapa: {first} el {firstWhen}, {last} el {lastWhen}; máximo de {max} el {maxWhen}.',
  },
  news_table_caption: {
    gl: 'Os 15 concellos con máis e menos artigos nos 7 días ata o {when}.',
    es: 'Los 15 ayuntamientos con más y menos artículos en los 7 días hasta el {when}.',
  },
  news_col_a: { gl: 'Artigos (día)', es: 'Artículos (día)' },
  news_col_b: { gl: 'Ton', es: 'Tono' },
  news_col_value: { gl: '7 días', es: '7 días' },
  news_note: {
    gl: 'The GDELT Project (gdeltproject.org) le medios dixitais de todo o mundo e conta os artigos que conteñen unhas palabras. Aquí: medios con sede en España e unha consulta por concello, o nome oficial entre comiñas, revisada á man. Quedan fóra os concellos cun nome que tamén é palabra común, apelido frecuente ou outro lugar (Mos, Ares, Cangas, Marín, Carballo, Sarria...); a lista e o motivo de cada un están nos datos. Nas catro capitais o nome conta tamén a provincia. Un artigo pode nomear o concello de pasada, e GDELT non ve todos os medios galegos (sobre todo os que escriben en galego). Os días en que o propio GDELT case non recolleu nada quedan sen dato, non a cero. O ton é a media que calcula GDELT a partir das palabras do artigo, de −10 a +10, e só se amosa con 5 artigos ou máis nun día. Non se garda ningún titular nin ligazón. GDELT só garante uns meses de histórico, así que esta páxina garda o seu desde o 1 de novembro de 2026 e o ano anterior vén da primeira descarga. Suma de 7 días e ton de Galicia: cálculo propio.',
    es: 'The GDELT Project (gdeltproject.org) lee medios digitales de todo el mundo y cuenta los artículos que contienen unas palabras. Aquí: medios con sede en España y una consulta por ayuntamiento, el nombre oficial entre comillas, revisada a mano. Quedan fuera los ayuntamientos con un nombre que también es palabra común, apellido frecuente u otro lugar (Mos, Ares, Cangas, Marín, Carballo, Sarria...); la lista y el motivo de cada uno están en los datos. En las cuatro capitales el nombre cuenta también la provincia. Un artículo puede nombrar el ayuntamiento de pasada, y GDELT no ve todos los medios gallegos (sobre todo los que escriben en gallego). Los días en que el propio GDELT casi no recogió nada quedan sin dato, no a cero. El tono es la media que calcula GDELT a partir de las palabras del artículo, de −10 a +10, y solo se muestra con 5 artículos o más en un día. No se guarda ningún titular ni enlace. GDELT solo garantiza unos meses de histórico, así que esta página guarda el suyo desde el 1 de noviembre de 2026 y el año anterior viene de la primera descarga. Suma de 7 días y tono de Galicia: cálculo propio.',
  },
  news_missing: {
    gl: 'Aínda non están publicados os artigos por concello.',
    es: 'Aún no están publicados los artículos por ayuntamiento.',
  },
  air_title: { gl: 'O aire hora a hora', es: 'El aire hora a hora' },
  air_lede: {
    gl: 'As estacións da Rede de Calidade do Aire de Galicia nas últimas 24 horas: o índice de calidade do aire de cada unha e o contaminante que o marca.',
    es: 'Las estaciones de la Red de Calidad del Aire de Galicia en las últimas 24 horas: el índice de calidad del aire de cada una y el contaminante que lo marca.',
  },
  air_map_label: {
    gl: 'Mapa de Galicia coas estacións de calidade do aire coloreadas polo seu índice. As cifras están no panel e na táboa.',
    es: 'Mapa de Galicia con las estaciones de calidad del aire coloreadas por su índice. Las cifras están en el panel y en la tabla.',
  },
  air_band_boa: { gl: 'Boa', es: 'Buena' },
  air_band_favorable: { gl: 'Favorable', es: 'Favorable' },
  air_band_regular: { gl: 'Regular', es: 'Regular' },
  air_band_mala: { gl: 'Mala', es: 'Mala' },
  air_band_moi_mala: { gl: 'Moi mala', es: 'Muy mala' },
  air_band_pesima: { gl: 'Pésima', es: 'Pésima' },
  air_now: {
    gl: 'Estacións con dato: {n}. Boas ou favorables: {good}; regulares ou peores: {bad}. Peor índice: {worst} ({pollutant}).',
    es: 'Estaciones con dato: {n}. Buenas o favorables: {good}; regulares o peores: {bad}. Peor índice: {worst} ({pollutant}).',
  },
  air_legend: {
    gl: 'Cada punto é unha estación; a cor é a categoría do índice e o tamaño crece con el. As estacións con aire regular ou peor levan o nome e o contaminante que o marca.',
    es: 'Cada punto es una estación; el color es la categoría del índice y el tamaño crece con él. Las estaciones con aire regular o peor llevan el nombre y el contaminante que lo marca.',
  },
  air_curve: {
    gl: 'Estacións en cada categoría, hora a hora',
    es: 'Estaciones en cada categoría, hora a hora',
  },
  air_curve_label: {
    gl: 'Estacións por categoría de calidade do aire nas últimas 24 horas. Máximo de estacións regulares ou peores nunha hora: {bad}, ás {hour}.',
    es: 'Estaciones por categoría de calidad del aire en las últimas 24 horas. Máximo de estaciones regulares o peores en una hora: {bad}, a las {hour}.',
  },
  air_table_caption: {
    gl: 'Estacións por categoría cada hora ({n} estacións).',
    es: 'Estaciones por categoría cada hora ({n} estaciones).',
  },
  air_col_worse: { gl: 'Mala ou peor', es: 'Mala o peor' },
  air_col_worst: { gl: 'Peor estación', es: 'Peor estación' },
  air_period: {
    gl: 'As 24 horas ata a última medida: as {hour} do {date}. Actualízase cada hora.',
    es: 'Las 24 horas hasta la última medida: las {hour} del {date}. Se actualiza cada hora.',
  },
  air_note: {
    gl: 'Rede de Calidade do Aire de Galicia (MeteoGalicia): índice de calidade do aire (ICA) de cada estación nas últimas 24 horas, coa escala de MeteoGalicia (0–1 boa, 1–2 favorable, 2–3 regular, 3–4 mala, 4–5 moi mala, 5–6 pésima), e o contaminante que marca o índice. Son datos en tempo real sen validar: poden cambiar despois da revisión. As estacións industriais miden preto de fábricas e centrais; un valor alto nelas describe ese punto, non a vila enteira. Horas en hora oficial de Galicia.',
    es: 'Red de Calidad del Aire de Galicia (MeteoGalicia): índice de calidad del aire (ICA) de cada estación en las últimas 24 horas, con la escala de MeteoGalicia (0–1 buena, 1–2 favorable, 2–3 regular, 3–4 mala, 4–5 muy mala, 5–6 pésima), y el contaminante que marca el índice. Son datos en tiempo real sin validar: pueden cambiar tras la revisión. Las estaciones industriales miden cerca de fábricas y centrales; un valor alto en ellas describe ese punto, no el pueblo entero. Horas en hora oficial de Galicia.',
  },
  air_missing: {
    gl: 'Aínda non están publicados os datos de calidade do aire.',
    es: 'Aún no están publicados los datos de calidad del aire.',
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
