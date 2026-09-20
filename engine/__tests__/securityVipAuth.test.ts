import { describe, it, expect } from 'vitest';
import { signVipToken, verifyVipToken } from '../../lib/vipAuth';
import { checkRateLimit } from '../../lib/rateLimiter';

describe('ETAPA B — Security & Cryptographic VIP Authentication', () => {
  it('generates and verifies valid HMAC-SHA256 signed VIP tokens', () => {
    const username = 'QUANT_PRO';
    const token = signVipToken(username, 3600);

    const result = verifyVipToken(token);
    expect(result.valid).toBe(true);
    expect(result.username).toBe(username);
  });

  it('rejects forged unsigned or tampered tokens', () => {
    // 1. Plain text forgery attempt
    const forgedPlain = 'authenticated';
    expect(verifyVipToken(forgedPlain).valid).toBe(false);

    // 2. Tampered signature attempt
    const validToken = signVipToken('ADMIN', 3600);
    const parts = validToken.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.0000000000000000000000000000000000000000000000000000000000000000`;
    expect(verifyVipToken(tamperedToken).valid).toBe(false);
  });

  it('rejects expired tokens', () => {
    // Generate token expired 10 seconds ago
    const expiredToken = signVipToken('EXPIRED_USER', -10);
    const result = verifyVipToken(expiredToken);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expirat');
  });

  it('enforces IP rate limiting and sliding window reset', () => {
    const testIp = '192.168.100.50';
    const limit = 5;

    // First 5 requests should pass
    for (let i = 0; i < limit; i++) {
      const res = checkRateLimit(testIp, limit, 10);
      expect(res.isAllowed).toBe(true);
    }

    // 6th request must be blocked
    const blockedRes = checkRateLimit(testIp, limit, 10);
    expect(blockedRes.isAllowed).toBe(false);
    expect(blockedRes.remaining).toBe(0);
    expect(blockedRes.resetInSeconds).toBeGreaterThan(0);
  });
});
