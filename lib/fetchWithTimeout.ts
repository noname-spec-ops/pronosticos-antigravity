/**
 * FlashStat — Bounded fetch (lib/fetchWithTimeout.ts)
 *
 * Every outbound provider call must be bounded. Without a deadline a single
 * unresponsive upstream hangs the whole request until the serverless function is
 * killed, with no fallback and no error surfaced — which is exactly what happened
 * on the fixtures cascade.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} exceeded ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
  }
}

/**
 * fetch() with a hard deadline. Rejects with FetchTimeoutError on expiry so the
 * caller's catch block runs (a plain AbortError is harder to tell from a real abort).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
