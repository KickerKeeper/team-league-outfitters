import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { setTownPrice } from '../../../lib/pricing';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { slug, priceDollars } = body || {};
  if (typeof slug !== 'string' || !slug) {
    return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 });
  }

  const dollars = Number(priceDollars);
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1000) {
    return new Response(JSON.stringify({ error: 'Price must be between $0 and $1000' }), { status: 400 });
  }

  const cents = Math.round(dollars * 100);

  try {
    const updated = await setTownPrice(slug, cents);
    return new Response(JSON.stringify({ ok: true, slug, price: updated }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Failed to save' }), { status: 400 });
  }
};
