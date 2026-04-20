import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { updateSubmissionStatus, getSubmission, addMessage, setPaid } from '../../../lib/inbox';

export const prerender = false;

const validStatuses = ['new', 'read', 'completed'];

const completionEmail = {
  subject: 'Your order is complete — Georgetown Jerseys',
  body: (name: string) => `Hi ${name},\n\nYour order is complete! Thanks for choosing Georgetown Jerseys.\n\nIf you're picking up in store, please call (978) 352-8240 or reply to this email to confirm a time — our shop hours change week to week.\n\nIf you have a moment, a quick Google review really helps other local teams find us:\nhttps://g.page/r/teamleagueoutfitters/review\n\n— Jamie Nadeau\nGeorgetown Jerseys`,
};

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id, status, paid } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }

  if (status && !validStatuses.includes(status)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400 });
  }

  // Paid-only update: don't touch status, don't fire completion email
  if (typeof paid === 'boolean' && status === undefined) {
    const updated = await setPaid(id, paid);
    if (!updated) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
    return new Response(JSON.stringify(updated), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const before = await getSubmission(id);
  const previousStatus = before?.status;

  const updated = await updateSubmissionStatus(id, status || 'read');
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  // Optionally flip paid alongside status change
  if (typeof paid === 'boolean') {
    await setPaid(id, paid);
  }

  // Send completion email when order transitions to 'completed' (only for order submissions, not email threads)
  if (
    status === 'completed' &&
    previousStatus !== 'completed' &&
    before?.formName !== 'email' &&
    before?.data?.email
  ) {
    const resendKey = import.meta.env.RESEND_API_KEY;
    const fromAddress = import.meta.env.RESEND_FROM || 'Georgetown Jerseys <orders@gtownjerseys.com>';
    const replyTo = 'orders@gtownjerseys.com';
    const customerName = before.data.name || 'there';

    if (resendKey) {
      try {
        const msgs = before.messages || [];
        const lastMsgId = msgs.filter(m => m.messageId).map(m => m.messageId).pop();
        const allMsgIds = msgs.filter(m => m.messageId).map(m => m.messageId);

        const emailPayload: any = {
          from: fromAddress,
          reply_to: replyTo,
          to: [before.data.email],
          subject: completionEmail.subject,
          text: completionEmail.body(customerName),
        };

        const headers: Record<string, string> = {};
        if (lastMsgId) headers['In-Reply-To'] = lastMsgId;
        if (allMsgIds.length) headers['References'] = allMsgIds.join(' ');
        if (Object.keys(headers).length) emailPayload.headers = headers;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(emailPayload),
        });

        if (res.ok) {
          const resData = await res.json().catch(() => ({}));
          await addMessage(id, {
            type: 'sent',
            body: completionEmail.body(customerName),
            timestamp: new Date().toISOString(),
            to: before.data.email,
            subject: completionEmail.subject,
            messageId: resData.id ? `<${resData.id}@resend.dev>` : '',
          });
        }
      } catch (e) {
        console.error('Completion email error:', e);
      }
    }
  }

  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};
