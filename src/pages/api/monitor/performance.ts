import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'tlo-performance';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { url, ttfb, domLoad, fullLoad, timestamp } = body;

    const store = getStore(STORE_NAME);
    const today = new Date().toISOString().split('T')[0];
    const key = `${today}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await store.setJSON(key, {
      url,
      ttfb: Math.round(ttfb),
      domLoad: Math.round(domLoad),
      fullLoad: Math.round(fullLoad),
      timestamp: timestamp || new Date().toISOString(),
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed' }), { status: 500 });
  }
};

export const GET: APIRoute = async () => {
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
