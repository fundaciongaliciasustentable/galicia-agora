// When each part of Galicia was built, from the Catastro's INSPIRE buildings, for
// /pulso/construcion/.
//
// Source: the INSPIRE Buildings ATOM service of the Dirección General del Catastro, one ZIP per
// municipality from five territorial offices (datos/fontes/catastro-edificios). The licence
// only allows publishing transformed information, so nothing of a single building leaves this
// adapter: each «Building» (everything built on one cadastral parcel) is reduced to the 250 m
// UTM cell its envelope centre falls in, the year of its oldest construction unit and its
// main use, and the output is counts per cell, year and use. No cadastral reference, address
// or link is read.
//
// The Catastro fills unknown old dates with one round year per municipality (1900 in half of
// A Gudiña, 1880 in Lugo). Those years are found per municipality (fillerYears) and moved to
// a «no reliable date» bucket together with the undated, so the map does not light them up.

import type { Adapter, AdapterContext, Feature } from '../../lib/adapter.ts';
import { zipChunks, zipEntries } from '../../lib/zip.ts';

export const FEED_BASE = 'https://www.catastro.hacienda.gob.es/INSPIRE/buildings';
/** Territorial offices serving Galicia; 54 is Vigo (Baiona, Gondomar, Nigrán, Vigo). */
export const OFFICES = ['15', '27', '32', '36', '54'] as const;
export const CELL_M = 250;
/** First year of the clock: older dated buildings are drawn as already there. */
export const FIRST_YEAR = 1900;
/** Bucket for buildings without a reliable year (undated or filler). */
export const NO_DATE = 0;
/** Bucket for dated buildings older than FIRST_YEAR. */
export const BEFORE = FIRST_YEAR - 1;
const DEFAULT_PAUSE_MS = 1000;

/** Main use of the parcel (currentUse) → index into USES. */
export const USES = ['vivenda', 'agrario', 'industrial', 'servizos', 'outro'] as const;
export function useIndex(currentUse: string): number {
  if (currentUse === '1_residential') return 0;
  if (currentUse === '2_agriculture') return 1;
  if (currentUse === '3_industrial') return 2;
  if (currentUse.startsWith('4_')) return 3;
  return 4;
}

export interface FeedEntry {
  office: string;
  code: string;
  name: string;
  url: string;
  updated: string | null;
}

export interface Municipality {
  code: string;
  name: string;
  buildings: number;
  /** [cellX, cellY, year (0 = undated), use, count] */
  rows: Array<[number, number, number, number, number]>;
}

export interface Raw {
  updated: string | null;
  municipalities: Municipality[];
}

/** The ZIP entries of one office feed (title «15001-ABEGONDO buildings» + enclosure link). */
export function parseFeed(xml: string, office: string): FeedEntry[] {
  const updated = /<updated>([^<]+)<\/updated>/.exec(xml)?.[1] ?? null;
  const out: FeedEntry[] = [];
  for (const block of xml.split('<entry>').slice(1)) {
    const title = /<title>\s*(\d{5})-([^<]+?)\s+buildings\s*<\/title>/.exec(block);
    const url = /<link rel="enclosure" href="([^"]+\.zip)"/.exec(block)?.[1];
    if (!title || !url) throw new Error(`Unreadable entry in Catastro feed ${office}`);
    out.push({ office, code: title[1] as string, name: (title[2] as string).trim(), url, updated });
  }
  return out;
}

const YEAR = /<bu-core2d:beginning>(\d{4})?-/;
const USE = /<bu-ext2d:currentUse>([^<]+)</;
const LOWER = /<gml:lowerCorner>([\d.]+) ([\d.]+)</;
const UPPER = /<gml:upperCorner>([\d.]+) ([\d.]+)</;
const SRS = /<gml:Envelope srsName="([^"]+)"/;

/** Cell, year and use of every Building in a building.gml stream, counted. */
export async function scanBuildings(chunks: AsyncIterable<Buffer>, code: string) {
  const counts = new Map<string, number>();
  let buildings = 0;
  let carry = '';
  const close = '</bu-ext2d:Building>';
  for await (const chunk of chunks) {
    carry += chunk.toString('latin1');
    let start = 0;
    for (let end = carry.indexOf(close); end >= 0; end = carry.indexOf(close, start)) {
      const b = carry.slice(start, end);
      start = end + close.length;
      const lo = LOWER.exec(b);
      const hi = UPPER.exec(b);
      if (!lo || !hi) throw new Error(`Building without envelope in ${code}`);
      const srs = SRS.exec(b)?.[1] ?? '';
      if (!srs.endsWith('25829')) throw new Error(`Unexpected CRS ${srs} in ${code}`);
      const x = (Number(lo[1]) + Number(hi[1])) / 2;
      const y = (Number(lo[2]) + Number(hi[2])) / 2;
      const year = Number(YEAR.exec(b)?.[1] ?? NO_DATE);
      const use = useIndex(USE.exec(b)?.[1] ?? '');
      const k = `${Math.floor(x / CELL_M)},${Math.floor(y / CELL_M)},${year},${use}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      buildings++;
    }
    carry = carry.slice(start);
  }
  const rows = [...counts].map(([k, n]) => [
    ...k.split(',').map(Number),
    n,
  ]) as Municipality['rows'];
  return { buildings, rows };
}

/**
 * Round years the Catastro uses as a placeholder for «old, date unknown» in one municipality:
 * a year before 1960 holding at least 4 % of the dated buildings and at least four times as
 * many as any other year within ten years either side, or a year up to 1950 holding 10 % or
 * more on its own (some municipalities use two placeholders a decade apart, 1890 and 1900).
 */
export function fillerYears(byYear: Map<number, number>): number[] {
  let dated = 0;
  for (const [y, n] of byYear) if (y !== NO_DATE) dated += n;
  const out: number[] = [];
  for (const [y, n] of byYear) {
    if (y === NO_DATE || y >= 1960 || n < 0.04 * dated || n < 10) continue;
    let near = 0;
    for (let d = -10; d <= 10; d++) if (d !== 0) near = Math.max(near, byYear.get(y + d) ?? 0);
    if (n >= 4 * near || (y <= 1950 && n >= 0.1 * dated)) out.push(y);
  }
  return out.sort((a, b) => a - b);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const adapter: Adapter<Raw> = {
  async fetch(ctx: AdapterContext): Promise<Raw> {
    const pauseMs = Number(ctx.env.GA_PAUSE_MS ?? DEFAULT_PAUSE_MS);
    // 315 today: the Catastro keeps the two merged pairs (Oza-Cesuras, Cerdedo-Cotobade) apart.
    const expected = Number(ctx.env.EXPECT_ZIPS ?? 315);
    const byCode = new Map<string, FeedEntry>();
    for (const office of OFFICES) {
      const res = await ctx.get(`${FEED_BASE}/${office}/ES.SDGC.bu.atom_${office}.xml`);
      for (const e of parseFeed(res.body.toString('latin1'), office)) byCode.set(e.code, e);
    }
    const entries = [...byCode.values()];
    if (entries.length < expected)
      throw new Error(`Only ${entries.length} Catastro ZIPs for Galicia (expected ${expected})`);
    const municipalities: Municipality[] = [];
    for (const e of entries) {
      await pause(pauseMs);
      const res = await ctx.get(e.url, { timeoutMs: 600_000 });
      const member = zipEntries(res.body).find((m) => m.name.endsWith('.building.gml'));
      if (!member) throw new Error(`No building.gml in ${e.url}`);
      const { buildings, rows } = await scanBuildings(zipChunks(res.body, member), e.code);
      if (buildings === 0) throw new Error(`No buildings in ${e.code} ${e.name}`);
      municipalities.push({ code: e.code, name: e.name, buildings, rows });
    }
    const updated =
      entries
        .map((e) => e.updated)
        .sort()
        .at(-1) ?? null;
    return { updated, municipalities };
  },

  normalize(raw: Raw) {
    const cellIndex = new Map<string, number>();
    const cells: Array<[number, number]> = [];
    // year → cell → use → count
    const years = new Map<number, Map<number, number[]>>();
    const lastYear = Number((raw.updated ?? '9999').slice(0, 4));
    const fillers: Array<{ codigo: string; nome: string; ano: number; edificios: number }> = [];
    let total = 0;
    let undated = 0;
    let filler = 0;
    let before = 0;
    let impossible = 0;

    for (const m of raw.municipalities) {
      const byYear = new Map<number, number>();
      for (const [, , y, , n] of m.rows) byYear.set(y, (byYear.get(y) ?? 0) + n);
      const fill = new Set(fillerYears(byYear));
      for (const y of fill)
        fillers.push({ codigo: m.code, nome: m.name, ano: y, edificios: byYear.get(y) ?? 0 });
      for (const [cx, cy, y, u, n] of m.rows) {
        total += n;
        let bucket = y;
        if (y === NO_DATE) {
          undated += n;
        } else if (fill.has(y) || y > lastYear) {
          // A year after the data was published is a typing error, not a date.
          if (y > lastYear) impossible += n;
          else filler += n;
          bucket = NO_DATE;
        } else if (y < FIRST_YEAR) {
          before += n;
          bucket = BEFORE;
        }
        const key = `${cx},${cy}`;
        let ci = cellIndex.get(key);
        if (ci === undefined) {
          ci = cells.length;
          cellIndex.set(key, ci);
          cells.push([cx, cy]);
        }
        let byCell = years.get(bucket);
        if (!byCell) {
          byCell = new Map();
          years.set(bucket, byCell);
        }
        let uses = byCell.get(ci);
        if (!uses) {
          uses = USES.map(() => 0);
          byCell.set(ci, uses);
        }
        uses[u] = (uses[u] ?? 0) + n;
      }
    }

    // Cells in row order (south to north, west to east), as offsets from the south-west cell, so
    // the per-year cell lists below are short deltas. The file is served uncompressed.
    const order = cells
      .map((_, i) => i)
      .sort((a, b) => {
        const [ax, ay] = cells[a] as [number, number];
        const [bx, by] = cells[b] as [number, number];
        return ay - by || ax - bx;
      });
    const rank = new Map(order.map((ci, r) => [ci, r]));
    // Reduce, not Math.min(...): there are over 100,000 cells.
    const x0 = cells.reduce((m, c) => Math.min(m, c[0]), Number.POSITIVE_INFINITY);
    const y0 = cells.reduce((m, c) => Math.min(m, c[1]), Number.POSITIVE_INFINITY);
    const xs = order.map((ci) => (cells[ci] as [number, number])[0] - x0);
    const ys = order.map((ci) => (cells[ci] as [number, number])[1] - y0);

    const yearList = [...years.keys()].sort((a, b) => a - b);
    const last = yearList.at(-1) ?? FIRST_YEAR;
    const perYear = USES.map(() => [] as number[]);
    const features: Feature[] = [];
    for (const year of yearList) {
      const d: number[] = [];
      const v: number[] = [];
      let prev = 0;
      let count = 0;
      const sorted = [...(years.get(year) ?? [])]
        .map(([ci, uses]) => [rank.get(ci) as number, uses] as const)
        .sort((a, b) => a[0] - b[0]);
      for (const [r, uses] of sorted)
        uses.forEach((k, i) => {
          if (k > 0) {
            d.push(r - prev);
            prev = r;
            v.push(k * USES.length + i);
            count += k;
          }
        });
      features.push({
        type: 'Feature',
        id: `ano-${year}`,
        geometry: null,
        properties: { tipo: 'ano', ano: year, edificios: count, d, v },
      });
    }
    for (let y = FIRST_YEAR; y <= last; y++) {
      const byCell = years.get(y);
      USES.forEach((_, i) => {
        let s = 0;
        if (byCell) for (const uses of byCell.values()) s += uses[i] ?? 0;
        perYear[i]?.push(s);
      });
    }
    features.unshift(
      {
        type: 'Feature',
        id: 'galicia',
        geometry: null,
        properties: {
          tipo: 'galicia',
          actualizado: raw.updated,
          concellos_catastro: raw.municipalities.length,
          edificios: total,
          sen_ano: undated,
          recheo: filler,
          imposibles: impossible,
          antes_1900: before,
          ano_inicio: FIRST_YEAR,
          ano_fin: last,
          usos: [...USES],
          por_ano: Object.fromEntries(USES.map((k, i) => [k, perYear[i]])),
          anos_recheo: fillers,
        },
      },
      {
        type: 'Feature',
        id: 'celas',
        geometry: null,
        properties: { tipo: 'celas', lado_m: CELL_M, fuso: 29, x0, y0, x: xs, y: ys },
      },
    );
    return { collection: { type: 'FeatureCollection', features }, publishedAt: raw.updated };
  },
};

export default adapter;
