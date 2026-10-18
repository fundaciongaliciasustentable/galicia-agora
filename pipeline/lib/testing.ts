// Test helpers: replay recorded source responses (fixtures) through the
// adapter context, so adapters are tested against real data without network.

import { readFile } from 'node:fs/promises';
import type { AdapterContext, LayerDef } from './adapter.ts';
import type { FetchResult } from './http.ts';

/**
 * Build an AdapterContext whose `get` serves files: the first route whose
 * `match` is a substring of the requested URL wins. Unmatched URLs throw.
 */
export function fixtureContext(
  layer: LayerDef,
  routes: Array<{ match: string; file: string; status?: number }>,
  opts: { now?: Date; env?: Record<string, string | undefined> } = {},
): AdapterContext & { requested: string[] } {
  const requested: string[] = [];
  return {
    layer,
    now: opts.now ?? new Date('2026-10-18T08:00:00Z'),
    env: opts.env ?? {},
    requested,
    async get(url: string): Promise<FetchResult> {
      requested.push(url);
      const route = routes.find((r) => url.includes(r.match));
      if (!route) throw new Error(`No fixture for ${url}`);
      const body = await readFile(route.file);
      return {
        url,
        status: route.status ?? 200,
        notModified: false,
        body,
        headers: {},
        etag: null,
        lastModified: null,
        attempts: 1,
      };
    },
  };
}
