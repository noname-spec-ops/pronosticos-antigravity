import { describe, it, expect } from 'vitest';
import { serverCache } from '../../lib/cache';

describe('ETAPA C — Infrastructure, Cache Coalescing & Performance', () => {
  it('coalesces concurrent requests to prevent thundering herd on missing cache keys', async () => {
    let fetchCount = 0;
    const key = 'test:coalescing:key';
    serverCache.invalidate(key);

    const fetcher = async () => {
      fetchCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { result: 'coalesced_data', time: Date.now() };
    };

    // Trigger 5 concurrent requests simultaneously
    const results = await Promise.all([
      serverCache.swr(key, 60, fetcher),
      serverCache.swr(key, 60, fetcher),
      serverCache.swr(key, 60, fetcher),
      serverCache.swr(key, 60, fetcher),
      serverCache.swr(key, 60, fetcher),
    ]);

    expect(fetchCount).toBe(1);
    expect(results.length).toBe(5);
    expect(results[0].data.result).toBe('coalesced_data');
  });

  it('returns stale data immediately on expired entries and updates in the background', async () => {
    const key = 'test:swr:stale:key';
    serverCache.invalidate(key);

    // Initial cache with 0.05s TTL
    let version = 1;
    await serverCache.swr(key, 0.05, async () => ({ version: version++ }));

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Next request should return stale data immediately with isStale: true
    const staleResult = await serverCache.swr(key, 60, async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { version: version++ };
    });

    expect(staleResult.data.version).toBe(1);
    expect(staleResult.isStale).toBe(true);

    // Wait for background promise to finish updating cache
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Subsequent read gets the revalidated version
    const freshResult = await serverCache.swr(key, 60, async () => ({ version: 99 }));
    expect(freshResult.data.version).toBe(2);
    expect(freshResult.isStale).toBe(false);
  });
});
