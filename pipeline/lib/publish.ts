// Failure policy: keep the last good file, mark stale, never overwrite with
// empty or invalid data. The decision is a pure function so it can be tested
// without touching the network or the disk.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type Status = 'fresh' | 'stale' | 'failed';

export interface HistoryEntry {
  at: string;
  ok: boolean;
  error?: string;
}

export interface Meta {
  layer_id: string;
  published_at: string | null;
  fetched_at: string;
  last_success_at: string | null;
  status: Status;
  consecutive_failures: number;
  feature_count: number;
  source_url: string;
  licence: string;
  attribution: string;
  checksum: string | null;
  last_error: string | null;
  history: HistoryEntry[];
}

export interface Attempt {
  layerId: string;
  at: Date;
  sourceUrl: string;
  licence: string;
  attribution: string;
  /** Present when fetch + normalize succeeded. */
  data?: { body: string | Buffer; featureCount: number; publishedAt: string | null };
  /** Result of schema validation on the normalized data. */
  validationErrors?: string[];
  /** Fetch/normalize error, if any. */
  error?: string;
  /**
   * Layers whose count legitimately swings to zero (fire detections, trains at
   * night): an empty result or a large drop is data, not an anomaly.
   */
  volatile?: boolean;
}

export interface Decision {
  write: boolean;
  meta: Meta;
}

/** A drop larger than this fraction versus the last good count is treated as anomalous. */
export const ANOMALOUS_DROP = 0.5;
const HISTORY_WINDOW_MS = 7 * 24 * 3600_000;

export function sha256(body: string | Buffer): string {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

function rejectReason(attempt: Attempt, prev: Meta | null): string | null {
  if (attempt.error) return attempt.error;
  if (!attempt.data) return 'no data returned';
  if (attempt.validationErrors?.length) {
    return `schema validation failed: ${attempt.validationErrors.slice(0, 3).join('; ')}`;
  }
  if (attempt.volatile) return null;
  if (attempt.data.featureCount === 0) return 'empty result (0 features)';
  if (prev && prev.feature_count > 0) {
    const ratio = attempt.data.featureCount / prev.feature_count;
    if (ratio < 1 - ANOMALOUS_DROP) {
      return `anomalous drop: ${attempt.data.featureCount} features vs ${prev.feature_count} last good`;
    }
  }
  return null;
}

export function decide(attempt: Attempt, prev: Meta | null): Decision {
  const at = attempt.at.toISOString();
  const reason = rejectReason(attempt, prev);
  const cutoff = attempt.at.getTime() - HISTORY_WINDOW_MS;
  const history = [
    reason ? { at, ok: false, error: reason } : { at, ok: true },
    ...(prev?.history ?? []),
  ].filter((h) => Date.parse(h.at) >= cutoff);

  if (reason === null && attempt.data) {
    return {
      write: true,
      meta: {
        layer_id: attempt.layerId,
        published_at: attempt.data.publishedAt,
        fetched_at: at,
        last_success_at: at,
        status: 'fresh',
        consecutive_failures: 0,
        feature_count: attempt.data.featureCount,
        source_url: attempt.sourceUrl,
        licence: attempt.licence,
        attribution: attempt.attribution,
        checksum: sha256(attempt.data.body),
        last_error: null,
        history,
      },
    };
  }

  // Rejected: keep whatever we had. Without a previous good file, there is
  // nothing to show, so the layer is 'failed' rather than 'stale'.
  return {
    write: false,
    meta: {
      layer_id: attempt.layerId,
      published_at: prev?.published_at ?? null,
      fetched_at: at,
      last_success_at: prev?.last_success_at ?? null,
      status: prev?.checksum ? 'stale' : 'failed',
      consecutive_failures: (prev?.consecutive_failures ?? 0) + 1,
      feature_count: prev?.feature_count ?? 0,
      source_url: attempt.sourceUrl,
      licence: attempt.licence,
      attribution: attempt.attribution,
      checksum: prev?.checksum ?? null,
      last_error: reason,
      history,
    },
  };
}

/** A fresh layer becomes stale once its last success is older than staleAfterMs. */
export function ageStatus(meta: Meta, now: Date, staleAfterMs: number): Status {
  if (!meta.last_success_at) return 'failed';
  if (meta.status === 'failed') return 'failed';
  return now.getTime() - Date.parse(meta.last_success_at) > staleAfterMs ? 'stale' : meta.status;
}

/** Freshness alert: the layer has been stale for more than `cycles` update cycles. */
export function needsAlert(meta: Meta, now: Date, cycleMs: number, cycles = 3): boolean {
  if (!meta.last_success_at) return meta.consecutive_failures >= cycles;
  return now.getTime() - Date.parse(meta.last_success_at) > cycles * cycleMs;
}

export async function writeAtomic(path: string, content: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${Date.now()}.${process.pid}.tmp`);
  await writeFile(tmp, content);
  await rename(tmp, path);
}

export async function readMeta(path: string): Promise<Meta | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Meta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Apply a decision on disk: data file first (only if accepted), then meta. */
export async function publish(
  attempt: Attempt,
  dataPath: string,
  metaPath: string,
): Promise<Decision> {
  const prev = await readMeta(metaPath);
  const decision = decide(attempt, prev);
  if (decision.write && attempt.data) await writeAtomic(dataPath, attempt.data.body);
  await writeAtomic(metaPath, `${JSON.stringify(decision.meta, null, 2)}\n`);
  return decision;
}
