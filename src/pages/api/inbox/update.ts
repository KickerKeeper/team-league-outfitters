import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { updateSubmissionStatus, getSubmission, addMessage } from '../../../lib/inbox';

export const prerender = false;

const validStatuses = ['new', 'read', 'completed'];
const validStages = ['review', 'production', 'ready', 'picked-up'];

const stageEmails: Record<string, { subject: string; body: (name: string) => string }> = {
  'production': {
    subject: 'Your order is in production — Team & League Outfitters',
    body: (name) => `Hi ${name},\n\nGood news! Your order has been confirmed and is now in production. We'll let you know as soon as it's ready for pickup.\n\nIf you have any questions, just reply to this email.\n\n— Jamie Nadeau\nTeam & League Outfitters\n(978) 352-8240`,
  },
  'ready': {
    subject: 'Your order is ready for pickup! — Team & League Outfitters',
    body: (name) => `Hi ${name},\n\nYour order is ready! Come pick it up at:\n\nTeam & League Outfitters\n103 E Main St #2\nGeorgetown Building Supply Plaza\nGeorgetown, MA 01833\n\nHours:\nWed–Fri: 11am–5pm\nSat: 8am–Noon\n\nIf you need to arrange a different pickup time, just reply to this email or call (978) 352-8240.\n\nSee you soon!\n— Jamie Nadeau`,
  },
  'picked-up': {
    subject: 'Thanks for picking up your order! — Team & League Outfitters',
    body: (name) => `Hi ${name},\n\nThanks for picking up your order! We hope your team loves the new gear.\n\nIf you have a moment, we'd really appreciate a Google review — it helps other local teams find us:\nhttps://g.page/r/teamleagueoutfitters/review\n\nSee you next season!\n— Jamie Nadeau\nTeam & League Outfitters`,
  },
};

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

  // Get the submission before updating to check the previous stage
  const before = await getSubmission(id);
  const previousStage = before?.stage || 'review';

  const updated = await updateSubmissionStatus(id, status || 'read', stage);
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  // Auto-send email on stage transitions
  if (stage && stage !== previousStage && before?.data?.email) {
    const emailConfig = stageEmails[stage];
    if (emailConfig) {
      const resendKey = import.meta.env.RESEND_API_KEY;
      const fromAddress = import.meta.env.RESEND_FROM || 'Team & League Outfitters <orders@teamleagueoutfitters.com>';
      const replyTo = 'orders@teamleagueoutfitters.com';
      const customerName = before.data.name || 'there';

      if (resendKey) {
        try {
          // Find threading info
          const msgs = before.messages || [];
          const lastMsgId = msgs.filter(m => m.messageId).map(m => m.messageId).pop();
          const allMsgIds = msgs.filter(m => m.messageId).map(m => m.messageId);

          const emailPayload: any = {
            from: fromAddress,
            reply_to: replyTo,
            to: [before.data.email],
            subject: emailConfig.subject,
            text: emailConfig.body(customerName),
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
              body: emailConfig.body(customerName),
              timestamp: new Date().toISOString(),
              to: before.data.email,
              subject: emailConfig.subject,
              messageId: resData.id ? `<${resData.id}@resend.dev>` : '',
            });
          }
        } catch (e) {
          console.error('Auto-email error:', e);
        }
      }
    }
  }

  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};
