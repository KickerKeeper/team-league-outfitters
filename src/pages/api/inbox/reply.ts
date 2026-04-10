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
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Team & League Outfitters <noreply@teamleagueoutfitters.com>',
          to: [to],
          subject: 'Re: Your Order Inquiry — Team & League Outfitters',
          text: replyBody + '\n\n—\nTeam & League Outfitters\n(978) 352-8240\n103 E Main St #2, Georgetown, MA 01833',
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('Resend error:', err);
        return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 });
      }
    } catch (e) {
      console.error('Email send error:', e);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 });
    }
  } else {
    console.log(`[Email would send to ${to}]: ${replyBody}`);
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
