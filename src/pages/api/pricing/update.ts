import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { setProductOverride } from '../../../lib/catalog';
import { getTown } from '../../../lib/towns';

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

  const { slug, productId, priceDollars, enabled } = body || {};
  if (typeof slug !== 'string' || !slug) {
    return new Response(JSON.stringify({ error: 'Missing slug' }), { status: 400 });
  }
  // Slug must be a town we serve — guards against arbitrary records downstream.
  if (!getTown(slug)) {
    return new Response(JSON.stringify({ error: 'Unknown town' }), { status: 400 });
  }
  if (typeof productId !== 'string' || !productId) {
    return new Response(JSON.stringify({ error: 'Missing productId' }), { status: 400 });
  }

  const patch: { priceCents?: number; enabled?: boolean } = {};
  if (priceDollars !== undefined) {
    const dollars = Number(priceDollars);
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1000) {
      return new Response(JSON.stringify({ error: 'Price must be between $0 and $1000' }), { status: 400 });
    }
    patch.priceCents = Math.round(dollars * 100);
  }
  if (enabled !== undefined) {
    patch.enabled = !!enabled;
  }

  try {
    const updated = await setProductOverride(slug, productId, patch);
    return new Response(JSON.stringify({ ok: true, slug, productId, product: updated }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Failed to save' }), { status: 400 });
  }
};
