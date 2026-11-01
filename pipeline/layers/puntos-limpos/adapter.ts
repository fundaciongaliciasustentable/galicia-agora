// Clean points (puntos limpos, municipal recycling centres) from abertos.xunta.gal dataset
// 0303: one Windows-1252 CSV, `;`-separated, with "lat,lon" in a single column and a
// Last-Modified header (publishedAt). 151 centres; the file has no code, so the id is a slug
// of the name (all names are distinct).
//
// Phones (centre and town hall), the operator company and the construction cost are not
// published: the cost column carries a broken euro sign and the phones can be mobile numbers
// of staff. Timetables are public opening hours and are kept.

import { type Adapter, type Feature, point } from '../../lib/adapter.ts';
import { latLonPair, records } from '../../lib/csv.ts';
import { httpDateToIso } from '../centros-maiores/adapter.ts';
import INE_NAMES from '../centros-saude/concellos-ine.json' with { type: 'json' };
import { lookupConcello, slug } from '../centros-saude/sergas.ts';
import { titleCase } from '../zonas-bano/adapter.ts';

export const URL = 'https://ficheiros-web.xunta.gal/abertos/puntos_limpos/Puntos_limpos.csv';

const COLUMNS = ['NOME', 'ENDEREZO', 'CONCELLO', 'HORARIO', 'TITULAR', 'COORDENADAS'];

/** "CONCELLO. Instalacións construidas pola CMATI" → "Concello"; "Entidade privada" kept. */
export function titular(v: string): string | null {
  const head = v.split('.')[0]?.trim();
  return head ? titleCase(head) : null;
}

/** Names in the file that the shared lookup does not resolve (checked 2026-11-01). */
const ALIASES: Record<string, string> = {
  Cerdedo: '36902', // merged into Cerdedo-Cotobade (2016)
  'Sigüeiro (Oroso)': '15060',
  'Oza dos Ríos': '15902', // merged into Oza-Cesuras (2013)
  'Sobrado dos Monxes': '15080',
};

function concello(raw: string): { ine: string; nome: string } | null {
  const ine = ALIASES[raw.trim()];
  return ine
    ? { ine, nome: (INE_NAMES as Record<string, string>)[ine] as string }
    : lookupConcello(raw);
}

export interface ParseStats {
  rows: number;
  badCoords: number;
}

export function toFeatures(csv: string): { features: Feature[]; stats: ParseStats } {
  const rows = records(csv, ';', COLUMNS);
  const stats: ParseStats = { rows: rows.length, badCoords: 0 };
  const features: Feature[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const nome = (r.NOME ?? '').replace(/\s+/g, ' ').trim();
    if (!nome) continue;
    const pos = latLonPair(r.COORDENADAS ?? '');
    if (!pos) {
      stats.badCoords++;
      continue;
    }
    let id = slug(nome);
    if (seen.has(id)) id = `${id}-${seen.size}`;
    seen.add(id);
    const hit = concello(r.CONCELLO ?? '');
    // The "concellos served" header has irregular spacing; found by prefix.
    const servidos = Object.entries(r).find(([k]) => k.startsWith('CONCELLOS AOS QUE'))?.[1];
    features.push({
      type: 'Feature',
      id,
      geometry: point(pos.lon, pos.lat),
      properties: {
        id,
        nome,
        enderezo: (r.ENDEREZO ?? '').trim() || null,
        concello: hit?.nome ?? (r.CONCELLO?.trim() || null),
        codigo_ine: hit?.ine ?? null,
        horario: (r.HORARIO ?? '').replace(/\s+/g, ' ').trim() || null,
        titular: titular(r.TITULAR ?? ''),
        concellos_servidos: servidos?.replace(/\s+/g, ' ').trim() || null,
      },
    });
  }
  return { features, stats };
}

export interface Raw {
  csv: string;
  lastModified: string | null;
}

/** Stats of the last normalize call, for tests and logging. */
export let lastStats: ParseStats | null = null;

const adapter = {
  async fetch(ctx) {
    const res = await ctx.get(URL);
    // Windows-1252 (the euro sign is 0x80); the columns we read are Latin-1 compatible.
    return {
      csv: new TextDecoder('windows-1252').decode(res.body).replace(/^﻿/, ''),
      lastModified: res.lastModified ?? res.headers?.['last-modified'] ?? null,
    };
  },

  normalize(raw, _ctx) {
    const { features, stats } = toFeatures(raw.csv);
    lastStats = stats;
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: httpDateToIso(raw.lastModified),
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
