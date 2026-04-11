import type { APIRoute } from 'astro';
import { findByEmail, addMessage, saveSubmission } from '../../../lib/inbox';

export const prerender = false;

// Resend sends webhook with type "email.received" — body is NOT included
// We must fetch the full email via GET /emails/receiving/:email_id
export const POST: APIRoute = async ({ request }) => {
  try {
    const webhook = await request.json();

    // Resend webhook format: { type: "email.received", data: { email_id, from, to, subject, ... } }
    const eventType = webhook.type;
    const data = webhook.data || webhook;

    if (eventType && eventType !== 'email.received') {
      // Not an inbound email event, ignore
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const emailId = data.email_id || data.id;
    const fromRaw = data.from || '';
    const subject = data.subject || '';
    const toAddresses = data.to || [];

    // Extract clean email from "Name <email>" format
    const fromEmail = fromRaw.match(/<(.+)>/)?.[1] || fromRaw;
    const fromName = fromRaw.replace(/<.+>/, '').trim() || fromEmail;

    if (!fromEmail) {
      return new Response(JSON.stringify({ error: 'No from address' }), { status: 400 });
    }

    // Fetch the full email content from Resend API
    let body = '';
    const resendKey = import.meta.env.RESEND_API_KEY;

    if (resendKey && emailId) {
      try {
        const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { 'Authorization': `Bearer ${resendKey}` },
        });

        if (res.ok) {
          const emailData = await res.json();
          body = emailData.text || emailData.html?.replace(/<[^>]*>/g, '') || '';
        } else {
          console.error('Failed to fetch email content:', res.status, await res.text());
        }
      } catch (e) {
        console.error('Error fetching email content:', e);
      }
    }

    // If we still don't have body, use subject as fallback
    if (!body) {
      body = subject || '(No content)';
    }

    // Clean up reply chains — strip quoted content from email replies
    const cleanBody = body
      .split(/\r?\nOn .+wrote:\r?\n/)[0]           // Gmail: "On Mon, Apr 10... wrote:"
      .split(/\r?\nOn .+<[^>]+> wrote:/)[0]         // Gmail with email in brackets
      .split(/\r?\n-{2,}\s*\r?\n/)[0]               // Signature separator: "--"
      .split(/\r?\n_{2,}\s*\r?\n/)[0]               // Outlook separator: "___"
      .split(/\r?\nFrom: /)[0]                       // Outlook: "From: ..."
      .split(/\r?\n>+ /)[0]                          // Quoted lines: "> text"
      .split(/\r?\nSent from my /)[0]                // Mobile signatures
      .split(/\r?\nGet Outlook/)[0]                  // Outlook mobile
      .replace(/\r?\n<[^>]+>\s*wrote:[\s\S]*/g, '')  // Catch any remaining "wrote:" patterns
      .trim();

    // Find existing submission by customer email
    const sub = await findByEmail(fromEmail);

    if (sub) {
      await addMessage(sub.id, {
        type: 'received',
        body: cleanBody,
        timestamp: new Date().toISOString(),
        from: fromEmail,
        subject,
      });
    } else {
      // New contact — create inbox entry
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await saveSubmission({
        id,
        formName: 'email',
        data: {
          name: fromName,
          email: fromEmail,
        },
        createdAt: new Date().toISOString(),
        status: 'new',
        messages: [{
          type: 'received',
          body: cleanBody,
          timestamp: new Date().toISOString(),
          from: fromEmail,
          subject,
        }],
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error('Inbound email error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
