import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { getStripe, getWebhookSecret } from '../../../lib/stripe';
import { getSubmission, setPaid, addMessage, mergeSubmissionData } from '../../../lib/inbox';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return new Response('Missing stripe-signature', { status: 400 });
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response('Could not read body', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, getWebhookSecret());
  } catch (e: any) {
    console.error('Stripe webhook signature verification failed:', e?.message);
    return new Response(`Webhook signature failed: ${e?.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const submissionId = session.metadata?.submission_id;
    if (!submissionId) {
      console.error('Webhook session missing submission_id metadata', session.id);
      return new Response(JSON.stringify({ ok: true, ignored: 'no submission_id' }), { status: 200 });
    }

    const sub = await getSubmission(submissionId);
    if (!sub) {
      console.error('Webhook submission not found:', submissionId);
      return new Response(JSON.stringify({ ok: true, ignored: 'unknown submission' }), { status: 200 });
    }

    if (sub.paid) {
      // Idempotent — Stripe may retry.
      return new Response(JSON.stringify({ ok: true, alreadyPaid: true }), { status: 200 });
    }

    await setPaid(submissionId, true);

    // Capture the receipt URL on the submission timeline so admin can pull it up later.
    let receiptUrl: string | undefined;
    try {
      if (typeof session.payment_intent === 'string') {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
          expand: ['latest_charge'],
        });
        const charge = pi.latest_charge as Stripe.Charge | null;
        receiptUrl = charge?.receipt_url ?? undefined;
      }
    } catch (e) {
      console.error('Could not retrieve receipt URL:', e);
    }

    const totalDollars = session.amount_total != null ? (session.amount_total / 100).toFixed(2) : '?';
    const taxDollars = session.total_details?.amount_tax != null
      ? (session.total_details.amount_tax / 100).toFixed(2)
      : '0.00';

    await mergeSubmissionData(submissionId, {
      amount_total_cents: session.amount_total != null ? String(session.amount_total) : '',
      amount_tax_cents: session.total_details?.amount_tax != null ? String(session.total_details.amount_tax) : '',
      receipt_url: receiptUrl || '',
      stripe_session_id: session.id,
    });

    await addMessage(submissionId, {
      type: 'note',
      body: [
        `Payment received via Stripe.`,
        `Total: $${totalDollars} (tax: $${taxDollars})`,
        `Stripe session: ${session.id}`,
        receiptUrl ? `Receipt: ${receiptUrl}` : '',
      ].filter(Boolean).join('\n'),
      timestamp: new Date().toISOString(),
    });

    // Send the parent a confirmation email from orders@gtownjerseys.com that
    // includes the all-sales-final reminder. Stripe also sends its own receipt;
    // this is the order-fulfillment side of the message.
    const email = sub.data.email;
    const resendKey = import.meta.env.RESEND_API_KEY;
    const fromAddress = import.meta.env.RESEND_FROM || 'Georgetown Jerseys <orders@gtownjerseys.com>';
    const replyTo = 'orders@gtownjerseys.com';

    if (email && resendKey) {
      const name = sub.data.name || 'there';
      const town = sub.data.town || '';
      const jerseys = sub.data.jerseys || '';
      const notes = sub.data.notes || '';

      const esc = (s: string) =>
        String(s).replace(/[&<>"]/g, (c) => {
          switch (c) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            default: return c;
          }
        });
      const jerseysHtml = esc(jerseys).replace(/\n/g, '<br>');

      const summaryLines = [
        town ? `Town: ${town}` : '',
        jerseys ? `Jerseys:\n${jerseys}` : '',
        notes ? `Notes: ${notes}` : '',
        `Total paid: $${totalDollars} (tax: $${taxDollars})`,
      ].filter(Boolean).join('\n\n');

      const emailBody = `Hi ${name},

Thank you for your order — your payment has been received and we're getting started.

ORDER SUMMARY
${summaryLines}

All custom jersey sales are final. Production starts with your child's name and number, so we can't accept returns or changes once we begin.

What happens next
• Need a sizing change? Call (978) 352-8240 as soon as possible.
• Stripe has emailed your payment receipt separately.

Thanks again,
The Georgetown Jerseys Team

Georgetown Jerseys
103 E Main St #2, Georgetown, MA 01833
(978) 352-8240
gtownjerseys.com`;

      const summaryRowsHtml = [
        town ? `<tr><td style="padding:8px 0;color:#6c757d;font-size:14px;">Town</td><td style="padding:8px 0;color:#212529;font-size:14px;text-align:right;font-weight:600;">${esc(town)}</td></tr>` : '',
        jerseys ? `<tr><td style="padding:8px 0;color:#6c757d;font-size:14px;vertical-align:top;">Jerseys</td><td style="padding:8px 0;color:#212529;font-size:14px;text-align:right;">${jerseysHtml}</td></tr>` : '',
        notes ? `<tr><td style="padding:8px 0;color:#6c757d;font-size:14px;vertical-align:top;">Notes</td><td style="padding:8px 0;color:#212529;font-size:14px;text-align:right;">${esc(notes)}</td></tr>` : '',
      ].filter(Boolean).join('');

      const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Order confirmed</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border-top:4px solid #2B5EA7;">
        <tr><td align="center" style="padding:28px 32px 8px;">
          <img src="https://gtownjerseys.com/images/logo/logo-horizontal.png" alt="Georgetown Jerseys" height="40" style="height:40px;width:auto;display:block;">
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <p style="margin:0;color:#28A745;font-size:14px;font-weight:700;letter-spacing:0.4px;">&#10003; PAYMENT RECEIVED</p>
          <h1 style="margin:8px 0 0;color:#1E4478;font-size:22px;font-weight:700;">Your order is confirmed</h1>
        </td></tr>
        <tr><td style="padding:16px 32px 0;color:#212529;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">Hi ${esc(name)},</p>
          <p style="margin:0 0 16px;">Thank you for your order &mdash; your payment has been received and we&rsquo;re getting started.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e9ecef;border-radius:6px;">
            <tr><td colspan="2" style="padding:14px 16px 8px;color:#1E4478;font-size:13px;font-weight:700;letter-spacing:0.5px;border-bottom:1px solid #e9ecef;">ORDER SUMMARY</td></tr>
            <tr><td colspan="2" style="padding:0 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${summaryRowsHtml}
            <tr><td style="padding:12px 0;color:#212529;font-size:15px;font-weight:700;border-top:2px solid #e9ecef;">Total paid</td><td style="padding:12px 0;color:#1E4478;font-size:15px;font-weight:700;text-align:right;border-top:2px solid #e9ecef;">$${totalDollars}</td></tr>
            <tr><td style="padding:0 0 14px;color:#6c757d;font-size:13px;">Tax</td><td style="padding:0 0 14px;color:#6c757d;font-size:13px;text-align:right;">$${taxDollars}</td></tr>
            </table></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FDF0D5;border-left:4px solid #E8A317;border-radius:4px;">
            <tr><td style="padding:14px 16px;color:#5c4708;font-size:14px;line-height:1.5;">
              <strong>All custom jersey sales are final.</strong> Production starts with your child&rsquo;s name and number, so we can&rsquo;t accept returns or changes once we begin.
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px 0;color:#212529;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 10px;color:#1E4478;font-size:16px;font-weight:700;">What happens next</p>
          <p style="margin:0 0 8px;">&bull; Need a sizing change? Call <a href="tel:+19783528240" style="color:#2B5EA7;text-decoration:none;">(978) 352-8240</a> as soon as possible.</p>
          <p style="margin:0;">&bull; Stripe has emailed your payment receipt separately.</p>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;color:#212529;font-size:15px;line-height:1.6;">
          <p style="margin:0;">Thanks again,</p>
          <p style="margin:0;font-weight:600;">The Georgetown Jerseys Team</p>
        </td></tr>
        <tr><td style="padding:20px 32px 32px;">
          <hr style="border:none;border-top:1px solid #e9ecef;margin:0 0 16px;">
          <p style="margin:0;color:#6c757d;font-size:12px;line-height:1.7;">
            <strong style="color:#495057;">Georgetown Jerseys</strong><br>
            103 E Main St #2, Georgetown, MA 01833<br>
            <a href="tel:+19783528240" style="color:#6c757d;text-decoration:none;">(978) 352-8240</a> &middot; <a href="https://gtownjerseys.com" style="color:#2B5EA7;text-decoration:none;">gtownjerseys.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      try {
        const subject = `Order confirmed — Georgetown Jerseys`;
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
            subject,
            html: emailHtml,
            text: emailBody,
          }),
        });

        if (emailRes.ok) {
          const resData = await emailRes.json().catch(() => ({}));
          await addMessage(submissionId, {
            type: 'sent',
            body: emailBody,
            timestamp: new Date().toISOString(),
            to: email,
            subject,
            messageId: resData.id ? `<${resData.id}@resend.dev>` : '',
          });
        } else {
          const errText = await emailRes.text().catch(() => '');
          console.error('Resend rejected confirmation email:', emailRes.status, errText);
        }
      } catch (e) {
        console.error('Confirmation email send failed:', e);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // Acknowledge other event types so Stripe stops retrying.
  return new Response(JSON.stringify({ ok: true, ignored: event.type }), { status: 200 });
};
