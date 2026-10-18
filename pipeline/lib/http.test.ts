import { describe, expect, it } from 'vitest';
import { backoffDelay, fetchWithRetry, HttpError, USER_AGENT } from './http.ts';

function fakeFetch(responses: Array<Response | Error>) {
  const calls: RequestInit[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const noSleep = async () => {};

describe('fetchWithRetry', () => {
  it('sends the identifiable User-Agent and conditional headers', async () => {
    const { impl, calls } = fakeFetch([
      new Response('ok', { status: 200, headers: { etag: '"b"' } }),
    ]);
    const res = await fetchWithRetry('https://x.test/a', {
      fetchImpl: impl,
      etag: '"a"',
      lastModified: 'Sat, 18 Oct 2026 08:00:00 GMT',
    });
    const h = calls[0]?.headers as Record<string, string>;
    expect(h['user-agent']).toBe(USER_AGENT);
    expect(h['if-none-match']).toBe('"a"');
    expect(h['if-modified-since']).toBe('Sat, 18 Oct 2026 08:00:00 GMT');
    expect(res.etag).toBe('"b"');
    expect(res.body.toString()).toBe('ok');
  });

  it('reports 304 as notModified with an empty body', async () => {
    const { impl } = fakeFetch([new Response(null, { status: 304 })]);
    const res = await fetchWithRetry('https://x.test/a', { fetchImpl: impl });
    expect(res.notModified).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('retries 5xx and network errors, then succeeds', async () => {
    const { impl, calls } = fakeFetch([
      new Response('', { status: 503 }),
      new TypeError('fetch failed'),
      new Response('ok', { status: 200 }),
    ]);
    const res = await fetchWithRetry('https://x.test/a', { fetchImpl: impl, sleep: noSleep });
    expect(res.attempts).toBe(3);
    expect(calls).toHaveLength(3);
  });

  it('does not retry a 403', async () => {
    const { impl, calls } = fakeFetch([new Response('', { status: 403 })]);
    await expect(
      fetchWithRetry('https://x.test/a', { fetchImpl: impl, sleep: noSleep }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it('gives up after the configured retries', async () => {
    const { impl, calls } = fakeFetch([
      new Response('', { status: 500 }),
      new Response('', { status: 500 }),
    ]);
    await expect(
      fetchWithRetry('https://x.test/a', { fetchImpl: impl, sleep: noSleep, retries: 1 }),
    ).rejects.toThrow(/Failed after 2 attempts/);
    expect(calls).toHaveLength(2);
  });
});

describe('backoffDelay', () => {
  it('doubles per attempt and honours Retry-After', () => {
    expect(backoffDelay(0, 1000)).toBe(1000);
    expect(backoffDelay(2, 1000)).toBe(4000);
    expect(backoffDelay(0, 1000, '30')).toBe(30_000);
  });
});
