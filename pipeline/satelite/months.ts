// Index of the monthly archives of a satellite layer (data/<id>/archives.json).
// Same file and fields the site already reads for ortofoto-pnoa (ADR 0008):
// `archives` lists what the map draws (here, the latest month only); `months`
// adds every month kept on the server, newest first.

export interface MonthEntry {
  /** "YYYY-MM". */
  month: string;
  /** Archive name next to archives.json: "<YYYY-MM>-<hash>.pmtiles". */
  file: string;
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  tiles: number;
  bytes: number;
  sha256: string;
  /** Share of Galicia without a usable observation that month (0–1). */
  gap_share: number;
  scenes: number;
  first_date: string | null;
  last_date: string | null;
  built_at: string;
}

export interface MonthIndex {
  layer_id: string;
  /** Archives the map draws (ortofoto-pnoa format): the latest month. */
  archives: MonthEntry[];
  /** Every month on the server, newest first. */
  months: MonthEntry[];
}

/**
 * Content-addressed archive name: a rebuilt month gets a new URL, so no
 * browser or server cache serves the old tiles under the new index.
 */
export function archiveName(month: string, sha256: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`bad month ${month}`);
  if (!/^[0-9a-f]{12,}$/.test(sha256)) throw new Error(`bad hash ${sha256}`);
  return `${month}-${sha256.slice(0, 12)}.pmtiles`;
}

export function emptyIndex(layerId: string): MonthIndex {
  return { layer_id: layerId, archives: [], months: [] };
}

/**
 * Add (or replace) a month and keep the newest `keep`. Returns the new index
 * and the archives that fell out (the workflow deletes from the server every
 * archive in neither the new nor the previous index).
 */
export function addMonth(
  index: MonthIndex,
  entry: MonthEntry,
  keep: number,
): { index: MonthIndex; removed: string[] } {
  const others = index.months.filter((m) => m.month !== entry.month);
  const all = [...others, entry].sort((a, b) => b.month.localeCompare(a.month));
  const kept = all.slice(0, keep);
  const removed = [
    ...all.slice(keep).map((m) => m.file),
    ...index.months
      .filter((m) => m.month === entry.month && m.file !== entry.file)
      .map((m) => m.file),
  ];
  return {
    index: { ...index, archives: kept.slice(0, 1), months: kept },
    removed,
  };
}

/** One month's whole-Galicia image (data/<id>/previews.json, files in previews/). */
export interface PreviewEntry {
  month: string;
  /** Path next to previews.json: "previews/<YYYY-MM>-<hash>.webp". */
  file: string;
  width: number;
  height: number;
  bounds: [number, number, number, number];
  gap_share: number;
  scenes: number;
  first_date: string | null;
  last_date: string | null;
}

export interface PreviewIndex {
  layer_id: string;
  /** Oldest first, as the page plays them. */
  previews: PreviewEntry[];
}

/** Add (or replace) a month's image and keep the newest `keep`; returns the files to delete. */
export function addPreview(
  index: PreviewIndex,
  entry: PreviewEntry,
  keep: number,
): { index: PreviewIndex; removed: string[] } {
  const others = index.previews.filter((p) => p.month !== entry.month);
  const all = [...others, entry].sort((a, b) => a.month.localeCompare(b.month));
  const kept = all.slice(Math.max(0, all.length - keep));
  const keptFiles = new Set(kept.map((p) => p.file));
  const removed = [...index.previews, entry]
    .map((p) => p.file)
    .filter((f, i, a) => !keptFiles.has(f) && a.indexOf(f) === i);
  return { index: { ...index, previews: kept }, removed };
}
