import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../lib/auth';

export const prerender = false;

// Health check has two faces:
//  - Public callers (uptime monitors): get a minimal { status } payload.
//  - Authenticated admin: gets the full diagnostic with version, timing, and
//    individual subsystem checks.
// This avoids leaking version strings (CVE matchmaking aid) and dependency
// names to anonymous reconnaissance.
export const GET: APIRoute = async ({ request }) => {
  const start = Date.now();
  const isAdmin = getSessionFromCookie(request.headers.get('cookie'));

  const checks: Record<string, string> = {};
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('tlo-analytics');
    await store.get('_health-probe');
    checks.analytics = 'ok';
  } catch {
    checks.analytics = 'degraded';
  }

  const allOk = Object.values(checks).every(v => v === 'ok' || v === 'degraded');
  const responseTime = Date.now() - start;

  if (!isAdmin) {
    // Anonymous: bare minimum.
    return new Response(JSON.stringify({ status: allOk ? 'ok' : 'error' }), {
      status: allOk ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Admin: full diagnostic.
  return new Response(JSON.stringify({
    status: allOk ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    responseTimeMs: responseTime,
    checks,
  }), {
    status: allOk ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
};
