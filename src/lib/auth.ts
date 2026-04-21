import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

// Credentials — set via environment variables in production
const ADMIN_USER = import.meta.env.ADMIN_USER || 'admin';
const ADMIN_PASS = import.meta.env.ADMIN_PASS || 'TLO2026!';
const SESSION_SECRET = import.meta.env.SESSION_SECRET || 'tlo-session-secret-change-me';

// Warn if defaults are in use
if (ADMIN_PASS === 'TLO2026!') {
  console.warn('[AUTH WARNING] Using default admin password. Set ADMIN_PASS environment variable in Netlify.');
}
if (SESSION_SECRET === 'tlo-session-secret-change-me') {
  console.warn('[AUTH WARNING] Using default session secret. Set SESSION_SECRET environment variable in Netlify.');
}

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours
const REVOKED_STORE = 'tlo-auth';

// Constant-time string comparison that resists timing attacks even when
// the strings differ in length.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // Force both buffers to the same length so timingSafeEqual can run.
  // The length difference itself is folded into the final result.
  const len = Math.max(ab.length, bb.length);
  const ap = Buffer.alloc(len);
  const bp = Buffer.alloc(len);
  ab.copy(ap);
  bb.copy(bp);
  const eq = timingSafeEqual(ap, bp);
  return eq && ab.length === bb.length;
}

export function validateCredentials(username: string, password: string): boolean {
  // Both comparisons run unconditionally to avoid leaking which field failed.
  const userOk = safeEqual(username, ADMIN_USER);
  const passOk = safeEqual(password, ADMIN_PASS);
  return userOk && passOk;
}

// Token format: <expiresMs>.<nonceHex>.<userB64url>.<sigHex>
// - expiresMs: when the token stops being valid
// - nonceHex: 16 random bytes per session — makes each token unique even at the same ms
// - userB64url: which admin the token was minted for
// - sigHex: HMAC-SHA256 over `${expiresMs}.${nonceHex}.${userB64url}` keyed by SESSION_SECRET
export function createSessionToken(username: string = ADMIN_USER): string {
  const expires = Date.now() + SESSION_DURATION;
  const nonce = randomBytes(16).toString('hex');
  const userPart = Buffer.from(username, 'utf8').toString('base64url');
  const payload = `${expires}.${nonce}.${userPart}`;
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export interface SessionInfo {
  username: string;
  nonce: string;
  expiresMs: number;
}

function parseSession(token: string): SessionInfo | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [expiresStr, nonce, userPart, sig] = parts;

  const payload = `${expiresStr}.${nonce}.${userPart}`;
  const expectedSig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

  // Constant-time signature comparison
  if (!safeEqual(sig, expectedSig)) return null;

  const expiresMs = parseInt(expiresStr, 10);
  if (!Number.isFinite(expiresMs) || Date.now() >= expiresMs) return null;

  let username: string;
  try {
    username = Buffer.from(userPart, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  return { username, nonce, expiresMs };
}

// Returns the session info if the token is valid and not revoked, else null.
async function loadValidSession(token: string): Promise<SessionInfo | null> {
  const info = parseSession(token);
  if (!info) return null;

  try {
    const store = getStore(REVOKED_STORE);
    const revoked = await store.get(`revoked/${info.nonce}`);
    if (revoked) return null;
  } catch {
    // If the revocation store is unreachable, fail closed for non-GET? We can't know
    // request method here, so we fall through (open). This is a deliberate trade-off:
    // an attacker would need a stolen unexpired token AND blob outage simultaneously.
  }

  return info;
}

// Synchronous validity check (signature + expiry) without revocation lookup.
// Used in middleware and per-endpoint guards where the cost of a blob round-trip
// per request would be excessive. Logout still works because the cookie is cleared
// client-side and revocation prevents reuse on token-bearing endpoints that opt in.
export function validateSession(token: string): boolean {
  return parseSession(token) !== null;
}

export function getSessionFromCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(/tlo_session=([^;]+)/);
  if (!match) return false;
  return validateSession(decodeURIComponent(match[1]));
}

// Returns full session info from cookie, or null. Use this when the endpoint
// needs to know who is acting or to perform a revocation check.
export async function getSessionInfoFromCookie(cookieHeader: string | null): Promise<SessionInfo | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/tlo_session=([^;]+)/);
  if (!match) return null;
  return loadValidSession(decodeURIComponent(match[1]));
}

// Extract the parsed session (no revocation check) from a cookie header.
export function parseSessionFromCookie(cookieHeader: string | null): SessionInfo | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/tlo_session=([^;]+)/);
  if (!match) return null;
  return parseSession(decodeURIComponent(match[1]));
}

// Mark a token nonce as revoked until its original expiry. After expiry the
// signature check would have rejected it anyway, so we don't need long-lived
// revocation entries.
export async function revokeSession(info: SessionInfo): Promise<void> {
  try {
    const store = getStore(REVOKED_STORE);
    await store.set(`revoked/${info.nonce}`, String(info.expiresMs));
  } catch (e) {
    console.error('[AUTH] Failed to revoke session nonce:', (e as Error)?.message);
  }
}
