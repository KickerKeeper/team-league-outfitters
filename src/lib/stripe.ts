import Stripe from 'stripe';
import { createHmac, timingSafeEqual } from 'node:crypto';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  cached = new Stripe(key, { apiVersion: '2024-12-18.acacia' as any });
  return cached;
}

export function isStripeConfigured(): boolean {
  return !!import.meta.env.STRIPE_SECRET_KEY;
}

export function getWebhookSecret(): string {
  const secret = import.meta.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

export function getSiteUrl(): string {
  return import.meta.env.SITE_URL || import.meta.env.URL || 'https://gtownjerseys.com';
}

// Per-checkout HMAC cookie. Set by /api/checkout/create-session, verified by
// /order/success so a third party who learns a session_id (browser history,
// referrer, screen-share) can't view another customer's confirmation page.
//
// Format: <issuedMs>.<sigHex>  where sig = HMAC-SHA256(`${sessionId}.${issuedMs}`)
// keyed by SESSION_SECRET (re-used for convenience; the secret never appears
// in the cookie value or any URL).
const CHECKOUT_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — Stripe Checkout times out before this

function checkoutKey(): string {
  return import.meta.env.SESSION_SECRET || 'tlo-session-secret-change-me';
}

export function signCheckoutToken(sessionId: string): string {
  const issued = Date.now();
  const sig = createHmac('sha256', checkoutKey()).update(`${sessionId}.${issued}`).digest('hex');
  return `${issued}.${sig}`;
}

export function verifyCheckoutToken(sessionId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [issuedStr, sig] = parts;
  const issued = parseInt(issuedStr, 10);
  if (!Number.isFinite(issued)) return false;
  if (Date.now() - issued > CHECKOUT_TOKEN_TTL_MS) return false;

  const expected = createHmac('sha256', checkoutKey()).update(`${sessionId}.${issued}`).digest('hex');
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function readCheckoutCookie(cookieHeader: string | null, sessionId: string): boolean {
  if (!cookieHeader) return false;
  // Per-session cookie name keeps multiple in-flight checkouts from clobbering
  // each other (rare for this site, but cheap to support).
  const safeId = sessionId.replace(/[^A-Za-z0-9_-]/g, '');
  const re = new RegExp(`tlo_checkout_${safeId}=([^;]+)`);
  const m = cookieHeader.match(re);
  if (!m) return false;
  return verifyCheckoutToken(sessionId, decodeURIComponent(m[1]));
}

export function checkoutCookieName(sessionId: string): string {
  const safeId = sessionId.replace(/[^A-Za-z0-9_-]/g, '');
  return `tlo_checkout_${safeId}`;
}
