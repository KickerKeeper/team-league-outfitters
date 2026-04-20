import type { APIRoute } from 'astro';
import { saveSubmission } from '../../../lib/inbox';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Rate limit: 5 submissions per minute per IP
    const ip = getClientIp(request);
    if (!checkRateLimit(ip, 5, 60000)) {
      return new Response(JSON.stringify({ error: 'Too many submissions. Please try again later.' }), { status: 429 });
    }
    const contentType = request.headers.get('content-type') || '';
    let data: Record<string, string> = {};
    const arrays: Record<string, string[]> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await request.text();
      const params = new URLSearchParams(body);
      for (const [key, value] of params) {
        if (key === 'form-name' || key === 'bot-field') continue;
        if (key.endsWith('[]')) {
          const baseKey = key.slice(0, -2);
          (arrays[baseKey] ||= []).push(value);
        } else {
          data[key] = value;
        }
      }
    } else {
      data = await request.json();
    }

    // Combine repeated jersey_* fields into a single readable "jerseys" summary.
    const names = arrays.jersey_name || [];
    const sizes = arrays.jersey_size || [];
    const numbers = arrays.jersey_number || [];
    const jerseyCount = Math.max(names.length, sizes.length, numbers.length);
    if (jerseyCount > 0) {
      const lines: string[] = [];
      for (let i = 0; i < jerseyCount; i++) {
        const n = names[i] || '';
        const s = sizes[i] || '';
        const num = numbers[i] || '';
        lines.push(`${i + 1}. ${n} — ${s}, #${num}`);
      }
      data.jerseys = lines.join('\n');
      data.jersey_count = String(jerseyCount);
    }

    // Any remaining repeated fields fall back to comma-joined strings.
    for (const [key, vals] of Object.entries(arrays)) {
      if (key === 'jersey_name' || key === 'jersey_size' || key === 'jersey_number') continue;
      if (data[key] === undefined) data[key] = vals.join(', ');
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const formName = data['form-name'] || 'order';
    delete data['form-name'];

    await saveSubmission({
      id,
      formName,
      data,
      createdAt: new Date().toISOString(),
      status: 'new',
      messages: [],
    });

    // Send confirmation email if customer provided an email
    const email = data.email;
    const resendKey = import.meta.env.RESEND_API_KEY;
    const fromAddress = import.meta.env.RESEND_FROM || 'Georgetown Jerseys <orders@gtownjerseys.com>';
    const inboundDomain = 'gtownjerseys.com';
    const replyTo = `orders@${inboundDomain}`;

    if (email && resendKey) {
      const name = data.name || 'there';
      const town = data.town || '';
      const jerseys = data.jerseys || '';
      const notes = data.notes || '';

      const summaryLines = [
        town ? `Town: ${town}` : '',
        jerseys ? `Jerseys:\n${jerseys}` : '',
        notes ? `Notes: ${notes}` : '',
      ].filter(Boolean).join('\n\n');

      const emailBody = `Hi ${name},

Thanks for your order! We got your details and we'll be in touch within 1 business day to confirm everything and arrange payment.

Here's what we received:

${summaryLines}

If anything looks off or you have questions, just reply to this email and we'll get it sorted.

Talk soon,
Jamie Nadeau
Georgetown Jerseys
(978) 352-8240
103 E Main St #2, Georgetown, MA 01833`;

      try {
        const confirmSubject = 'Your Order — Georgetown Jerseys';
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            reply_to: replyTo,
            to: [email],
            subject: confirmSubject,
            text: emailBody,
          }),
        });

        // Save the confirmation as a sent message so replies thread properly
        if (emailRes.ok) {
          const resData = await emailRes.json().catch(() => ({}));
          const { addMessage } = await import('../../../lib/inbox');
          await addMessage(id, {
            type: 'sent',
            body: emailBody,
            timestamp: new Date().toISOString(),
            to: email,
            subject: confirmSubject,
            messageId: resData.id ? `<${resData.id}@resend.dev>` : '',
          });
        }
      } catch (e) {
        console.error('Confirmation email error:', e);
        // Don't fail the submission if email fails
      }
    }

    return new Response(JSON.stringify({ ok: true, id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Submit error:', e);
    return new Response(JSON.stringify({ error: 'Failed to save' }), { status: 500 });
  }
};
