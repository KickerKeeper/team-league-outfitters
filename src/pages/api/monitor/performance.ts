import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';
import { getSessionFromCookie } from '../../../lib/auth';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

const STORE_NAME = 'tlo-performance';

function num(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 600_000) return null; // reject NaN, negative, >10min
  return Math.round(n);
}

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request) || 'unknown';
  if (!checkRateLimit(`monitor-perf:${ip}`, 30, 60 * 1000)) {
    return new Response(null, { status: 429 });
  }

  try {
    const body = await request.json();
    const url = typeof body?.url === 'string' ? body.url.slice(0, 500) : '';
    const ttfb = num(body?.ttfb);
    const domLoad = num(body?.domLoad);
    const fullLoad = num(body?.fullLoad);

    if (!url || (ttfb === null && domLoad === null && fullLoad === null)) {
      return new Response(null, { status: 400 });
    }

    const store = getStore(STORE_NAME);
    const today = new Date().toISOString().split('T')[0];
    const key = `${today}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await store.setJSON(key, {
      url,
      ttfb,
      domLoad,
      fullLoad,
      timestamp: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed' }), { status: 500 });
  }
};

export const GET: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const store = getStore(STORE_NAME);
    const today = new Date().toISOString().split('T')[0];
    const { blobs } = await store.list({ prefix: today });

    const metrics: { ttfb: number[]; domLoad: number[]; fullLoad: number[] } = {
      ttfb: [], domLoad: [], fullLoad: [],
    };

    for (const blob of blobs.slice(0, 200)) {
      const data = await store.get(blob.key, { type: 'json' }) as {
        ttfb?: number; domLoad?: number; fullLoad?: number;
      } | null;
      if (data) {
        if (data.ttfb) metrics.ttfb.push(data.ttfb);
        if (data.domLoad) metrics.domLoad.push(data.domLoad);
        if (data.fullLoad) metrics.fullLoad.push(data.fullLoad);
      }
    }

    const median = (arr: number[]) => {
      if (arr.length === 0) return null;
      const sorted = arr.sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    return new Response(JSON.stringify({
      today: {
        samples: metrics.ttfb.length,
        ttfb: { median: median(metrics.ttfb), p95: metrics.ttfb.sort((a, b) => a - b)[Math.floor(metrics.ttfb.length * 0.95)] || null },
        domLoad: { median: median(metrics.domLoad) },
        fullLoad: { median: median(metrics.fullLoad) },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    });
  } catch {
    return new Response(JSON.stringify({ today: { samples: 0 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
