import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { updateSubmissionStatus } from '../../../lib/inbox';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id, status } = await request.json();
  if (!id || !['new', 'read', 'completed'].includes(status)) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  const updated = await updateSubmissionStatus(id, status);
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};
