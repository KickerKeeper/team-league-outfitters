import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { getSubmissions } from '../../../lib/inbox';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const submissions = await getSubmissions();
  return new Response(JSON.stringify(submissions), {
    headers: { 'Content-Type': 'application/json' },
  });
};
