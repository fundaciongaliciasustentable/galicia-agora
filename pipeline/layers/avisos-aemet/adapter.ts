// AEMET Meteoalerta warnings for Galicia (CAP 1.2), one polygon per warned zone.
// The Atom feed lists one CAP XML per warning plus a tar.gz "complete state" entry,
// which is ignored (no tar parsing). Each linked CAP is fetched, at most MAX_CAPS per
// run. Green (no warning), cancelled and expired warnings are dropped.
// The XML is small and regular, so it is read with a few regular expressions instead
// of adding an XML dependency.

import { type Adapter, type Feature, round } from '../../lib/adapter.ts';

export const ATOM_URL =
  'https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAC71_ATOM.xml';
export const MAX_CAPS = 40;

export interface Raw {
  atom: string;
  caps: Array<{ url: string; xml: string }>;
}

// ---- minimal XML helpers ----

function decode(s: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  if (cdata) return (cdata[1] as string).trim();
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** Inner XML of every <tag>…</tag> (no namespace prefixes in AEMET's CAP and Atom). */
function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1] as string);
}

function text(xml: string, tag: string): string | null {
  const b = blocks(xml, tag)[0];
  return b === undefined ? null : decode(b);
}

function toIso(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// ---- Atom ----

export interface AtomEntry {
  title: string;
  href: string;
}

export function parseAtom(atom: string): { updated: string | null; entries: AtomEntry[] } {
  if (!/<feed[\s>]/.test(atom)) throw new Error('AEMET: unexpected Atom response (no <feed>)');
  const head = atom.split(/<entry[\s>]/)[0] as string;
  const entries = blocks(atom, 'entry').map((e) => ({
    title: text(e, 'title') ?? '',
    href: decode(/<link\b[^>]*\bhref="([^"]+)"/.exec(e)?.[1] ?? ''),
  }));
  return { updated: toIso(text(head, 'updated')), entries };
}

/** CAP links to fetch: XML only (skips the tar.gz complete state) and not green. */
export function capLinks(entries: AtomEntry[]): string[] {
  const urls = entries
    .filter((e) => /\.xml$/i.test(e.href) && !/nivel verde/i.test(e.title))
    .map((e) => e.href);
  return [...new Set(urls)].slice(0, MAX_CAPS);
}

// ---- CAP ----

const NIVEL_BY_PARAM: Record<string, string> = {
  amarillo: 'amarelo',
  naranja: 'laranxa',
  rojo: 'vermello',
};
const NIVEL_BY_SEVERITY: Record<string, string> = {
  Moderate: 'amarelo',
  Severe: 'laranxa',
  Extreme: 'vermello',
};

function parameters(info: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of blocks(info, 'parameter')) {
    const k = text(p, 'valueName');
    const v = text(p, 'value');
    if (k && v !== null) m.set(k, v);
  }
  return m;
}

/** CAP polygon "lat,lon lat,lon …" → closed GeoJSON ring of [lon, lat]. */
export function capPolygon(s: string): number[][] {
  const ring = s
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [lat, lon] = pair.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error(`AEMET: bad CAP polygon point "${pair}"`);
      }
      return [round(lon as number), round(lat as number)];
    });
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([...first]);
  if (ring.length < 4) throw new Error('AEMET: CAP polygon with fewer than 3 points');
  return ring;
}

function pickInfo(infos: string[]): string | undefined {
  const lang = (i: string) => (text(i, 'language') ?? '').toLowerCase();
  return (
    infos.find((i) => lang(i).startsWith('gl')) ??
    infos.find((i) => lang(i).startsWith('es')) ??
    infos[0]
  );
}

export function capFeatures(xml: string, url: string, now: Date): Feature[] {
  if (!/<alert[\s>]/.test(xml)) throw new Error(`AEMET: not a CAP alert: ${url}`);
  const identifier = text(xml, 'identifier');
  if (!identifier) throw new Error(`AEMET: CAP without identifier: ${url}`);
  if (text(xml, 'status') !== 'Actual' || text(xml, 'msgType') === 'Cancel') return [];

  const info = pickInfo(blocks(xml, 'info'));
  if (!info) throw new Error(`AEMET: CAP without <info>: ${url}`);

  const params = parameters(info);
  const nivelParam = params.get('AEMET-Meteoalerta nivel')?.toLowerCase();
  const nivel = nivelParam
    ? NIVEL_BY_PARAM[nivelParam]
    : NIVEL_BY_SEVERITY[text(info, 'severity') ?? ''];
  if (!nivel) return []; // green / no warning

  const fin = toIso(text(info, 'expires'));
  if (!fin) throw new Error(`AEMET: CAP without valid <expires>: ${url}`);
  if (Date.parse(fin) < now.getTime()) return [];

  const [codigoFenomeno, nomeFenomeno] = (text(blocks(info, 'eventCode')[0] ?? '', 'value') ?? '')
    .split(';')
    .map((x) => x.trim());

  const features: Feature[] = [];
  blocks(info, 'area').forEach((area, i) => {
    const rings = blocks(area, 'polygon').map((p) => capPolygon(decode(p)));
    if (rings.length === 0) return; // geocode-only area: nothing to draw
    const codigoZona = text(blocks(area, 'geocode')[0] ?? '', 'value');
    const id = `${identifier}_${codigoZona ?? i}`;
    features.push({
      type: 'Feature',
      id,
      geometry:
        rings.length === 1
          ? { type: 'Polygon', coordinates: rings }
          : { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) },
      properties: {
        id,
        nivel,
        fenomeno: nomeFenomeno || text(info, 'event'),
        codigo_fenomeno: codigoFenomeno || null,
        zona: text(area, 'areaDesc'),
        codigo_zona: codigoZona,
        inicio: toIso(text(info, 'onset')) ?? toIso(text(info, 'effective')),
        fin,
        titular: text(info, 'headline'),
        descricion: text(info, 'description'),
        probabilidade: params.get('AEMET-Meteoalerta probabilidad') ?? null,
        fonte_url: url,
      },
    });
  });
  return features;
}

const NIVEL_ORDER: Record<string, number> = { amarelo: 1, laranxa: 2, vermello: 3 };

const adapter = {
  async fetch(ctx) {
    const atom = (await ctx.get(ATOM_URL)).body.toString('utf8');
    const caps: Raw['caps'] = [];
    // Sequential on purpose: be gentle with the service.
    for (const url of capLinks(parseAtom(atom).entries)) {
      caps.push({ url, xml: (await ctx.get(url)).body.toString('utf8') });
    }
    return { atom, caps };
  },

  normalize(raw, ctx) {
    const { updated } = parseAtom(raw.atom);
    const features = raw.caps.flatMap((c) => capFeatures(c.xml, c.url, ctx.now));
    // Draw higher levels last (on top).
    features.sort(
      (a, b) =>
        (NIVEL_ORDER[a.properties.nivel as string] ?? 0) -
        (NIVEL_ORDER[b.properties.nivel as string] ?? 0),
    );
    return { collection: { type: 'FeatureCollection', features }, publishedAt: updated };
  },
} satisfies Adapter<Raw>;

export default adapter;
