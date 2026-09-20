interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipRequestMap = new Map<string, RateLimitRecord>();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipRequestMap.entries()) {
      if (now > record.resetTime) {
        ipRequestMap.delete(ip);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Checks if an IP has exceeded the allowed number of requests in a sliding time window.
 */
export function checkRateLimit(
  ip: string,
  limit: number = 60,
  windowSeconds: number = 60
): { isAllowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const record = ipRequestMap.get(ip);

  if (!record || now > record.resetTime) {
    ipRequestMap.set(ip, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      isAllowed: true,
      remaining: limit - 1,
      resetInSeconds: windowSeconds,
    };
  }

  if (record.count >= limit) {
    const resetInSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    return {
      isAllowed: false,
      remaining: 0,
      resetInSeconds,
    };
  }

  record.count += 1;
  const resetInSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
  return {
    isAllowed: true,
    remaining: limit - record.count,
    resetInSeconds,
  };
}

export class RateLimiter {
  private lastCallTime: number = 0;
  private minIntervalMs: number;
  private quotaExhausted: boolean = false;
  private quotaResetTime: number = 0;

  constructor(callsPerMinute: number = 60) {
    this.minIntervalMs = Math.ceil(60000 / callsPerMinute);
  }

  public isQuotaExhausted(): boolean {
    if (this.quotaExhausted && Date.now() > this.quotaResetTime) {
      this.quotaExhausted = false;
    }
    return this.quotaExhausted;
  }

  public markQuotaExhausted(cooldownHours: number = 6) {
    this.quotaExhausted = true;
    this.quotaResetTime = Date.now() + cooldownHours * 60 * 60 * 1000;
  }

  async executeWithBackoff<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    if (this.isQuotaExhausted()) {
      throw new Error('RateLimiter: Daily API Quota is marked exhausted');
    }

    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastCallTime = Date.now();

    let attempts = 0;
    while (attempts < maxRetries) {
      try {
        const result = await fn();
        // Check if returned object is an HTTP Response with status 429
        if (result && typeof result === 'object' && 'status' in result && (result as any).status === 429) {
          this.markQuotaExhausted(6);
          throw new Error('HTTP 429 Too Many Requests (Response object)');
        }
        return result;
      } catch (err: any) {
        attempts++;
        if (err?.status === 429 || err?.response?.status === 429 || err?.message?.includes('429')) {
          this.markQuotaExhausted(6); // Automatically trip circuit breaker for 6 hours
          const backoff = Math.pow(2, attempts) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoff));
        } else if (attempts >= maxRetries) {
          throw err;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempts));
        }
      }
    }
    throw new Error('RateLimiter: Maximum retries exceeded');
  }
}

// Set to 10 calls/min matching API-Football free tier quota
export const apiFootballRateLimiter = new RateLimiter(10);


