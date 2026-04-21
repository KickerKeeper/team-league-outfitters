import type { APIRoute } from 'astro';
import { parseSessionFromCookie } from '../../../lib/auth';
import { softDeleteSubmission, getSubmission, appendAudit } from '../../../lib/inbox';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const session = parseSessionFromCookie(cookie);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id } = await request.json();
  if (!id || typeof id !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }

  const before = await getSubmission(id);
  if (!before) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  await softDeleteSubmission(id);

  // Audit trail — who deleted what and when. Critical for any future payment
  // dispute or accidental-deletion recovery.
  await appendAudit({
    ts: new Date().toISOString(),
    actor: session.username,
    submissionId: id,
    action: 'delete',
    before: { status: before.status, paid: !!before.paid, formName: before.formName },
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
