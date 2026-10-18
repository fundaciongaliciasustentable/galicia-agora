// NASA LANCE FIRMS active fire detections (VIIRS SNPP, NOAA-20, NOAA-21, MODIS).
// With FIRMS_MAP_KEY: area API for the Galicia bbox, last day. Without it: the
// keyless Europe 24 h CSVs, clipped to the Galicia bbox. The key must never
// leave memory: it is not stored, logged or included in thrown errors.

import {
  type Adapter,
  type AdapterContext,
  type Feature,
  GALICIA_BBOX,
  inGalicia,
  point,
  round,
} from '../../lib/adapter.ts';

const API_PRODUCTS = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT'];

const EUROPE_BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire';
export const EUROPE_FILES: Record<string, string> = {
  VIIRS_SNPP_NRT: `${EUROPE_BASE}/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Europe_24h.csv`,
  VIIRS_NOAA20_NRT: `${EUROPE_BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Europe_24h.csv`,
  VIIRS_NOAA21_NRT: `${EUROPE_BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Europe_24h.csv`,
  MODIS_NRT: `${EUROPE_BASE}/modis-c6.1/csv/MODIS_C6_1_Europe_24h.csv`,
};

const BBOX = `${GALICIA_BBOX.west},${GALICIA_BBOX.south},${GALICIA_BBOX.east},${GALICIA_BBOX.north}`;

export function apiUrl(key: string, product: string): string {
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${product}/${BBOX}/1`;
}

export interface Raw {
  mode: 'api' | 'europe';
  files: Array<{ product: string; csv: string }>;
}

/** Replace every occurrence of the key so it never reaches meta.json or logs. */
export function redact(text: string, key: string | undefined): string {
  return key ? text.split(key).join('[FIRMS_MAP_KEY]') : text;
}

const SATELLITES: Record<string, string> = {
  N: 'Suomi NPP',
  N20: 'NOAA-20',
  N21: 'NOAA-21',
  '1': 'NOAA-20',
  '2': 'NOAA-21',
  A: 'Aqua',
  T: 'Terra',
  Aqua: 'Aqua',
  Terra: 'Terra',
};

const PRODUCT_SATELLITE: Record<string, string> = {
  VIIRS_SNPP_NRT: 'Suomi NPP',
  VIIRS_NOAA20_NRT: 'NOAA-20',
  VIIRS_NOAA21_NRT: 'NOAA-21',
};

const VIIRS_CONFIDENCE: Record<string, string> = {
  l: 'baixa',
  low: 'baixa',
  n: 'nominal',
  nominal: 'nominal',
  h: 'alta',
  high: 'alta',
};

/** MODIS confidence is 0–100; FIRMS classes it as low < 30 ≤ nominal < 80 ≤ high. */
function modisClass(pct: number): string {
  if (pct < 30) return 'baixa';
  if (pct < 80) return 'nominal';
  return 'alta';
}

/** acq_date (YYYY-MM-DD) + acq_time (HHMM, UTC, sometimes unpadded) → ISO UTC. */
export function detectionTime(date: string, time: string): string {
  const t = time.trim().padStart(4, '0');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) || !/^\d{4}$/.test(t)) {
    throw new Error(`Unrecognised FIRMS time: ${date} ${time}`);
  }
  const iso = `${date.trim()}T${t.slice(0, 2)}:${t.slice(2)}:00Z`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Unrecognised FIRMS time: ${date} ${time}`);
  return new Date(ms).toISOString();
}

const REQUIRED = ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence', 'frp', 'daynight'];

/** Parse one FIRMS CSV (VIIRS or MODIS columns). FIRMS CSVs have no quoted fields. */
export function parseCsv(csv: string, product: string): Feature[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0]?.split(',').map((h) => h.trim());
  if (!header || !REQUIRED.every((c) => header.includes(c))) {
    throw new Error(`Unexpected FIRMS response for ${product}: ${(lines[0] ?? '').slice(0, 80)}`);
  }
  const instrument = header.includes('bright_ti4')
    ? 'VIIRS'
    : header.includes('brightness')
      ? 'MODIS'
      : null;
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const features: Feature[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const v = (name: string) => (cells[col[name] as number] ?? '').trim();
    const lat = Number(v('latitude'));
    const lon = Number(v('longitude'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inGalicia(lon, lat)) continue;
    const instrumento = (v('instrument') || instrument || '').toUpperCase();
    if (instrumento !== 'VIIRS' && instrumento !== 'MODIS') {
      throw new Error(`Unknown FIRMS instrument for ${product}`);
    }
    const sat = v('satellite');
    const satelite = SATELLITES[sat] ?? PRODUCT_SATELLITE[product] ?? sat;
    const rawConf = v('confidence');
    let confianza: string;
    let confianza_pct: number | null = null;
    if (instrumento === 'MODIS') {
      confianza_pct = Number(rawConf);
      if (!Number.isFinite(confianza_pct)) throw new Error(`Bad MODIS confidence: ${rawConf}`);
      confianza = modisClass(confianza_pct);
    } else {
      const c = VIIRS_CONFIDENCE[rawConf.toLowerCase()];
      if (!c) throw new Error(`Bad VIIRS confidence: ${rawConf}`);
      confianza = c;
    }
    const frp = Number(v('frp'));
    const dn = v('daynight').toUpperCase();
    const data_deteccion = detectionTime(v('acq_date'), v('acq_time'));
    features.push({
      type: 'Feature',
      id: `${satelite}-${data_deteccion}-${round(lon)}-${round(lat)}`,
      geometry: point(lon, lat),
      properties: {
        satelite,
        instrumento,
        data_deteccion,
        confianza,
        confianza_pct,
        frp: Number.isFinite(frp) ? frp : null,
        dia_noite: dn === 'D' ? 'día' : dn === 'N' ? 'noite' : null,
      },
    });
  }
  return features;
}

async function getText(ctx: AdapterContext, url: string, key?: string): Promise<string> {
  try {
    return (await ctx.get(url)).body.toString('utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(redact(msg, key));
  }
}

export default {
  async fetch(ctx) {
    const key = ctx.env.FIRMS_MAP_KEY?.trim() || undefined;
    if (key) {
      const files = [];
      for (const product of API_PRODUCTS) {
        files.push({ product, csv: await getText(ctx, apiUrl(key, product), key) });
      }
      return { mode: 'api', files };
    }
    const files = [];
    for (const [product, url] of Object.entries(EUROPE_FILES)) {
      files.push({ product, csv: await getText(ctx, url) });
    }
    return { mode: 'europe', files };
  },

  normalize(raw, ctx) {
    const key = ctx.env.FIRMS_MAP_KEY?.trim() || undefined;
    if (!raw || !Array.isArray(raw.files) || raw.files.length === 0) {
      throw new Error('FIRMS: no files fetched');
    }
    const features: Feature[] = [];
    for (const f of raw.files) {
      try {
        features.push(...parseCsv(f.csv, f.product));
      } catch (err) {
        throw new Error(redact(err instanceof Error ? err.message : String(err), key));
      }
    }
    features.sort((a, b) =>
      String(a.properties.data_deteccion).localeCompare(String(b.properties.data_deteccion)),
    );
    const last = features.at(-1);
    return {
      collection: { type: 'FeatureCollection', features },
      publishedAt: last ? String(last.properties.data_deteccion) : null,
    };
  },
} satisfies Adapter<Raw>;
