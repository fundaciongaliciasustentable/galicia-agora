// HTTP client shared by probes and adapters: identifiable User-Agent,
// exponential backoff, and conditional requests (ETag / Last-Modified).

export const USER_AGENT =
  'GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; galiciasustentable@galiciasustentable.org)';

export interface FetchOptions {
  etag?: string | null;
  lastModified?: string | null;
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface FetchResult {
  url: string;
  status: number;
  notModified: boolean;
  body: Buffer;
  headers: Record<string, string>;
  etag: string | null;
  lastModified: string | null;
  attempts: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 408, 429 and 5xx are worth retrying; other 4xx are our fault or a policy refusal.
export function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function backoffDelay(attempt: number, baseDelayMs: number, retryAfter?: string | null) {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 5 * 60_000);
  }
  return baseDelayMs * 2 ** attempt;
}

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const {
    retries = 3,
    baseDelayMs = 2000,
    timeoutMs = 60_000,
    fetchImpl = fetch,
    sleep = defaultSleep,
  } = opts;

  const headers: Record<string, string> = { 'user-agent': USER_AGENT, ...opts.headers };
  if (opts.etag) headers['if-none-match'] = opts.etag;
  if (opts.lastModified) headers['if-modified-since'] = opts.lastModified;

  let lastError: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      lastStatus = res.status;
      const plainHeaders = Object.fromEntries(res.headers.entries());

      if (res.status === 304 || res.ok) {
        const body = res.status === 304 ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
        return {
          url,
          status: res.status,
          notModified: res.status === 304,
          body,
          headers: plainHeaders,
          etag: res.headers.get('etag'),
          lastModified: res.headers.get('last-modified'),
          attempts: attempt + 1,
        };
      }

      if (!isRetryable(res.status)) {
        throw new HttpError(`HTTP ${res.status} for ${url}`, res.status, attempt + 1);
      }
      lastError = new HttpError(`HTTP ${res.status} for ${url}`, res.status, attempt + 1);
      if (attempt < retries) {
        await sleep(backoffDelay(attempt, baseDelayMs, res.headers.get('retry-after')));
      }
    } catch (err) {
      if (err instanceof HttpError && err.status !== null && !isRetryable(err.status)) throw err;
      lastError = err;
      if (attempt < retries) await sleep(backoffDelay(attempt, baseDelayMs));
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new HttpError(`Failed after ${retries + 1} attempts: ${msg}`, lastStatus, retries + 1);
}
