// Libraries in Galicia from the directory of the Rede de Bibliotecas de Galicia (Consellería
// de Cultura; abertos.xunta.gal dataset 0230): one UTF-8 CSV, `;`-separated, generated on
// request (no Last-Modified), with "lat, lon" in one column. 486 libraries, public and
// specialised. Rows without both coordinates (15 on 2026-11-01: mobile libraries and rows
// with the latitude only) are dropped. The file has no code: the id is a slug of name and
// concello.
//
// Phones and e-mails are not published; owners are all institutions (checked 2026-11-01).

import { type Adapter, type Feature, point } from '../../lib/adapter.ts';
import { decodeText, latLonPair, records } from '../../lib/csv.ts';
import { lookupConcello, slug } from '../centros-saude/sergas.ts';

export const URL =
  'https://directorio-rbgalicia.xunta.gal/download?file=/csv/DirectorioBibliotecasPublicasGalicia.csv';

const COLUMNS = [
  'TIPOLOXÍA',
  'EIDO DE ESPECIALIZACIÓN',
  'NOME',
  'ENDEREZO',
  'LOCALIDADE',
  'CONCELLO',
  'CÓDIGO POSTAL',
  'COORDENADAS',
  'PORTAL WEB',
  'TITULARIDADE',
  'INSTITUCIÓN TITULAR',
  'ACCESO',
  'INTEGRADA NA RBG',
];

const blank = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim() || null;

export interface ParseStats {
  rows: number;
  noCoords: number;
}

export function toFeatures(csv: string): { features: Feature[]; stats: ParseStats } {
  const rows = records(csv, ';', COLUMNS);
  const stats: ParseStats = { rows: rows.length, noCoords: 0 };
  const features: Feature[] = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    const nome = blank(r.NOME);
    if (!nome) continue;
    const pos = latLonPair(r.COORDENADAS ?? '');
    if (!pos) {
      stats.noCoords++;
      continue;
    }
    const hit = lookupConcello(r.CONCELLO ?? '');
    const base = slug(`${nome} ${hit?.nome ?? r.CONCELLO ?? ''}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    const cp = blank(r['CÓDIGO POSTAL']);
    const web = blank(r['PORTAL WEB']);
    const titularidade = blank(r.TITULARIDADE)?.toLowerCase();
    const acceso = blank(r.ACCESO)?.toLowerCase();
    features.push({
      type: 'Feature',
      id,
      geometry: point(pos.lon, pos.lat),
      properties: {
        id,
        nome,
        tipo: blank(r['TIPOLOXÍA']),
        especializacion: blank(r['EIDO DE ESPECIALIZACIÓN']),
        enderezo: blank(r.ENDEREZO),
        localidade: blank(r.LOCALIDADE),
        concello: hit?.nome ?? blank(r.CONCELLO),
        codigo_ine: hit?.ine ?? null,
        cp: cp && /^\d{5}$/.test(cp) ? cp : null,
        titularidade:
          titularidade === 'pública' ? 'publica' : titularidade === 'privada' ? 'privada' : null,
        titular: blank(r['INSTITUCIÓN TITULAR']),
        acceso: acceso === 'público' ? 'publico' : acceso === 'restrinxido' ? 'restrinxido' : null,
        rede_bibliotecas: blank(r['INTEGRADA NA RBG']) === 'Si',
        web: web && /^https?:\/\/\S+$/.test(web) ? web : null,
      },
    });
  }
  return { features, stats };
}

export type Raw = string;

/** Stats of the last normalize call, for tests and logging. */
export let lastStats: ParseStats | null = null;

const adapter = {
  async fetch(ctx) {
    return decodeText((await ctx.get(URL)).body);
  },

  normalize(raw, _ctx) {
    const { features, stats } = toFeatures(raw);
    lastStats = stats;
    // The file is generated on request and carries no date.
    return { collection: { type: 'FeatureCollection', features }, publishedAt: null };
  },
} satisfies Adapter<Raw>;

export default adapter;
