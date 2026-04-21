import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';
import { getSessionFromCookie } from '../../../lib/auth';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

const STORE_NAME = 'tlo-errors';
const MAX_STACK = 1000;
const MAX_MSG = 500;
const MAX_URL = 500;
const MAX_UA = 200;

function clip(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.length > max ? s.slice(0, max) : s;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Throttle anonymous error reports — 30 errors/min per IP is plenty for
  // legitimate client-side error capture and orders of magnitude below abuse.
  const ip = getClientIp(request) || clientAddress || 'unknown';
  if (!checkRateLimit(`monitor-errors:${ip}`, 30, 60 * 1000)) {
    return new Response(null, { status: 429 });
  }

  try {
    const body = await request.json();
    const message = clip(body?.message, MAX_MSG);
    const stack = clip(body?.stack, MAX_STACK);
    const url = clip(body?.url, MAX_URL);
    const timestamp = typeof body?.timestamp === 'string' ? body.timestamp.slice(0, 40) : new Date().toISOString();

    if (!message) {
      return new Response(null, { status: 400 });
    }

    const store = getStore(STORE_NAME);
    const today = new Date().toISOString().split('T')[0];
    const key = `${today}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await store.setJSON(key, {
      message,
      stack,
      url,
      ip: clientAddress,
      timestamp,
      userAgent: clip(request.headers.get('user-agent'), MAX_UA),
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

export const GET: APIRoute = async ({ request, url }) => {
  // Stack traces can leak internal paths and request URLs — admin only.
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
