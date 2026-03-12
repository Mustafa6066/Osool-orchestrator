/**
 * JWT authentication helpers for the Admin Dashboard.
 * Admin-only: not consumer-facing.
 */

import jwt from 'jsonwebtoken';
import { getConfig } from '../config.js';

const TOKEN_EXPIRY = '30m';
const REFRESH_EXPIRY = '7d';

export interface AdminTokenPayload {
  sub: string;   // admin email
  role: 'admin';
  iat: number;
  exp: number;
}

/** Sign a new access token. */
export function signAccessToken(email: string): string {
  const secret = getConfig().ADMIN_JWT_SECRET ?? 'dev-secret-change-in-production';
  return jwt.sign({ sub: email, role: 'admin' }, secret, { expiresIn: TOKEN_EXPIRY });
}

/** Sign a refresh token (longer lived). */
export function signRefreshToken(email: string): string {
  const secret = getConfig().ADMIN_JWT_SECRET ?? 'dev-secret-change-in-production';
  return jwt.sign({ sub: email, role: 'admin', type: 'refresh' }, secret, { expiresIn: REFRESH_EXPIRY });
}

/** Verify and decode an access token. Returns null if invalid, expired, or is a refresh token. */
export function verifyAccessToken(token: string): AdminTokenPayload | null {
  try {
    const secret = getConfig().ADMIN_JWT_SECRET ?? 'dev-secret-change-in-production';
    const payload = jwt.verify(token, secret) as AdminTokenPayload & { type?: string };
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
    const secret = getConfig().ADMIN_JWT_SECRET ?? 'dev-secret-change-in-production';
    const payload = jwt.verify(token, secret) as AdminTokenPayload & { type?: string };
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
 * Simple constant-time string comparison to prevent timing attacks
 * when checking webhook secrets and API keys.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
