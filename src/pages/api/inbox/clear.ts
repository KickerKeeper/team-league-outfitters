import type { APIRoute } from 'astro';
import { parseSessionFromCookie } from '../../../lib/auth';
import { clearAllSubmissions, appendAudit } from '../../../lib/inbox';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const session = parseSessionFromCookie(cookie);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  // Require an explicit typed confirmation so this can't be triggered casually.
  if (!body || body.confirm !== 'CLEAR') {
    return new Response(JSON.stringify({ error: 'Confirmation required' }), { status: 400 });
  }

  const count = await clearAllSubmissions();

  await appendAudit({
    ts: new Date().toISOString(),
    actor: session.username,
    submissionId: '*',
    action: 'clear-all',
    before: { count },
  });

  return new Response(JSON.stringify({ ok: true, count }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
