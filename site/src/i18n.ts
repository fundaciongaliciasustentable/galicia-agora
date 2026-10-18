// Interface strings. Galician at the root, Spanish under /es/.

export type Lang = 'gl' | 'es';

export const THEMES: Record<string, { gl: string; es: string }> = {
  'auga-mar': { gl: 'Auga e mar', es: 'Agua y mar' },
  'lume-monte': { gl: 'Lume e monte', es: 'Fuego y monte' },
  'tempo-aire': { gl: 'Tempo e aire', es: 'Tiempo y aire' },
  mobilidade: { gl: 'Mobilidade', es: 'Movilidad' },
  territorio: { gl: 'Territorio', es: 'Territorio' },
};

export const THEME_ORDER = ['auga-mar', 'lume-monte', 'tempo-aire', 'mobilidade', 'territorio'];

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
  collection_odbl: { gl: 'Base ODbL', es: 'Base ODbL' },
  collection_bysa: { gl: 'Colección CC BY-SA 4.0', es: 'Colección CC BY-SA 4.0' },
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
  return lang === 'gl' ? '/' : '/es/';
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
