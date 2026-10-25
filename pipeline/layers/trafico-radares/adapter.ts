// Fixed speed camera cabins and average-speed sections of the DGT in Galicia, from the
// DATEX II v1.0 PredefinedLocationsPublication on the NAP (~2 MB, all of Spain).
// A cabin is a housing that may or may not hold a working radar on a given day: the
// layer says "cabinas", never "radares activos".
//
// Galicia is selected by provinceINEIdentifier (15, 27, 32, 36) of the reference points,
// not by bounding box. Average-speed sections that cross into Asturias are kept when one
// end is in Galicia. Sections are a LineString from→to when both ends have coordinates
// (a straight line between the two ends, not the road shape); otherwise a Point.

import { gunzipSync } from 'node:zlib';
import { type Adapter, type Feature, inGalicia, point, round } from '../../lib/adapter.ts';

export const URL =
  'https://nap.dgt.es/datex2/dgt/PredefinedLocationsPublication/radares/content.xml';

export const PAD = 0.3;
const GALICIA = new Set(['15', '27', '32', '36']);

/** INE province code → name in Galician (Galicia and neighbours reached by sections). */
export const PROVINCIA: Record<string, string> = {
  '15': 'A Coruña',
  '27': 'Lugo',
  '32': 'Ourense',
  '36': 'Pontevedra',
  '33': 'Asturias',
  '24': 'León',
  '49': 'Zamora',
};

const SETS: Record<string, 'cabina' | 'tramo'> = {
  CabinasCinemometro: 'cabina',
  CinemometrosVelocidadMedia: 'tramo',
};

const SENTIDO: Record<string, string> = {
  positive: 'crecente',
  negative: 'decrecente',
  both: 'ambos sentidos',
};

export type Raw = Buffer;

const P = '(?:[\\w.-]+:)?';

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** Trimmed text of the first element with this local name, or null. */
function text(xml: string, local: string): string | null {
  const m = new RegExp(`<${P}${local}(?:\\s[^>]*)?>([^<]*)</${P}${local}\\s*>`).exec(xml);
  const t = m ? decodeXml(m[1] as string).trim() : '';
  return t || null;
}

function block(xml: string, local: string): string | null {
  const m = new RegExp(`<${P}${local}(?=[\\s>])[^>]*>([\\s\\S]*?)</${P}${local}\\s*>`).exec(xml);
  return m ? (m[1] as string) : null;
}

function coords(xml: string | null): [number, number] | null {
  if (xml === null) return null;
  const lat = Number(text(xml, 'latitude'));
  const lon = Number(text(xml, 'longitude'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return [lon, lat];
}

interface RefPoint {
  estrada: string | null;
  pk: number | null;
  sentido: string | null;
  cara_a: string | null;
  provincia: string | null;
}

function refPoint(xml: string | null): RefPoint | null {
  if (xml === null) return null;
  const metres = Number(text(xml, 'referencePointDistance'));
  const ine = text(xml, 'provinceINEIdentifier');
  const dir = text(xml, 'directionRelative');
  return {
    estrada: text(xml, 'roadNumber') ?? text(block(xml, 'roadName') ?? '', 'value'),
    pk:
      Number.isFinite(metres) && text(xml, 'referencePointDistance') !== null
        ? metres / 1000
        : null,
    sentido: dir ? (SENTIDO[dir] ?? null) : null,
    cara_a: text(xml, 'directionNamed'),
    provincia: ine,
  };
}

export interface Location {
  id: string;
  tipo: 'cabina' | 'tramo';
  galicia: boolean;
  feature: Feature | null;
}

/** Read one outer predefinedLocation element (its inner XML, after the opening tag). */
export function parseLocation(id: string, tipo: 'cabina' | 'tramo', xml: string): Location {
  const name = id.replace(/^GUID_/, '');
  let from: [number, number] | null;
  let to: [number, number] | null = null;
  let start: RefPoint | null;
  let end: RefPoint | null = null;
  if (tipo === 'tramo') {
    const linear = block(xml, 'tpeglinearLocation') ?? '';
    from = coords(block(linear, 'from'));
    to = coords(block(linear, 'to'));
    start = refPoint(block(block(xml, 'referencePointPrimaryLocation') ?? '', 'referencePoint'));
    end = refPoint(block(block(xml, 'referencePointSecondaryLocation') ?? '', 'referencePoint'));
  } else {
    from = coords(block(xml, 'point'));
    start = refPoint(block(xml, 'referencePoint'));
  }

  const ines = [start?.provincia, end?.provincia].filter((p): p is string => !!p);
  const galicia = ines.some((p) => GALICIA.has(p));
  const ends = [from, to].filter((c): c is [number, number] => c !== null);
  if (!galicia || ends.length === 0 || !ends.some(([lon, lat]) => inGalicia(lon, lat, PAD))) {
    return { id: name, tipo, galicia, feature: null };
  }

  const provincias = [...new Set(ines.map((p) => PROVINCIA[p] ?? p))];
  const geometry =
    tipo === 'tramo' && from && to
      ? {
          type: 'LineString',
          coordinates: [
            [round(from[0]), round(from[1])],
            [round(to[0]), round(to[1])],
          ],
        }
      : point(...((from ?? to) as [number, number]));

  return {
    id: name,
    tipo,
    galicia,
    feature: {
      type: 'Feature',
      id: name,
      geometry,
      properties: {
        id: name,
        tipo,
        estrada: start?.estrada ?? end?.estrada ?? null,
        pk: start?.pk == null ? null : round(start.pk, 3),
        pk_fin: tipo === 'tramo' && end?.pk != null ? round(end.pk, 3) : null,
        sentido: start?.sentido ?? null,
        cara_a: start?.cara_a ?? null,
        provincia: provincias.join(' / ') || null,
      },
    },
  };
}

/** Parse the whole publication. Returns locations by set and the publication time. */
export function parsePublication(xml: string): { locations: Location[]; publishedAt: string } {
  if (!/PredefinedLocationsPublication/.test(xml)) {
    throw new Error('Unexpected response: not a PredefinedLocationsPublication');
  }
  const pub = new RegExp(`<${P}publicationTime>([^<]+)<`).exec(xml)?.[1] ?? null;
  const ms = pub ? Date.parse(pub.trim()) : Number.NaN;
  if (!Number.isFinite(ms))
    throw new Error(`Unexpected response: no valid publicationTime (${pub})`);

  const locations: Location[] = [];
  const setRe = new RegExp(
    `<${P}predefinedLocationSet\\s[^>]*id="([^"]*)"[^>]*>([\\s\\S]*?)</${P}predefinedLocationSet\\s*>`,
    'g',
  );
  for (const [, , body] of xml.matchAll(setRe)) {
    const setName = text(body as string, 'value') ?? '';
    const tipo = SETS[setName];
    if (!tipo) continue;
    // Outer predefinedLocation elements carry an id; the inner one carries xsi:type.
    // Each outer element runs until the next outer opening tag (they are not nested).
    const openRe = new RegExp(`<${P}predefinedLocation\\s+id="([^"]*)"[^>]*>`, 'g');
    const opens = [...(body as string).matchAll(openRe)];
    opens.forEach((m, i) => {
      const startAt = (m.index as number) + m[0].length;
      const endAt = opens[i + 1]?.index ?? (body as string).length;
      locations.push(parseLocation(m[1] as string, tipo, (body as string).slice(startAt, endAt)));
    });
  }
  return { locations, publishedAt: new Date(ms).toISOString() };
}

const adapter = {
  async fetch(ctx) {
    const res = await ctx.get(URL, { headers: { 'accept-encoding': 'gzip' }, timeoutMs: 120_000 });
    return res.body;
  },
  async normalize(raw, _ctx) {
    if (!Buffer.isBuffer(raw) || raw.length === 0) throw new Error('Empty response');
    const body = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
    const { locations, publishedAt } = parsePublication(body.toString('utf8'));
    const features = locations
      .map((l) => l.feature)
      .filter((f): f is Feature => f !== null)
      .sort(
        (a, b) =>
          String(a.properties.tipo).localeCompare(String(b.properties.tipo)) ||
          String(a.id).localeCompare(String(b.id)),
      );
    return { collection: { type: 'FeatureCollection', features }, publishedAt };
  },
} satisfies Adapter<Raw>;

export default adapter;
