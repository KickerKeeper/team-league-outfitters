// Rate limiter with two tiers:
//  1. checkRateLimit() — in-memory, per-instance. Fast path; resets on cold start.
//     Suitable for backstop limits where some leakage is OK.
//  2. checkDurableRateLimit() — Netlify Blobs–backed. Survives cold starts,
//     and (mostly) consistent across function instances. Use for security-
//     critical endpoints like /api/auth/login.
import { getStore } from '@netlify/blobs';

const requests = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now();
  const entry = requests.get(ip);

  if (!entry || now > entry.resetAt) {
    requests.set(ip, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= maxRequests) {
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

export function getClientIp(request: Request): string {
  // Only trust Netlify's own header — never the client-supplied X-Forwarded-For,
  // which can be spoofed to bypass per-IP limits.
  return request.headers.get('x-nf-client-connection-ip') || 'unknown';
}

const RL_STORE = 'tlo-ratelimit';

interface DurableEntry {
  count: number;
  resetAt: number;
}

// Durable rate limit. `bucket` is a logical name (e.g. 'login') and `key` is the
// actor identifier (e.g. an IP). Returns true if the request is allowed.
//
// Note: there's a small race window between read-and-write under high concurrency,
// so the cap is approximate. That's fine for throttling brute force — the goal is
// to slow attackers from millions of attempts/min to a handful.
export async function checkDurableRateLimit(
  bucket: string,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  const blobKey = `${bucket}/${key}`;
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(RL_STORE);
  } catch {
    // If blobs are unavailable, fall through to the in-memory limiter.
    return checkRateLimit(`${bucket}:${key}`, maxRequests, windowMs);
  }

  let entry: DurableEntry | null = null;
  try {
    const raw = await store.get(blobKey);
    if (raw) entry = JSON.parse(raw) as DurableEntry;
  } catch { /* treat as no entry */ }

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
  } else {
    if (entry.count >= maxRequests) {
      return false;
    }
    entry.count++;
  }

  try {
    await store.set(blobKey, JSON.stringify(entry));
  } catch { /* best-effort write */ }

  return true;
}
