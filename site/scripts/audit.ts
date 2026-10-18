// Network audit of the built site: fail if any page, stylesheet, map style or
// script would make the browser load something from another origin.
// Plain links (<a href>) to sources are allowed: they are navigation, not loads.
//
//   tsx site/scripts/audit.ts [dist]

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = process.argv[2] ?? 'dist';
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const problems: string[] = [];
const report = (file: string, what: string) => problems.push(`${file}: ${what}`);

for (const file of walk(ROOT)) {
  const ext = extname(file);
  if (ext === '.html') {
    const html = readFileSync(file, 'utf8');
    // Resource-loading attributes. <a href> is deliberately not checked.
    const patterns: Array<[RegExp, string]> = [
      [/<script[^>]*\ssrc=["']([^"']+)["']/gi, 'script'],
      [/<img[^>]*\ssrc=["']([^"']+)["']/gi, 'img'],
      [/<iframe[^>]*\ssrc=["']([^"']+)["']/gi, 'iframe'],
      [/<source[^>]*\ssrc=["']([^"']+)["']/gi, 'source'],
      [/<link[^>]*\shref=["']([^"']+)["'][^>]*>/gi, 'link'],
    ];
    for (const [re, kind] of patterns) {
      for (const m of html.matchAll(re)) {
        const url = m[1] ?? '';
        // hreflang alternates are links to our own pages, not loads.
        if (kind === 'link' && /rel=["']alternate["']/i.test(m[0])) continue;
        if (ABSOLUTE.test(url)) report(file, `${kind} loads ${url}`);
      }
    }
    for (const m of html.matchAll(/url\(\s*["']?([^"')]+)/gi)) {
      if (ABSOLUTE.test(m[1] ?? '')) report(file, `inline CSS url(${m[1]})`);
    }
  } else if (ext === '.css') {
    const css = readFileSync(file, 'utf8');
    for (const m of css.matchAll(/url\(\s*["']?([^"')]+)/gi)) {
      const url = m[1] ?? '';
      if (ABSOLUTE.test(url)) report(file, `CSS url(${url})`);
    }
    for (const m of css.matchAll(/@import\s+(?:url\()?["']?([^"');]+)/gi)) {
      if (ABSOLUTE.test(m[1] ?? '')) report(file, `CSS @import ${m[1]}`);
    }
  } else if (file.endsWith('style-light.json') || file.endsWith('style-dark.json')) {
    const style = JSON.parse(readFileSync(file, 'utf8')) as {
      glyphs?: string;
      sprite?: string;
      sources: Record<string, { url?: string; tiles?: string[] }>;
    };
    const urls = [
      style.glyphs,
      style.sprite,
      ...Object.values(style.sources).flatMap((s) => [s.url, ...(s.tiles ?? [])]),
    ].filter((u): u is string => !!u);
    for (const u of urls) {
      const stripped = u.replace(/^pmtiles:\/\//, '');
      if (ABSOLUTE.test(stripped)) report(file, `map style loads ${u}`);
    }
  }
}

if (problems.length) {
  console.error(`audit: ${problems.length} third-party load(s) found`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('audit: no third-party resources in the built site');
