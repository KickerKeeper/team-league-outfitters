import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { getStripe, getWebhookSecret } from '../../../lib/stripe';
import { getSubmission, setPaid, addMessage } from '../../../lib/inbox';

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

      const summaryLines = [
        town ? `Town: ${town}` : '',
        jerseys ? `Jerseys:\n${jerseys}` : '',
        notes ? `Notes: ${notes}` : '',
        `Total paid: $${totalDollars} (tax: $${taxDollars})`,
      ].filter(Boolean).join('\n\n');

      const emailBody = `Hi ${name},

Thanks for your order — payment received!

Here's what we got:

${summaryLines}

A few reminders:

• All custom jersey sales are final. Once we start production with your kid's name and number, we can't take it back.
• Sizing questions or changes? Call us at (978) 352-8240 right away — the sooner we know, the better.
• Stripe will email you a receipt separately for your records.

We'll be in touch when your order is ready.

Talk soon,
Jamie Nadeau
Georgetown Jerseys
(978) 352-8240
103 E Main St #2, Georgetown, MA 01833`;

      try {
        const subject = `Order received — Georgetown Jerseys`;
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
