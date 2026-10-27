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
  portrait_search: { gl: 'Concello', es: 'Ayuntamiento' },
  portrait_places: { gl: 'lugares', es: 'lugares' },
  portrait_lede: {
    gl: 'Cada punto é un dos {n} concellos. Baixa para percorrer os indicadores: os puntos deixan o mapa e ordénanse segundo o valor, co teu concello destacado. Toca un punto para cambiar de concello.',
    es: 'Cada punto es uno de los {n} ayuntamientos. Baja para recorrer los indicadores: los puntos dejan el mapa y se ordenan según el valor, con tu ayuntamiento destacado. Toca un punto para cambiar de ayuntamiento.',
  },
  portrait_canvas: {
    gl: 'Os concellos de Galicia como puntos. As cifras están no texto de cada indicador.',
    es: 'Los ayuntamientos de Galicia como puntos. Las cifras están en el texto de cada indicador.',
  },
  portrait_view: { gl: 'Vista', es: 'Vista' },
  portrait_strip: { gl: 'Distribución', es: 'Distribución' },
  portrait_map: { gl: 'Mapa', es: 'Mapa' },
  portrait_legend: {
    gl: 'Cor: distancia ao valor de Galicia (marrón por debaixo, azul por enriba), non mellor ou peor.',
    es: 'Color: distancia al valor de Galicia (marrón por debajo, azul por encima), no mejor o peor.',
  },
  portrait_log: { gl: 'escala logarítmica', es: 'escala logarítmica' },
  portrait_sqrt: { gl: 'escala de raíz cadrada', es: 'escala de raíz cuadrada' },
  portrait_no_data: { gl: 'sen dato', es: 'sin dato' },
  portrait_above: {
    gl: 'Valor máis alto ca no {pct} % dos concellos con dato.',
    es: 'Valor más alto que en el {pct} % de los ayuntamientos con dato.',
  },
  portrait_below: {
    gl: 'Valor máis baixo ca no {pct} % dos concellos con dato.',
    es: 'Valor más bajo que en el {pct} % de los ayuntamientos con dato.',
  },
  portrait_middle: {
    gl: 'Valor no medio dos concellos con dato.',
    es: 'Valor en el medio de los ayuntamientos con dato.',
  },
  portrait_sources: { gl: 'Fonte, licenza e atribución', es: 'Fuente, licencia y atribución' },
  portrait_how: { gl: 'Como se calcula', es: 'Cómo se calcula' },
  portrait_not_found: {
    gl: 'Non hai ningún concello con ese nome.',
    es: 'No hay ningún ayuntamiento con ese nombre.',
  },
  portrait_missing: {
    gl: 'Aínda non hai datos do perfil dos concellos.',
    es: 'Aún no hay datos del perfil de los ayuntamientos.',
  },
  pulse_nav: { gl: 'Pulso', es: 'Pulso' },
  pulse_title: { gl: 'O pulso de Galicia', es: 'El pulso de Galicia' },
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
