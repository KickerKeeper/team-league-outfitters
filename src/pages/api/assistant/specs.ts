import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { getSpecs } from '../../../lib/specs';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const specs = await getSpecs();
  return new Response(JSON.stringify(specs), {
    headers: { 'Content-Type': 'application/json' },
  });
};
