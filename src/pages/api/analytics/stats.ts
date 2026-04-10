import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { getStats } from '../../../lib/analytics';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  // Require auth
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const days = parseInt(url.searchParams.get('days') || '30');
  const stats = await getStats(Math.min(days, 90));

  return new Response(JSON.stringify(stats), {
    headers: { 'Content-Type': 'application/json' },
  });
};
