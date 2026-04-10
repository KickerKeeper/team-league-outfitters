import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { addReply } from '../../../lib/inbox';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id, to, body: replyBody } = await request.json();
  if (!id || !to || !replyBody) {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
  }

  // Send email via Resend (or log if no API key)
  const resendKey = import.meta.env.RESEND_API_KEY;
  // Use verified domain or Resend's shared domain for testing
  const fromAddress = import.meta.env.RESEND_FROM || 'Team & League Outfitters <onboarding@resend.dev>';

  if (resendKey) {
    try {
      const emailPayload = {
        from: fromAddress,
        to: [to],
        reply_to: 'teamleagueoutfitters@comcast.net',
        subject: 'Re: Your Order Inquiry — Team & League Outfitters',
        text: replyBody + '\n\n—\nTeam & League Outfitters\n(978) 352-8240\n103 E Main St #2, Georgetown, MA 01833',
      };

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      const resBody = await res.text();
      if (!res.ok) {
        console.error('Resend error:', res.status, resBody);
        // Still save the reply even if email fails
      }
    } catch (e) {
      console.error('Email send error:', e);
      // Still save the reply even if email fails
    }
  }

  // Save reply to submission record
  const updated = await addReply(id, {
    body: replyBody,
    sentAt: new Date().toISOString(),
    to,
  });

  return new Response(JSON.stringify(updated || { ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
