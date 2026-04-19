import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { addMessage, getSubmission } from '../../../lib/inbox';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id, to, body: msgBody, type } = await request.json();
  if (!id || !msgBody) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
  }

  const messageType = type || (to ? 'sent' : 'note');

  // If sending an email, use Resend
  if (messageType === 'sent' && to) {
    const resendKey = import.meta.env.RESEND_API_KEY;
    const fromAddress = import.meta.env.RESEND_FROM || 'Georgetown Jerseys <orders@gtownjerseys.com>';
    const replyTo = 'orders@gtownjerseys.com';

    if (resendKey) {
      // Look up the submission to find threading info
      const sub = await getSubmission(id);
      const msgs = sub?.messages || [];

      // Find the last message with a messageId for threading
      let inReplyTo = '';
      let references = '';
      let originalSubject = '';

      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.messageId) {
          inReplyTo = m.messageId;
          if (!references) references = m.messageId;
          break;
        }
      }

      // Collect all messageIds for References header
      const allMsgIds = msgs.filter(m => m.messageId).map(m => m.messageId);
      if (allMsgIds.length) references = allMsgIds.join(' ');

      // Find the original subject from the thread
      for (const m of msgs) {
        if (m.subject) {
          originalSubject = m.subject;
          break;
        }
      }

      // Build subject — prefix with Re: if not already
      let subject = originalSubject || 'Your Order — Georgetown Jerseys';
      if (originalSubject && !originalSubject.startsWith('Re:')) {
        subject = 'Re: ' + originalSubject;
      }

      const emailPayload: any = {
        from: fromAddress,
        reply_to: replyTo,
        to: [to],
        subject: subject,
        text: msgBody + '\n\n—\nGeorgetown Jerseys\n(978) 352-8240\n103 E Main St #2, Georgetown, MA 01833',
      };

      // Add threading headers
      const headers: Record<string, string> = {};
      if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
      if (references) headers['References'] = references;
      if (Object.keys(headers).length) emailPayload.headers = headers;

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailPayload),
        });

        if (!res.ok) {
          const err = await res.text();
          console.error('Resend error:', res.status, err);
          return new Response(JSON.stringify({ error: 'Failed to send email.' }), { status: 500 });
        }

        // Capture the sent message ID for future threading
        const resData = await res.json().catch(() => ({}));
        var sentMessageId = resData.id ? `<${resData.id}@resend.dev>` : '';
      } catch (e) {
        console.error('Email send error:', e);
        return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 });
      }
    } else {
      return new Response(JSON.stringify({ error: 'Email not configured' }), { status: 500 });
    }
  }

  // Save message to thread
  const updated = await addMessage(id, {
    type: messageType,
    body: msgBody,
    timestamp: new Date().toISOString(),
    to: to || undefined,
    messageId: (messageType === 'sent' && typeof sentMessageId !== 'undefined') ? sentMessageId : undefined,
  });

  return new Response(JSON.stringify(updated || { ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
