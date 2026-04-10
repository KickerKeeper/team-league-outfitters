import type { APIRoute } from 'astro';
import { saveSubmission } from '../../../lib/inbox';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let data: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await request.text();
      const params = new URLSearchParams(body);
      for (const [key, value] of params) {
        if (key !== 'form-name' && key !== 'bot-field') {
          data[key] = value;
        }
      }
    } else {
      data = await request.json();
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
    const fromAddress = import.meta.env.RESEND_FROM || 'Team & League Outfitters <orders@teamleagueoutfitters.com>';
    const inboundDomain = import.meta.env.RESEND_INBOUND_DOMAIN || 'niwhoig.resend.app';
    const replyTo = `orders@${inboundDomain}`;

    if (email && resendKey) {
      const name = data.name || 'there';
      const team = data.team || '';
      const sport = data.sport || '';
      const players = data.players || '';
      const colors = data.colors || '';
      const customization = data.customization || '';
      const fulfillment = data.fulfillment || '';

      const summaryLines = [
        team ? `Team: ${team}` : '',
        sport ? `Sport: ${sport}` : '',
        players ? `Players: ${players}` : '',
        colors ? `Colors: ${colors}` : '',
        customization ? `Customization: ${customization}` : '',
        fulfillment ? `Fulfillment: ${fulfillment}` : '',
      ].filter(Boolean).join('\n');

      const emailBody = `Hi ${name},

Thanks for reaching out! We got your order details and we'll be in touch within 1 business day to go over everything.

Here's what we received:

${summaryLines}

If anything looks off or you have questions, just reply to this email and we'll get it sorted.

Talk soon,
Rob & Jen
Team & League Outfitters
(978) 352-8240
103 E Main St #2, Georgetown, MA 01833`;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            reply_to: replyTo,
            to: [email],
            subject: 'We got your order details — Team & League Outfitters',
            text: emailBody,
          }),
        });
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
