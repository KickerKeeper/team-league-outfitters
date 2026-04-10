import { createHmac } from 'node:crypto';

// Default credentials — change these via environment variables in production
const ADMIN_USER = import.meta.env.ADMIN_USER || 'admin';
const ADMIN_PASS = import.meta.env.ADMIN_PASS || 'TLO2026!';
const SESSION_SECRET = import.meta.env.SESSION_SECRET || 'tlo-session-secret-change-me';

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

export function validateCredentials(username: string, password: string): boolean {
  return username === ADMIN_USER && password === ADMIN_PASS;
}

export function createSessionToken(): string {
  const expires = Date.now() + SESSION_DURATION;
  const payload = `${expires}`;
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function validateSession(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, sig] = parts;
  const expectedSig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

  if (sig !== expectedSig) return false;

  const expires = parseInt(payload);
  return Date.now() < expires;
}

export function getSessionFromCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.match(/tlo_session=([^;]+)/);
  if (!match) return false;
  return validateSession(decodeURIComponent(match[1]));
}
