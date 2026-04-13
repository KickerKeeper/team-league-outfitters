import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'tlo-errors';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const body = await request.json();
    const { message, stack, url, timestamp } = body;

    const store = getStore(STORE_NAME);
    const today = new Date().toISOString().split('T')[0];
    const key = `${today}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await store.setJSON(key, {
      message,
      stack: stack?.slice(0, 2000),
      url,
      ip: clientAddress,
      timestamp: timestamp || new Date().toISOString(),
      userAgent: request.headers.get('user-agent')?.slice(0, 200),
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to record error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET: APIRoute = async ({ url }) => {
  try {
    const store = getStore(STORE_NAME);
    const days = parseInt(url.searchParams.get('days') || '1');
    const today = new Date();
    const errors: unknown[] = [];

    for (let i = 0; i < days && i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const prefix = date.toISOString().split('T')[0];

      const { blobs } = await store.list({ prefix });
      for (const blob of blobs.slice(0, 50)) {
        const data = await store.get(blob.key, { type: 'json' });
        if (data) errors.push(data);
      }
    }

    return new Response(JSON.stringify({
      errors: errors.slice(0, 100),
      count: errors.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    });
  } catch {
    return new Response(JSON.stringify({ errors: [], count: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
