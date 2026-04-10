import type { APIRoute } from 'astro';
import { findByEmail, addMessage, saveSubmission } from '../../../lib/inbox';

export const prerender = false;

// Resend sends inbound emails as POST webhooks
export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();

    // Resend inbound webhook format
    const fromEmail = payload.from?.match(/<(.+)>/)?.[1] || payload.from || '';
    const subject = payload.subject || '';
    const body = payload.text || payload.html?.replace(/<[^>]*>/g, '') || '';

    if (!fromEmail || !body) {
      return new Response('', { status: 400 });
    }

    // Find the submission this email is replying to
    let sub = await findByEmail(fromEmail);

    if (sub) {
      // Add the incoming message to the existing thread
      await addMessage(sub.id, {
        type: 'received',
        body: body.trim(),
        timestamp: new Date().toISOString(),
        from: fromEmail,
        subject,
      });
    } else {
      // No matching submission — create a new inbox entry
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await saveSubmission({
        id,
        formName: 'email',
        data: {
          name: payload.from?.replace(/<.+>/, '').trim() || fromEmail,
          email: fromEmail,
        },
        createdAt: new Date().toISOString(),
        status: 'new',
        messages: [{
          type: 'received',
          body: body.trim(),
          timestamp: new Date().toISOString(),
          from: fromEmail,
          subject,
        }],
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error('Inbound email error:', e);
    return new Response('', { status: 500 });
  }
};
