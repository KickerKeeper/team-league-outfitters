import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { addMessage } from '../../../lib/inbox';

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
    const fromAddress = import.meta.env.RESEND_FROM || 'Team & League Outfitters <orders@teamleagueoutfitters.com>';
    const inboundDomain = 'teamleagueoutfitters.com';
    const replyTo = `orders@${inboundDomain}`;

    if (resendKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            reply_to: replyTo,
            to: [to],
            subject: 'Your Order — Team & League Outfitters',
            text: msgBody + '\n\n—\nTeam & League Outfitters\n(978) 352-8240\n103 E Main St #2, Georgetown, MA 01833',
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          console.error('Resend error:', res.status, err);
          return new Response(JSON.stringify({ error: 'Failed to send email. Check Resend domain verification.' }), { status: 500 });
        }
      } catch (e) {
        console.error('Email send error:', e);
        return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 });
      }
    } else {
      return new Response(JSON.stringify({ error: 'Email not configured (RESEND_API_KEY missing)' }), { status: 500 });
    }
  }

  // Save message to thread
  const updated = await addMessage(id, {
    type: messageType,
    body: msgBody,
    timestamp: new Date().toISOString(),
    to: to || undefined,
  });

  return new Response(JSON.stringify(updated || { ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
