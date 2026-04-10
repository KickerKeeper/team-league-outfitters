import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { addReply } from '../../../lib/inbox';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id, body: noteBody } = await request.json();
  if (!id || !noteBody) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
  }

  const updated = await addReply(id, {
    body: noteBody,
    sentAt: new Date().toISOString(),
    to: 'internal',
  });

  return new Response(JSON.stringify(updated || { ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
