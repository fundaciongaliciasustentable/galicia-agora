// Fuel stations and prices in Galicia (CCAA 12) from the Ministry's REST service.
// One request per run. Numbers use a decimal comma ("1,768", "43,230667").
// The response "Fecha" is the time of the request (the prices in force at that moment),
// not a publication time, so publishedAt is null and the value goes to prezo_actualizado.

import { type Adapter, type Feature, inGalicia, madridToIso, point } from '../../lib/adapter.ts';

export const URL =
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroCCAA/12';

/** Stations just over a provincial border still belong to Galicia: small pad. */
export const PAD = 0.05;

type Station = Record<string, string>;
export type Raw = unknown;

/** "1,768" -> 1.768; empty or non-positive -> null. */
export function decimal(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function price(s: string | undefined): number | null {
  const n = decimal(s);
  return n !== null && n > 0 ? n : null;
}

/** "24/10/2026 9:24:37" (Europe/Madrid wall clock) -> ISO UTC. */
export function parseFecha(s: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) throw new Error(`Unexpected Fecha: ${s}`);
  const [, d, mo, y, h, mi, sec = '00'] = m;
  const p = (x: string) => x.padStart(2, '0');
  return madridToIso(`${y}-${p(mo as string)}-${p(d as string)} ${p(h as string)}:${mi}:${sec}`);
}

const adapter = {
  async fetch(ctx) {
    const res = await ctx.get(URL, { headers: { accept: 'application/json' } });
    return JSON.parse(res.body.toString('utf8')) as unknown;
  },

  normalize(raw, _ctx) {
    const r = raw as Record<string, unknown> | null;
    const list = r?.ListaEESSPrecio;
    if (!Array.isArray(list) || typeof r?.Fecha !== 'string') {
      throw new Error('Unexpected response: missing ListaEESSPrecio or Fecha');
    }
    if (r.ResultadoConsulta !== undefined && r.ResultadoConsulta !== 'OK') {
      throw new Error(`Service reported: ${String(r.ResultadoConsulta)}`);
    }
    const asOf = parseFecha(r.Fecha);

    const features: Feature[] = [];
    for (const s of list as Station[]) {
      if (!s || typeof s !== 'object' || typeof s.IDEESS !== 'string') {
        throw new Error('Unexpected station record');
      }
      if (s.IDCCAA !== undefined && s.IDCCAA !== '12') continue;
      let lat = decimal(s.Latitud);
      let lon = decimal(s['Longitud (WGS84)']);
      if (lat === null || lon === null) continue;
      // Some stations have latitude and longitude swapped (seen 2026-10-24: IDEESS 16268, Tui).
      if (!inGalicia(lon, lat, PAD) && inGalicia(lat, lon, PAD)) [lat, lon] = [lon, lat];
      if (!inGalicia(lon, lat, PAD)) continue;

      features.push({
        type: 'Feature',
        id: s.IDEESS,
        geometry: point(lon, lat),
        properties: {
          id: s.IDEESS,
          nome: (s.Rótulo ?? '').trim() || 'Sen rótulo',
          enderezo: (s.Dirección ?? '').trim(),
          concello: (s.Municipio ?? '').trim(),
          horario: (s.Horario ?? '').trim(),
          venda: s['Tipo Venta'] === 'R' ? 'restrinxida' : 'publica',
          gasoleo_a: price(s['Precio Gasoleo A']),
          gasolina_95: price(s['Precio Gasolina 95 E5']) ?? price(s['Precio Gasolina 95 E10']),
          gasolina_98: price(s['Precio Gasolina 98 E5']) ?? price(s['Precio Gasolina 98 E10']),
          gasoleo_b: price(s['Precio Gasoleo B']),
          glp: price(s['Precio Gases licuados del petróleo']),
          prezo_actualizado: asOf,
        },
      });
    }

    return {
      collection: { type: 'FeatureCollection', features },
      // "Fecha" is the request time, not a publication time (verified 2026-10-24: two calls
      // ~8 min apart each returned their own request time, equal to the HTTP Date header).
      publishedAt: null,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
