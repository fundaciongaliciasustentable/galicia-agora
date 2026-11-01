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
