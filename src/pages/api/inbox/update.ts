import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { updateSubmissionStatus } from '../../../lib/inbox';

export const prerender = false;

const validStatuses = ['new', 'read', 'completed'];
const validStages = ['review', 'production', 'ready', 'picked-up'];

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id, status, stage } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }

  if (status && !validStatuses.includes(status)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400 });
  }

  if (stage && !validStages.includes(stage)) {
    return new Response(JSON.stringify({ error: 'Invalid stage' }), { status: 400 });
  }

  const updated = await updateSubmissionStatus(id, status || 'read', stage);
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};
