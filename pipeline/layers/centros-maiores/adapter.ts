// Centres for older people in Galicia (Consellería de Política Social, RUEPSS; dataset 0299).
// One KML file (~2.3 MB, 703 placemarks) with Last-Modified and ETag. publishedAt is the
// Last-Modified header: the file is regenerated monthly and carries no date of its own.
//
// Privacy: the e-mail fields (Mail, Correo) and the phone are not published. "Entidade" is
// the owner of the centre; for some small centres (mostly vivendas comunitarias) it is a
// natural person, so it is kept only when it reads as an organisation (legal form or an
// institutional keyword) and never when it contains an ID number (NIF/NIE).

import { type Adapter, type Feature, inGalicia, point } from '../../lib/adapter.ts';

export const URL = 'https://ficheiros-web.xunta.gal/abertos/servizos_sociais/centros_maiores.kml';

/** Centres just over a provincial border still belong to Galicia: small pad. */
export const PAD = 0.05;

/** Longest servizos string before it is cut at a list boundary. */
export const SERVIZOS_MAX = 160;

export const TIPO: Record<string, string> = {
  RESIDENCIA: 'Residencia',
  'GRAN CENTRO RESIDENCIAL': 'Gran centro residencial',
  MINIRESIDENCIA: 'Miniresidencia',
  'FOGAR RESIDENCIAL': 'Fogar residencial',
  'VIVENDA COMUNITARIA': 'Vivenda comunitaria',
  'APARTAMENTO TUTELADO': 'Apartamento tutelado',
  'CENTRO DE DÍA': 'Centro de día',
  'CENTRO DE DÍA, ALZHEIMER': 'Centro de día para persoas con alzhéimer',
  'FOGARES E CLUBES': 'Fogar ou club de maiores',
};

const INICIATIVA: Record<string, 'publica' | 'privada' | 'social'> = {
  'INICIATIVA PÚBLICA': 'publica',
  'INICIATIVA SOCIAL': 'social',
  'INICIATIVA PRIVADA CON ÁNIMO DE LUCRO': 'privada',
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decode XML entities and CDATA, collapse whitespace. */
export function text(s: string | undefined): string {
  if (s === undefined) return '';
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n =
          e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

// Spanish legal forms at the end of the name: SL, SLU, SLL, SLNE, SA, SAU, SC, S.Coop.
const LEGAL_FORM =
  /(?:\bS\.?\s?L\.?(?:\s?[UL]\.?|\s?N\.?\s?E\.?)?|\bS\.?\s?A\.?(?:\s?U\.?)?|\bS\.?\s?C\.?)\s*$/i;
const ORG_WORDS =
  /\b(?:SOCIEDAD|SOCIEDADE|COOP|COOPERATIVA|FUNDACI[OÓ]N|ASOCIACI[OÓ]N|CONCELLO|XUNTA|CONSORCIO|DEPUTACI[OÓ]N|MANCOMUNIDADE|ORGANISMO|CONGREGACI[OÓ]N|COMUNIDAD|HERMANAS|HERMANITAS|MISIONERAS|C[AÁ]RITAS|PIA UNION|INSTITUCI[OÓ]N|RESIDENCIA|CLUB)\b/i;
// DNI / NIE (some SLNE company names embed the founder's name and NIF).
const ID_NUMBER = /\b\d{7,9}[A-Z]\b|\b[XYZ]\d{7}[A-Z]\b/i;

/** Owner name if it reads as an organisation; null for natural persons or unclear names. */
export function entidade(raw: string): string | null {
  const s = text(raw);
  if (!s || ID_NUMBER.test(s)) return null;
  return LEGAL_FORM.test(s) || ORG_WORDS.test(s) ? s : null;
}

/** Shorten the comma-separated list at an item boundary. */
export function shortServizos(raw: string, max = SERVIZOS_MAX): string | null {
  const s = text(raw);
  if (!s) return null;
  if (s.length <= max) return s;
  const items = s.split(/\s*,\s*/);
  let out = '';
  for (const it of items) {
    const next = out ? `${out}, ${it}` : it;
    if (next.length > max - 1) break;
    out = next;
  }
  return `${out || s.slice(0, max - 1)}…`;
}

/** The source link has literal braces in its query string; percent-encode them. */
export function ruepssLink(raw: string): string | null {
  const s = text(raw);
  if (!/^https:\/\/ruepss\.xunta\.gal\//.test(s)) return null;
  return s.replaceAll('{', '%7B').replaceAll('}', '%7D');
}

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
}

export function toFeatures(kml: string): { features: Feature[]; stats: ParseStats } {
  if (!/<kml[\s>]/.test(kml)) throw new Error('Not a KML document');
  const features: Feature[] = [];
  const stats: ParseStats = { placemarks: 0, dropped: 0 };
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
    const cp = text(d.CodigoPostal);

    features.push({
      type: 'Feature',
      id,
      geometry: point(lon, lat),
      properties: {
        id,
        nome: name,
        tipo: TIPO[desc.toUpperCase()] ?? desc,
        iniciativa,
        entidade: entidade(d.Entidade ?? ''),
        concello: text(d.Concello),
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

/** HTTP date → ISO UTC, or null. */
export function httpDateToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
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
