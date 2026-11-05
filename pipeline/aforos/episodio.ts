// Keep a flood episode before it leaves MeteoGalicia's 30-day window: 10-minute flow and level of
// every gauging station of the caudais-rios layer between two instants, from datos10min.action
// (documented in pipeline/samples/augas-galicia/JSON_Aforos_10min_es.pdf; personal key in the
// METEOGALICIA_AFOROS_KEY secret, never written or printed). At most 96 h per station and
// request, one request every PAUSE_MS.
//
//   tsx pipeline/aforos/episodio.ts --inicio=2026-10-05T00:00 --fin=2026-10-10T00:00
//
// Writes <DATA_OUT_DIR>/caudais-episodios/<inicio>_<fin>.json (the workflow commits it to the
// data branch): per station its position and, per parameter, [UTC instant, value] pairs
// (-9999 dropped), plus the validation code when it is not 1.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchWithRetry } from '../lib/http.ts';

const DATA_OUT = process.env.DATA_OUT_DIR ?? 'data-out';
const URL_10MIN = 'https://servizos.meteogalicia.gal/mgafos/json/datos10min.action';
const PAUSE_MS = 1500;
const CHUNK_H = 96;

function arg(name: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) throw new Error(`--${name}= is required`);
  return hit.split('=').slice(1).join('=');
}

/** "DD/MM/AAAA HH:MM" in UTC, as the service expects. */
const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

async function main() {
  const key = (process.env.METEOGALICIA_AFOROS_KEY ?? '').trim();
  if (!key) throw new Error('METEOGALICIA_AFOROS_KEY is not set');
  const redact = (s: string) =>
    s.split(key).join('[key]').split(encodeURIComponent(key)).join('[key]');
  const start = new Date(`${arg('inicio')}Z`);
  const end = new Date(`${arg('fin')}Z`);
  if (!(end > start)) throw new Error('--fin must be after --inicio');

  const stations = JSON.parse(
    await readFile(join(DATA_OUT, 'caudais-rios', 'data.geojson'), 'utf8'),
  ) as {
    features: Array<{
      geometry: { coordinates: [number, number] } | null;
      properties: Record<string, unknown>;
    }>;
  };
  const out: Array<Record<string, unknown>> = [];
  let requests = 0;
  let readings = 0;
  for (const f of stations.features) {
    const id = Number(f.properties.id);
    const series: Record<string, Array<[string, number, number?]>> = {};
    for (let a = start.getTime(); a < end.getTime(); a += CHUNK_H * 3_600_000) {
      const b = Math.min(end.getTime(), a + CHUNK_H * 3_600_000);
      const q = new URLSearchParams({
        cod: key,
        idEstacion: String(id),
        dataIni: stamp(new Date(a)),
        dataFin: stamp(new Date(b)),
      });
      if (requests++) await new Promise((r) => setTimeout(r, PAUSE_MS));
      try {
        const res = await fetchWithRetry(`${URL_10MIN}?${q}`, { timeoutMs: 120_000 });
        const json = JSON.parse(res.body.toString('utf8')) as {
          list10Min?: Array<{
            instanteLecturaUTC: string;
            listaEstacions?: Array<{
              listaMedidas?: Array<{
                codParametro: string;
                valor: number;
                codigoValidacion?: number;
              }>;
            }>;
          }>;
        };
        for (const t of json.list10Min ?? []) {
          for (const e of t.listaEstacions ?? []) {
            for (const m of e.listaMedidas ?? []) {
              if (m.valor === -9999 || m.valor === null) continue;
              const row: [string, number, number?] = [t.instanteLecturaUTC, m.valor];
              if (m.codigoValidacion !== undefined && m.codigoValidacion !== 1)
                row.push(m.codigoValidacion);
              let list = series[m.codParametro];
              if (!list) {
                list = [];
                series[m.codParametro] = list;
              }
              list.push(row);
              readings++;
            }
          }
        }
      } catch (err) {
        console.error(`station ${id}: ${redact(err instanceof Error ? err.message : String(err))}`);
      }
    }
    out.push({
      id,
      nome: f.properties.nome,
      concello: f.properties.concello,
      lon: f.geometry?.coordinates[0] ?? null,
      lat: f.geometry?.coordinates[1] ?? null,
      medidas: series,
    });
  }
  const name = `${arg('inicio').replace(/:/g, '')}_${arg('fin').replace(/:/g, '')}`;
  await mkdir(join(DATA_OUT, 'caudais-episodios'), { recursive: true });
  await writeFile(
    join(DATA_OUT, 'caudais-episodios', `${name}.json`),
    `${JSON.stringify({
      inicio: start.toISOString(),
      fin: end.toISOString(),
      descargado: new Date().toISOString(),
      fonte:
        'MeteoGalicia e Augas de Galicia (Xunta de Galicia), datos10min.action. Datos non validados.',
      estacions: out,
    })}\n`,
  );
  console.log(
    `${out.length} stations, ${requests} requests, ${readings} readings → caudais-episodios/${name}.json`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message.replace(/cod=[^&\s]+/g, 'cod=[key]') : err);
  process.exit(1);
});
