// Build the Pagefind place index after `astro build`: one custom record per
// concello and parroquia (official IET names), in Galician and Spanish, whose
// URL opens the map on that place. Writes dist/pagefind/.
//
//   tsx site/scripts/search.ts

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pagefind from 'pagefind';

const DATA_OUT = process.env.DATA_OUT_DIR ?? 'data-out';
const SOURCE = join(DATA_OUT, 'concellos-parroquias', 'data.geojson');

type Ring = number[][];
interface Feature {
  geometry: { type: string; coordinates: Ring[] | Ring[][] } | null;
  properties: Record<string, string | null>;
}

/** Bounding-box centre and a zoom that fits the box roughly. */
function view(geometry: NonNullable<Feature['geometry']>): {
  lat: number;
  lon: number;
  zoom: number;
} {
  const polys = (
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  ) as Ring[][];
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const poly of polys)
    for (const ring of poly)
      for (const [x = 0, y = 0] of ring) {
        w = Math.min(w, x);
        e = Math.max(e, x);
        s = Math.min(s, y);
        n = Math.max(n, y);
      }
  const span = Math.max(e - w, (n - s) * 1.4);
  const zoom = Math.max(8, Math.min(14, Math.log2(360 / span) - 0.3));
  return { lat: (s + n) / 2, lon: (w + e) / 2, zoom };
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.log('search: no concellos-parroquias data; skipping place index');
    return;
  }
  const fc = JSON.parse(readFileSync(SOURCE, 'utf8')) as { features: Feature[] };
  const { index, errors } = await pagefind.createIndex({});
  if (!index) throw new Error(errors.join('; '));

  let count = 0;
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const p = f.properties;
    const v = view(f.geometry);
    const hash = `map=${v.zoom.toFixed(1)}/${v.lat.toFixed(4)}/${v.lon.toFixed(4)}&capas=concellos-parroquias`;
    const isConcello = p.nivel === 'concello';
    for (const lang of ['gl', 'es'] as const) {
      const kind = isConcello
        ? lang === 'gl'
          ? 'Concello'
          : 'Ayuntamiento'
        : lang === 'gl'
          ? 'Parroquia'
          : 'Parroquia';
      const where = isConcello ? (p.provincia ?? '') : `${p.concello ?? ''}, ${p.provincia ?? ''}`;
      await index.addCustomRecord({
        // Root-relative: Pagefind prefixes the site base (where its bundle lives).
        url: `${lang === 'gl' ? '/' : '/es/'}#${hash}`,
        content: `${p.nome ?? ''} ${p.concello ?? ''} ${p.capital ?? ''}`,
        language: lang,
        meta: { title: p.nome ?? '', tipo: kind, onde: where },
      });
    }
    count++;
  }
  await index.writeFiles({ outputPath: 'dist/pagefind' });
  await pagefind.close();
  console.log(`search: ${count} places indexed (gl + es)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
