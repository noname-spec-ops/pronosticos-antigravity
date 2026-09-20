/**
 * FlashStat — Football Scores & AI Betting Radar
 * In-Memory Server-Side Cache with Stale-While-Revalidate (SWR),
 * Request Coalescing (Thundering Herd Protection), and LRU Pruning.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number; // Date.now() when cached
  ttlMs: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private maxEntries: number = 5000;

  constructor(maxEntries: number = 5000) {
    this.maxEntries = maxEntries;

    // Prune expired entries every 3 minutes
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        this.pruneExpired();
      }, 3 * 60 * 1000);
    }
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > entry.ttlMs * 2) {
        this.store.delete(key);
      }
    }
  }

  private ensureCapacity(): void {
    if (this.store.size >= this.maxEntries) {
      // Remove oldest 20% of entries
      const toDelete = Math.ceil(this.maxEntries * 0.2);
      let count = 0;
      for (const key of this.store.keys()) {
        this.store.delete(key);
        count++;
        if (count >= toDelete) break;
      }
    }
  }

  /**
   * Sets an item in cache with TTL in seconds.
   */
  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.ensureCapacity();
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs: ttlSeconds * 1000,
    });
  }

  /**
   * Gets an item if fresh. Returns null if expired or not found.
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttlMs;
    if (isExpired) return null;

    return entry.data;
  }

  /**
   * Stale-While-Revalidate wrapper with request coalescing:
   * 1. Returns fresh data immediately if within TTL.
   * 2. If stale data is present, returns stale data immediately and triggers
   *    a coalesced background fetcher to update the cache.
   * 3. If missing completely, coalesces requests to execute fetcher once.
   */
  async swr<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
  ): Promise<{ data: T; isStale: boolean; cachedAt: string }> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;

    if (entry) {
      const isFresh = Date.now() - entry.timestamp <= entry.ttlMs;
      if (isFresh) {
        return {
          data: entry.data,
          isStale: false,
          cachedAt: new Date(entry.timestamp).toISOString(),
        };
      }

      // Stale data exists: trigger non-blocking coalesced background revalidation
      if (!this.inflight.has(key)) {
        const bgPromise = fetcher()
          .then((fresh) => {
            this.set(key, fresh, ttlSeconds);
            return fresh;
          })
          .catch((err) => {
            console.warn(`[Cache:SWR] Background revalidation failed for "${key}":`, (err as Error).message);
            return entry.data;
          })
          .finally(() => {
            this.inflight.delete(key);
          });
        this.inflight.set(key, bgPromise);
      }

      return {
        data: entry.data,
        isStale: true,
        cachedAt: new Date(entry.timestamp).toISOString(),
      };
    }

    // Missing from cache: coalesced blocking fetch
    if (this.inflight.has(key)) {
      const ongoing = (await this.inflight.get(key)) as T;
      return {
        data: ongoing,
        isStale: false,
        cachedAt: new Date().toISOString(),
      };
    }

    const fetchPromise = fetcher()
      .then((fresh) => {
        this.set(key, fresh, ttlSeconds);
        return fresh;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, fetchPromise);

    try {
      const freshData = await fetchPromise;
      return {
        data: freshData,
        isStale: false,
        cachedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Invalidates a specific key or keys matching prefix.
   */
  invalidate(keyOrPrefix: string): void {
    for (const k of this.store.keys()) {
      if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
        this.store.delete(k);
      }
    }
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }
}

export const serverCache = new MemoryCache();
