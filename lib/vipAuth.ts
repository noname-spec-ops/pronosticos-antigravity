/**
 * FlashStat — Cryptographic VIP Authentication Service (lib/vipAuth.ts)
 * 
 * Secure HMAC-SHA256 token generation and verification for VIP session cookies.
 * Prevents cookie forgery, tampering, and arbitrary authentication bypass.
 */

import crypto from 'crypto';

const DEFAULT_SECRET = process.env.VIP_AUTH_SECRET || 'flashstat_production_vip_hmac_secret_2026_quant_security';

export function signVipToken(username: string, expiresInSeconds: number = 30 * 24 * 3600): string {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const payload = `${username}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', DEFAULT_SECRET);
  hmac.update(payload);
  const signature = hmac.digest('hex');

  return `${Buffer.from(username).toString('base64url')}.${expiresAt}.${signature}`;
}

export function verifyVipToken(token?: string | null): { valid: boolean; username?: string; reason?: string } {
  if (!token) {
    return { valid: false, reason: 'Lipsește tokenul de sesiune' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'Format token invalid' };
  }

  try {
    const username = Buffer.from(parts[0], 'base64url').toString('utf-8');
    const expiresAt = parseInt(parts[1], 10);
    const signature = parts[2];

    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, reason: 'Sesiunea VIP a expirat' };
    }

    const payload = `${username}:${expiresAt}`;
    const hmac = crypto.createHmac('sha256', DEFAULT_SECRET);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: 'Semnătură criptografică invalidă' };
    }

    return { valid: true, username };
  } catch (err) {
    return { valid: false, reason: 'Eroare la decodarea tokenului' };
  }
}
