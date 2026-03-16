/**
 * JWT authentication helpers for the Admin Dashboard.
 * Admin-only: not consumer-facing.
 */

import jwt from 'jsonwebtoken';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getConfig } from '../config.js';

const TOKEN_EXPIRY = '30m';
const REFRESH_EXPIRY = '7d';

/** Get the admin JWT secret. Throws if not configured. */
function getAdminSecret(): string {
  const secret = getConfig().ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET is not configured — cannot sign or verify admin tokens');
  }
  return secret;
}

export interface AdminTokenPayload {
  sub: string;   // admin email
  role: 'admin';
  iat: number;
  exp: number;
}

/** Sign a new access token. */
export function signAccessToken(email: string): string {
  return jwt.sign({ sub: email, role: 'admin' }, getAdminSecret(), { expiresIn: TOKEN_EXPIRY });
}

/** Sign a refresh token (longer lived). */
export function signRefreshToken(email: string): string {
  return jwt.sign({ sub: email, role: 'admin', type: 'refresh' }, getAdminSecret(), { expiresIn: REFRESH_EXPIRY });
}

/** Verify and decode an access token. Returns null if invalid, expired, or is a refresh token. */
export function verifyAccessToken(token: string): AdminTokenPayload | null {
  try {
    const payload = jwt.verify(token, getAdminSecret()) as AdminTokenPayload & { type?: string };
    if (payload.role !== 'admin') return null;
    // Reject refresh tokens presented as access tokens
    if (payload.type === 'refresh') return null;
    return payload;
  } catch {
    return null;
  }
}

/** Verify and decode a refresh token. Returns null if invalid, expired, or is an access token. */
export function verifyRefreshToken(token: string): AdminTokenPayload | null {
  try {
    const payload = jwt.verify(token, getAdminSecret()) as AdminTokenPayload & { type?: string };
    if (payload.role !== 'admin') return null;
    // Refresh tokens must have type: 'refresh'
    if (payload.type !== 'refresh') return null;
    return payload;
  } catch {
    return null;
  }
}

/** Extract token from Authorization header (Bearer scheme). */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Constant-time string comparison using Node.js crypto.timingSafeEqual.
 * Prevents timing attacks when checking webhook secrets and API keys.
 * Uses HMAC to normalize lengths so no length information is leaked.
 */
export function safeCompare(a: string, b: string): boolean {
  const key = 'osool-safe-compare';
  const hmacA = createHmac('sha256', key).update(a).digest();
  const hmacB = createHmac('sha256', key).update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}

// ── Osool Platform JWT (SSO-lite) ────────────────────────────────────────────

export interface PlatformTokenPayload {
  sub: string;   // user email
  role: string;  // e.g. 'investor', 'admin'
  jti: string;
  iat: number;
  exp: number;
}

/**
 * Verify a JWT issued by the Osool Platform backend.
 * Requires PLATFORM_JWT_SECRET to be set; returns null if not configured or invalid.
 */
export function verifyPlatformToken(token: string): PlatformTokenPayload | null {
  const secret = getConfig().PLATFORM_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as PlatformTokenPayload;
    if (!payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}
