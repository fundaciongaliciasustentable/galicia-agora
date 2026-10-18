// The site lives under a sub-folder (site/site.config.json `base`), so every
// own URL goes through asset(). Root-relative paths in generated files
// ("/data/…", "/glyphs/…") are prefixed here, never hard-coded.

const raw: string = import.meta.env.BASE_URL ?? '/';
export const BASE = raw.endsWith('/') ? raw : `${raw}/`;

export function asset(path: string): string {
  return BASE + path.replace(/^\//, '');
}
