// Nursery schools and other childcare centres (Consellería de Política Social, RUEPSS;
// dataset 0298 on abertos.xunta.gal). One KML (~1.7 MB, 575 placemarks) with the same layout
// as centros_maiores.kml, so the text and privacy helpers of that layer are reused.
// publishedAt is the Last-Modified header.
//
// Privacy: e-mails (Mail, Correo; many are personal Gmail addresses of small private
// centres), phone, timetable and facilities are not published. The owner (Entidade) is kept
// only when it reads as an organisation; about a third of the private nurseries are owned by
// natural persons, whose names are dropped.

import { type Adapter, type Feature, inGalicia, point } from '../../lib/adapter.ts';
import {
  entidade,
  httpDateToIso,
  PAD,
  ruepssLink,
  shortServizos,
  text,
} from '../centros-maiores/adapter.ts';
import { lookupConcello } from '../centros-saude/sergas.ts';

export const URL = 'https://ficheiros-web.xunta.gal/abertos/servizos_sociais/centros_infancia.kml';

/** Centre type (KML description) → label; values seen on 2026-11-01. */
export const TIPO: Record<string, string> = {
  'ESCOLA INFANTIL': 'Escola infantil',
  'PUNTOS DE ATENCIÓN Á INFANCIA (PAI)': 'Punto de atención á infancia (PAI)',
  LUDOTECA: 'Ludoteca',
  'ESPAZO INFANTIL': 'Espazo infantil',
};

const INICIATIVA: Record<string, 'publica' | 'privada' | 'social'> = {
  'INICIATIVA PÚBLICA': 'publica',
  'INICIATIVA SOCIAL': 'social',
  'INICIATIVA PRIVADA CON ÁNIMO DE LUCRO': 'privada',
};

function dataValues(pm: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<Data name="([^"]+)">([\s\S]*?)<\/Data>/g;
  for (let m = re.exec(pm); m; m = re.exec(pm)) {
    const v = /<value>([\s\S]*?)<\/value>/.exec(m[2] ?? '');
    out[m[1] as string] = v?.[1] ?? '';
  }
  return out;
}

export interface ParseStats {
  placemarks: number;
  dropped: number;
  ownerHidden: number;
}

export function toFeatures(kml: string): { features: Feature[]; stats: ParseStats } {
  if (!/<kml[\s>]/.test(kml)) throw new Error('Not a KML document');
  const features: Feature[] = [];
  const stats: ParseStats = { placemarks: 0, dropped: 0, ownerHidden: 0 };
  const re = /<Placemark id="([^"]+)">([\s\S]*?)<\/Placemark>/g;
  for (let m = re.exec(kml); m; m = re.exec(kml)) {
    stats.placemarks++;
    const id = m[1] as string;
    const pm = m[2] as string;
    const name = text(/<name>([\s\S]*?)<\/name>/.exec(pm)?.[1]);
    const desc = text(/<description>([\s\S]*?)<\/description>/.exec(pm)?.[1]);
    const coords = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm)?.[1]?.trim().split(',');
    const lon = Number(coords?.[0]);
    const lat = Number(coords?.[1]);
    if (!name) throw new Error(`Placemark ${id} without name`);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !inGalicia(lon, lat, PAD)) {
      stats.dropped++;
      continue;
    }
    const d = dataValues(pm);
    const ini = text(d.Iniciativa_entidade);
    const iniciativa = INICIATIVA[ini.toUpperCase()];
    if (!iniciativa) throw new Error(`Unexpected Iniciativa_entidade "${ini}" in ${id}`);
    const owner = entidade(d.Entidade ?? '');
    if (owner === null && text(d.Entidade)) stats.ownerHidden++;
    const cp = text(d.CodigoPostal);
    const concelloRaw = text(d.Concello);
    const hit = lookupConcello(concelloRaw);
    features.push({
      type: 'Feature',
      id,
      geometry: point(lon, lat),
      properties: {
        id,
        nome: name,
        tipo: TIPO[desc.toUpperCase()] ?? desc,
        iniciativa,
        entidade: owner,
        concello: hit?.nome ?? concelloRaw,
        codigo_ine: hit?.ine ?? null,
        enderezo: text(d.Enderezo),
        cp: /^\d{5}$/.test(cp) ? cp : null,
        servizos: shortServizos(d.Servizos ?? ''),
        ligazon_ruepss: ruepssLink(d.Web ?? ''),
      },
    });
  }
  return { features, stats };
}

export interface Raw {
  kml: string;
  lastModified: string | null;
}

/** Stats of the last normalize call, for tests and logging. */
export let lastStats: ParseStats | null = null;

const adapter = {
  async fetch(ctx) {
    const res = await ctx.get(URL);
    return {
      kml: res.body.toString('utf8'),
      lastModified: res.lastModified ?? res.headers?.['last-modified'] ?? null,
    };
  },

  normalize(raw, _ctx) {
    const { features, stats } = toFeatures(raw.kml);
    lastStats = stats;
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: httpDateToIso(raw.lastModified),
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
