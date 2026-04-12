import type { APIRoute } from 'astro';
import { Webhook } from 'svix';
import { findByEmail, addMessage, saveSubmission } from '../../../lib/inbox';

export const prerender = false;

// Resend sends webhook with type "email.received" — body is NOT included
// We must fetch the full email via GET /emails/receiving/:email_id
export const POST: APIRoute = async ({ request }) => {
  try {
    const rawBody = await request.text();

    // Verify webhook signature if secret is configured
    const webhookSecret = import.meta.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const svixId = request.headers.get('svix-id');
      const svixTimestamp = request.headers.get('svix-timestamp');
      const svixSignature = request.headers.get('svix-signature');

      if (!svixId || !svixTimestamp || !svixSignature) {
        return new Response(JSON.stringify({ error: 'Missing signature headers' }), { status: 401 });
      }

      try {
        const wh = new Webhook(webhookSecret);
        wh.verify(rawBody, { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature });
      } catch {
        console.error('Webhook signature verification failed');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
      }
    }

    const webhook = JSON.parse(rawBody);

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
    const messageId = data.message_id || '';

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

    // Strip quoted reply content — remove the original message, keep new content
    // Match the exact Gmail pattern: "On Day, Mon DD, YYYY at H:MM AM/PM Name <email> wrote:"
    // Use a very specific pattern to avoid false positives on short messages
    let cleanBody = body;

    // Find the position of the Gmail quote marker
    const gmailPattern = /On\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(AM|PM)\s+/i;
    const match = cleanBody.match(gmailPattern);
    if (match && match.index !== undefined && match.index > 0) {
      // Only strip if the quote marker isn't at the very start (there must be actual content before it)
      cleanBody = cleanBody.substring(0, match.index);
    }

    // Signature and Outlook separators — only if on their own line
    cleanBody = cleanBody
      .replace(/\r?\n-{2,}\s*\r?\n[\s\S]*$/, '')
      .replace(/\r?\n_{3,}\s*\r?\n[\s\S]*$/, '')
      .trim();

    // Find existing submission by customer email
    const sub = await findByEmail(fromEmail);

    const fullBody = body.trim();

    if (sub) {
      await addMessage(sub.id, {
        type: 'received',
        body: cleanBody,
        fullBody: fullBody,
        timestamp: new Date().toISOString(),
        from: fromEmail,
        subject,
        messageId,
      });
    } else {
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
          fullBody: fullBody,
          timestamp: new Date().toISOString(),
          from: fromEmail,
          subject,
          messageId,
        }],
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error('Inbound email error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
