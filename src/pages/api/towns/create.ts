import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { addTown } from '../../../lib/towns';

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

  try {
    const town = await addTown((body && body.name) || '');
    return new Response(JSON.stringify({ ok: true, town }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Failed to add town' }), { status: 400 });
  }
};
