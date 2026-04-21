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
  // Hide soft-deleted records from the inbox listing.
  const visible = submissions.filter(s => !s.deletedAt);
  return new Response(JSON.stringify(visible), {
    headers: { 'Content-Type': 'application/json' },
  });
};
