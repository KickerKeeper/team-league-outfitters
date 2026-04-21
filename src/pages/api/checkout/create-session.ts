import type { APIRoute } from 'astro';
import { getStripe, isStripeConfigured, getSiteUrl, signCheckoutToken, checkoutCookieName } from '../../../lib/stripe';
import { getTownPrice } from '../../../lib/pricing';
import { getTown } from '../../../lib/towns';
import { saveSubmission } from '../../../lib/inbox';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

interface JerseyInput {
  name: string;
  size: string;
  number: string;
}

interface CheckoutPayload {
  town_slug: string;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  acknowledge_final_sale: boolean;
  jerseys: JerseyInput[];
}

export const POST: APIRoute = async ({ request }) => {
  if (!isStripeConfigured()) {
    return new Response(
      JSON.stringify({ error: 'Payments not yet configured. Please call (978) 352-8240 to place your order.' }),
      { status: 503 },
    );
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(ip, 5, 60000)) {
    return new Response(JSON.stringify({ error: 'Too many submissions. Please try again later.' }), { status: 429 });
  }

  let payload: CheckoutPayload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const town = getTown(payload.town_slug);
  if (!town) {
    return new Response(JSON.stringify({ error: 'Unknown town' }), { status: 400 });
  }

  if (!payload.acknowledge_final_sale) {
    return new Response(JSON.stringify({ error: 'You must acknowledge the final-sale policy before paying.' }), { status: 400 });
  }

  if (!payload.name || !payload.email || !payload.phone) {
    return new Response(JSON.stringify({ error: 'Missing parent contact info' }), { status: 400 });
  }

  const jerseys = (payload.jerseys || []).filter((j) => j && j.name && j.size && j.number);
  if (jerseys.length === 0) {
    return new Response(JSON.stringify({ error: 'Add at least one jersey' }), { status: 400 });
  }
  if (jerseys.length > 12) {
    return new Response(JSON.stringify({ error: 'Limit of 12 jerseys per order — call the shop for larger orders' }), { status: 400 });
  }

  const priceInfo = await getTownPrice(town.slug);
  const unitPriceCents = priceInfo.jerseyPriceCents;
  if (unitPriceCents <= 0) {
    return new Response(JSON.stringify({ error: 'Pricing not yet set for this town. Please call (978) 352-8240.' }), { status: 503 });
  }

  // Save the inbox submission first so the webhook can flip it to paid.
  const submissionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const jerseysSummary = jerseys
    .map((j, i) => `${i + 1}. ${j.name} — ${j.size}, #${j.number}`)
    .join('\n');

  await saveSubmission({
    id: submissionId,
    formName: 'parent-order',
    data: {
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      town: town.name,
      town_slug: town.slug,
      jerseys: jerseysSummary,
      jersey_count: String(jerseys.length),
      notes: payload.notes || '',
      unit_price_cents: String(unitPriceCents),
      acknowledged_final_sale: 'yes',
    },
    createdAt: new Date().toISOString(),
    status: 'new',
    paid: false,
    messages: [],
  });

  const stripe = getStripe();
  const siteUrl = getSiteUrl();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: payload.email,
      line_items: jerseys.map((j) => ({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: unitPriceCents,
          product_data: {
            name: `${town.name} Jersey — ${j.name} #${j.number}`,
            description: `Size ${j.size}`,
          },
          tax_behavior: 'exclusive',
        },
      })),
      automatic_tax: { enabled: true },
      success_url: `${siteUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/order/${town.slug}?canceled=1`,
      metadata: {
        submission_id: submissionId,
        town_slug: town.slug,
        jersey_count: String(jerseys.length),
      },
      payment_intent_data: {
        description: `${town.name} jersey order — ${jerseys.length} ${jerseys.length === 1 ? 'jersey' : 'jerseys'}. All custom jersey sales are final.`,
        metadata: { submission_id: submissionId },
      },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    // Per-checkout cookie scoped to /order/success — proves the holder is the
    // same browser that initiated this Stripe session, blocking IDOR via
    // session_id leaks (browser history, referrer, screen-share).
    const checkoutToken = signCheckoutToken(session.id);
    const cookie = `${checkoutCookieName(session.id)}=${encodeURIComponent(checkoutToken)}; Path=/order/success; HttpOnly; SameSite=Lax; Secure; Max-Age=3600`;

    return new Response(JSON.stringify({ url: session.url, submissionId }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
      },
    });
  } catch (e: any) {
    // Stripe errors can echo back the request payload (which includes the
    // parent's email and name). Log only the type/code, not the full error.
    console.error('Stripe Checkout Session create failed:', e?.type || e?.name || 'Unknown', e?.code || '');
    return new Response(
      JSON.stringify({ error: 'Could not start checkout. Please try again or call (978) 352-8240.' }),
      { status: 502 },
    );
  }
};
