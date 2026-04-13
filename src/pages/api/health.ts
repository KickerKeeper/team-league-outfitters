import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const start = Date.now();

  const checks: Record<string, string> = {};

  // Check analytics storage is accessible
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
