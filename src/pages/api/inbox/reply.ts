import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { addMessage, getSubmission } from '../../../lib/inbox';

export const prerender = false;

const ALLOWED_TYPES = new Set(['note', 'sent']);
const MAX_BODY_LEN = 20_000;

// RFC 5322 — practical email regex. Rejects multiple addresses, header
// injection (CR/LF), and obviously malformed inputs.
const EMAIL_RE = /^[^\s,<>"]{1,64}@[^\s,<>"]{1,255}$/;

function isCleanHeaderField(s: string): boolean {
  // Reject anything that could break out of a header into a new one.
  return !/[\r\n\0]/.test(s);
}

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let id: string, to: string | undefined, msgBody: string, type: string | undefined;
  try {
    ({ id, to, body: msgBody, type } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (typeof id !== 'string' || typeof msgBody !== 'string' || !id || !msgBody) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
  }
  if (msgBody.length > MAX_BODY_LEN) {
    return new Response(JSON.stringify({ error: 'Message too long' }), { status: 413 });
  }
  if (type !== undefined && !ALLOWED_TYPES.has(type)) {
    return new Response(JSON.stringify({ error: 'Invalid type' }), { status: 400 });
  }

  const messageType = type || (to ? 'sent' : 'note');

  // If sending an email, use Resend
  if (messageType === 'sent' && to) {
    if (typeof to !== 'string' || !EMAIL_RE.test(to) || !isCleanHeaderField(to)) {
      return new Response(JSON.stringify({ error: 'Invalid recipient' }), { status: 400 });
    }

    // Recipient MUST match the customer email on the original submission.
    // Without this check, a compromised admin session could exfiltrate
    // conversation context to any address.
    const subForRecipientCheck = await getSubmission(id);
    const expectedTo = subForRecipientCheck?.data?.email?.toLowerCase();
    if (!expectedTo || expectedTo !== to.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Recipient does not match original conversation' }), { status: 400 });
    }

    const resendKey = import.meta.env.RESEND_API_KEY;
    const fromAddress = import.meta.env.RESEND_FROM || 'Georgetown Jerseys <orders@gtownjerseys.com>';
    const replyTo = 'orders@gtownjerseys.com';

    if (resendKey) {
      // Look up the submission to find threading info
      const sub = subForRecipientCheck;
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
      // Strip CR/LF from anything that lands in headers, defense in depth.
      subject = subject.replace(/[\r\n]+/g, ' ').slice(0, 200);

      const emailPayload: any = {
        from: fromAddress,
        reply_to: replyTo,
        to: [to],
        subject: subject,
        text: msgBody + '\n\n—\nGeorgetown Jerseys\n(978) 352-8240\n103 E Main St #2, Georgetown, MA 01833',
      };

      // Add threading headers
      const headers: Record<string, string> = {};
      if (inReplyTo && isCleanHeaderField(inReplyTo)) headers['In-Reply-To'] = inReplyTo;
      if (references && isCleanHeaderField(references)) headers['References'] = references;
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
    type: messageType as 'note' | 'sent',
    body: msgBody,
    timestamp: new Date().toISOString(),
    to: to || undefined,
    messageId: (messageType === 'sent' && typeof sentMessageId !== 'undefined') ? sentMessageId : undefined,
  });

  return new Response(JSON.stringify(updated || { ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
