// The pulse series: animated maps of one day (or one month, one year) of Galicia, one clock
// each. The /pulso/ index lists them in this order; a map without `ready` is shown as coming.

import type { Lang } from '../i18n.ts';

export interface PulseMap {
  slug: string;
  ready: boolean;
  /** Accent of the card, from the colours each map uses. */
  colour: string;
  title: Record<Lang, string>;
  summary: Record<Lang, string>;
  period: Record<Lang, string>;
}

export const SERIES: PulseMap[] = [
  {
    slug: 'transporte',
    ready: true,
    colour: '#ffc94d',
    title: { gl: 'Transporte público', es: 'Transporte público' },
    summary: {
      gl: 'Todos os trens e autobuses dun día, segundo os horarios oficiais.',
      es: 'Todos los trenes y autobuses de un día, según los horarios oficiales.',
    },
    period: {
      gl: 'Un mércores e un domingo; renóvase cada día',
      es: 'Un miércoles y un domingo; se renueva cada día',
    },
  },
  {
    slug: 'cidades',
    ready: true,
    colour: '#ffc94d',
    title: { gl: 'As sete cidades', es: 'Las siete ciudades' },
    summary: {
      gl: 'Viaxes que entran e saen de cada cidade hora a hora, en % dos seus residentes.',
      es: 'Viajes que entran y salen de cada ciudad hora a hora, en % de sus residentes.',
    },
    period: {
      gl: 'Mércores e domingo medios, maio de 2025',
      es: 'Miércoles y domingo medios, mayo de 2025',
    },
  },
  {
    slug: 'movemento',
    ready: true,
    colour: '#5fd3f3',
    title: { gl: 'Galicia en movemento', es: 'Galicia en movimiento' },
    summary: {
      gl: 'As viaxes entre concellos ao longo do día, de onde saen e cara a onde van.',
      es: 'Los viajes entre ayuntamientos a lo largo del día, de dónde salen y hacia dónde van.',
    },
    period: {
      gl: 'Mércores e domingo medios, maio de 2025',
      es: 'Miércoles y domingo medios, mayo de 2025',
    },
  },
  {
    slug: 'tempo',
    ready: true,
    colour: '#8fb8ff',
    title: { gl: 'O tempo hora a hora', es: 'El tiempo hora a hora' },
    summary: {
      gl: 'Temperatura, choiva e vento nas 155 estacións de MeteoGalicia.',
      es: 'Temperatura, lluvia y viento en las 155 estaciones de MeteoGalicia.',
    },
    period: {
      gl: 'Mércores 21 de maio de 2025 ou as últimas 24 horas',
      es: 'Miércoles 21 de mayo de 2025 o las últimas 24 horas',
    },
  },
  {
    slug: 'sol',
    ready: true,
    colour: '#ffd36b',
    title: { gl: 'O día e a noite', es: 'El día y la noche' },
    summary: {
      gl: 'A noite e os crepúsculos cruzando Galicia, e a hora en que amence en cada concello.',
      es: 'La noche y los crepúsculos cruzando Galicia, y la hora en que amanece en cada ayuntamiento.',
    },
    period: { gl: 'Calquera día', es: 'Cualquier día' },
  },
  {
    slug: 'lostregos',
    ready: true,
    colour: '#c9dcff',
    title: { gl: 'Lóstregos', es: 'Rayos' },
    summary: {
      gl: 'Cada raio sobre Galicia no último ano, á súa hora, tormenta a tormenta.',
      es: 'Cada rayo sobre Galicia en el último año, a su hora, tormenta a tormenta.',
    },
    period: {
      gl: 'Últimos doce meses; renóvase cada mes',
      es: 'Últimos doce meses; se renueva cada mes',
    },
  },
  {
    slug: 'aire',
    ready: true,
    colour: '#50ccaa',
    title: { gl: 'O aire hora a hora', es: 'El aire hora a hora' },
    summary: {
      gl: 'O índice de calidade do aire de cada estación e o contaminante que o marca.',
      es: 'El índice de calidad del aire de cada estación y el contaminante que lo marca.',
    },
    period: {
      gl: 'Últimas 24 horas; renóvase cada hora',
      es: 'Últimas 24 horas; se renueva cada hora',
    },
  },
  {
    slug: 'lume',
    ready: true,
    colour: '#ff7a3d',
    title: { gl: 'Focos de calor', es: 'Focos de calor' },
    summary: {
      gl: 'O que viron os satélites, pasada a pasada, no mes dos grandes lumes.',
      es: 'Lo que vieron los satélites, pasada a pasada, en el mes de los grandes incendios.',
    },
    period: { gl: 'Agosto de 2025', es: 'Agosto de 2025' },
  },
  {
    slug: 'lonxas',
    ready: true,
    colour: '#5fd3f3',
    title: { gl: 'O peixe das lonxas', es: 'El pescado de las lonjas' },
    summary: {
      gl: 'O que se vende cada día en cada lonxa, de peixe a marisco, ao ritmo da semana e das costeiras.',
      es: 'Lo que se vende cada día en cada lonja, del pescado al marisco, al ritmo de la semana y de las costeras.',
    },
    period: { gl: '2025, día a día', es: '2025, día a día' },
  },
  {
    slug: 'seculo',
    ready: true,
    colour: '#b2abd2',
    title: { gl: 'Un século de poboación', es: 'Un siglo de población' },
    summary: {
      gl: 'Os censos de 1900 a 2021 concello a concello: onde se foi a xente e onde se xuntou.',
      es: 'Los censos de 1900 a 2021 ayuntamiento a ayuntamiento: dónde se fue la gente y dónde se juntó.',
    },
    period: { gl: 'Censos de 1900 a 2021', es: 'Censos de 1900 a 2021' },
  },
  {
    slug: 'construcion',
    ready: true,
    colour: '#ffb35c',
    title: { gl: 'Como se construíu Galicia', es: 'Cómo se construyó Galicia' },
    summary: {
      gl: 'Os edificios de hoxe acendéndose no ano que consta no Catastro, coa cor do seu uso.',
      es: 'Los edificios de hoy encendiéndose en el año que consta en el Catastro, con el color de su uso.',
    },
    period: { gl: '1900–2026, ano a ano', es: '1900–2026, año a año' },
  },
  {
    slug: 'vida',
    ready: true,
    colour: '#a6dba0',
    title: { gl: 'Nacer e morrer', es: 'Nacer y morir' },
    summary: {
      gl: 'Nacementos por cada 100 mortes en cada concello, de 1975 a hoxe.',
      es: 'Nacimientos por cada 100 defunciones en cada ayuntamiento, de 1975 a hoy.',
    },
    period: { gl: '1975–2025, ano a ano', es: '1975–2025, año a año' },
  },
  {
    slug: 'escolas',
    ready: true,
    colour: '#fdb863',
    title: { gl: 'Escolas abertas e pechadas', es: 'Escuelas abiertas y cerradas' },
    summary: {
      gl: 'Os centros de ensino de cada concello ano a ano, contra os que tiña en 2005.',
      es: 'Los centros de enseñanza de cada ayuntamiento año a año, frente a los que tenía en 2005.',
    },
    period: { gl: '2005–2025, ano a ano', es: '2005–2025, año a año' },
  },
  {
    slug: 'pisos',
    ready: true,
    colour: '#f08a4b',
    title: { gl: 'Pisos turísticos', es: 'Pisos turísticos' },
    summary: {
      gl: 'As vivendas de uso turístico inscritas en cada concello, mes a mes desde 2017.',
      es: 'Las viviendas de uso turístico inscritas en cada ayuntamiento, mes a mes desde 2017.',
    },
    period: {
      gl: 'Desde xuño de 2017; renóvase cada mes',
      es: 'Desde junio de 2017; se renueva cada mes',
    },
  },
  {
    slug: 'estacion',
    ready: true,
    colour: '#b9e27a',
    title: { gl: 'Poboación estacional', es: 'Población estacional' },
    summary: {
      gl: 'Canta xente soporta cada concello trimestre a trimestre, contra os seus residentes.',
      es: 'Cuánta gente soporta cada ayuntamiento trimestre a trimestre, frente a sus residentes.',
    },
    period: {
      gl: '2025 provisional (dous trimestres) e 2024',
      es: '2025 provisional (dos trimestres) y 2024',
    },
  },
];
