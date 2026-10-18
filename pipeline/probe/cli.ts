// Frequency probe for Phase 0. For every source in sources.yaml with a `probe`
// block, fetch once and append one NDJSON line to probe-log/<id>.ndjson with
// the HTTP validators, a body hash and the source's own timestamp (if a regex
// is given). Run on a schedule (probe.yml) to measure real update frequency.
//
//   npm run probe                    # all sources
//   npm run probe -- --source=<id>   # one source
//   npm run probe -- --summary       # print measured intervals from the log

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchWithRetry } from '../lib/http.ts';
import { sha256 } from '../lib/publish.ts';
import { loadYaml } from '../lib/schemas.ts';

interface ProbeCfg {
  url: string;
  timestamp_path?: string;
  env_key?: string;
}
interface Source {
  id: string;
  probe?: ProbeCfg;
}

export interface ProbeLine {
  at: string;
  ok: boolean;
  status: number | null;
  last_modified: string | null;
  etag: string | null;
  hash: string | null;
  source_ts: string | null;
  bytes: number;
  ms: number;
  error?: string;
}

const LOG_DIR = process.env.PROBE_LOG_DIR ?? 'probe-log';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function probeOne(src: Source & { probe: ProbeCfg }): Promise<ProbeLine> {
  const started = Date.now();
  const at = new Date().toISOString();
  let url = src.probe.url;
  if (src.probe.env_key) {
    const key = process.env[src.probe.env_key];
    if (!key) {
      return {
        at,
        ok: false,
        status: null,
        last_modified: null,
        etag: null,
        hash: null,
        source_ts: null,
        bytes: 0,
        ms: 0,
        error: `missing ${src.probe.env_key}`,
      };
    }
    url = url.replace(`{${src.probe.env_key}}`, encodeURIComponent(key));
  }
  try {
    const res = await fetchWithRetry(url, { retries: 2, baseDelayMs: 5000 });
    const text = res.body.toString('utf8');
    let sourceTs: string | null = null;
    if (src.probe.timestamp_path) {
      sourceTs = new RegExp(src.probe.timestamp_path).exec(text)?.[1] ?? null;
    }
    return {
      at,
      ok: true,
      status: res.status,
      last_modified: res.lastModified,
      etag: res.etag,
      hash: sha256(text),
      source_ts: sourceTs,
      bytes: res.body.length,
      ms: Date.now() - started,
    };
  } catch (err) {
    // Never log the URL with a key in it.
    const msg = (err instanceof Error ? err.message : String(err)).replaceAll(url, src.probe.url);
    return {
      at,
      ok: false,
      status: null,
      last_modified: null,
      etag: null,
      hash: null,
      source_ts: null,
      bytes: 0,
      ms: Date.now() - started,
      error: msg,
    };
  }
}

/** Median interval between observed content changes, in minutes. */
export function measuredInterval(lines: ProbeLine[]): {
  changes: number;
  medianMin: number | null;
} {
  const ok = lines.filter((l) => l.ok && l.hash);
  const changeTimes: number[] = [];
  for (let i = 1; i < ok.length; i++) {
    const prev = ok[i - 1];
    const cur = ok[i];
    if (!prev || !cur) continue;
    const changed = cur.source_ts ? cur.source_ts !== prev.source_ts : cur.hash !== prev.hash;
    if (changed) changeTimes.push(Date.parse(cur.at));
  }
  const gaps: number[] = [];
  for (let i = 1; i < changeTimes.length; i++) {
    gaps.push(((changeTimes[i] ?? 0) - (changeTimes[i - 1] ?? 0)) / 60_000);
  }
  gaps.sort((a, b) => a - b);
  const medianMin = gaps.length ? (gaps[Math.floor(gaps.length / 2)] ?? null) : null;
  return { changes: changeTimes.length, medianMin };
}

async function summary(sources: Source[]) {
  for (const s of sources.filter((x) => x.probe)) {
    let lines: ProbeLine[] = [];
    try {
      lines = (await readFile(join(LOG_DIR, `${s.id}.ndjson`), 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as ProbeLine);
    } catch {
      console.log(`${s.id}: no log`);
      continue;
    }
    const fails = lines.filter((l) => !l.ok).length;
    const { changes, medianMin } = measuredInterval(lines);
    console.log(
      `${s.id}: ${lines.length} probes, ${fails} failed, ${changes} changes, median interval ${
        medianMin === null ? 'n/a' : `${medianMin.toFixed(1)} min`
      }`,
    );
  }
}

async function main() {
  const { sources } = await loadYaml<{ sources: Source[] }>('pipeline/sources.yaml');
  if (process.argv.includes('--summary')) return summary(sources);

  const only = arg('source');
  const targets = sources.filter(
    (s): s is Source & { probe: ProbeCfg } => !!s.probe && (!only || s.id === only),
  );
  if (only && targets.length === 0) throw new Error(`No probe configured for source "${only}"`);

  await mkdir(LOG_DIR, { recursive: true });
  // Sequential on purpose: be gentle with public services.
  for (const src of targets) {
    const line = await probeOne(src);
    await appendFile(join(LOG_DIR, `${src.id}.ndjson`), `${JSON.stringify(line)}\n`);
    console.log(
      `${src.id}: ${line.ok ? `ok ${line.status} ${line.bytes}B` : `FAIL ${line.error}`}`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
