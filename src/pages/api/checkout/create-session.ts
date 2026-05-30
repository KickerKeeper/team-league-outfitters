import type { APIRoute } from 'astro';
import { getStripe, isStripeConfigured, getSiteUrl, signCheckoutToken, checkoutCookieName } from '../../../lib/stripe';
import { getTown } from '../../../lib/towns';
import { getCatalog } from '../../../lib/catalog';
import { saveSubmission } from '../../../lib/inbox';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

// Stripe product tax codes. General - Tangible Goods is verified; the clothing
// code applies the MA apparel exemption (clothing <= $175/item is tax-exempt).
const TAX_CODE_GENERAL = 'txcd_99999999'; // taxable physical goods (ball, backpack)
const TAX_CODE_CLOTHING = 'txcd_30011000'; // clothing & footwear (jersey, shorts, socks, sweatshirt, tee)
const MAX_LINE_ITEMS = 50;

interface ItemInput {
  productId: string;
  size?: string;
  number?: string;
  option?: string;
  quantity?: number;
}
interface PlayerInput {
  name: string;
  gender?: string;
  grade?: string;
  items: ItemInput[];
}
interface CheckoutPayload {
  town_slug: string;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  acknowledge_final_sale: boolean;
  players: PlayerInput[];
}

const err = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), { status });

export const POST: APIRoute = async ({ request }) => {
  if (!isStripeConfigured()) {
    return err('Payments not yet configured. Please call (978) 352-8240 to place your order.', 503);
  }

  const ip = getClientIp(request);
  if (!checkRateLimit(ip, 5, 60000)) {
    return err('Too many submissions. Please try again later.', 429);
  }

  let payload: CheckoutPayload;
  try {
    payload = await request.json();
  } catch {
    return err('Invalid request body', 400);
  }

  const town = await getTown(payload.town_slug);
  if (!town) return err('Unknown town', 400);
  if (!payload.acknowledge_final_sale) {
    return err('You must acknowledge the final-sale policy before paying.', 400);
  }

  const name = (payload.name || '').trim();
  const email = (payload.email || '').trim();
  const phone = (payload.phone || '').trim();
  if (!name || !email || !phone) {
    return err('Missing parent contact info', 400);
  }

  const catalog = await getCatalog(town.slug);
  const byId = new Map(catalog.filter((p) => p.enabled).map((p) => [p.id, p]));

  const players = Array.isArray(payload.players) ? payload.players : [];
  if (players.length === 0) return err('Add at least one player', 400);

  const lineItems: any[] = [];
  const resolvedPlayers: any[] = [];
  let subtotalCents = 0;

  for (const player of players) {
    const pname = (player?.name || '').trim();
    if (!pname) return err('Each player needs a name', 400);

    const rawItems = Array.isArray(player.items) ? player.items : [];
    const hasJersey = rawItems.some((it) => byId.get(it.productId)?.personalized);
    if (!hasJersey) return err(`Add a jersey for ${pname}`, 400);

    const resolvedItems: any[] = [];
    for (const it of rawItems) {
      const prod = byId.get(it.productId);
      if (!prod) continue; // ignore unknown / disabled products
      if (prod.priceCents <= 0) {
        return err(`Pricing not set for ${prod.label}. Please call (978) 352-8240.`, 503);
      }

      const qty = Math.min(20, Math.max(1, Math.floor(Number(it.quantity) || 1)));
      const size = (it.size || '').trim();
      const number = (it.number || '').trim();
      const option = (it.option || '').trim();

      if ((prod.sizing === 'apparel' || prod.sizing === 'shoe') && !size) {
        return err(`Select a size for ${pname}'s ${prod.label}`, 400);
      }
      if (prod.personalized && !number) {
        return err(`Add a number for ${pname}'s ${prod.label}`, 400);
      }

      const descParts = [
        size ? (prod.sizing === 'shoe' ? `Shoe ${size}` : `Size ${size}`) : '',
        number ? `#${number}` : '',
        option,
      ].filter(Boolean);

      lineItems.push({
        quantity: qty,
        price_data: {
          currency: 'usd',
          unit_amount: prod.priceCents,
          product_data: {
            name: `${town.name} ${prod.label} — ${pname}`,
            ...(descParts.length ? { description: descParts.join(' · ') } : {}),
            tax_code: prod.taxCategory === 'general' ? TAX_CODE_GENERAL : TAX_CODE_CLOTHING,
          },
          tax_behavior: 'exclusive',
        },
      });

      subtotalCents += prod.priceCents * qty;
      resolvedItems.push({
        productId: prod.id,
        label: prod.label,
        size,
        number,
        option,
        quantity: qty,
        priceCents: prod.priceCents,
      });
    }

    resolvedPlayers.push({
      name: pname,
      gender: (player.gender || '').trim(),
      grade: (player.grade || '').trim(),
      items: resolvedItems,
    });
  }

  if (lineItems.length === 0) return err('Your order is empty', 400);
  if (lineItems.length > MAX_LINE_ITEMS) {
    return err('Order too large — please call the shop at (978) 352-8240.', 400);
  }

  // Human-readable summary stored on the submission for quick admin scanning.
  const orderSummary = resolvedPlayers
    .map((p, i) => {
      const head = `Player ${i + 1}: ${p.name}${p.gender ? ` (${p.gender})` : ''}${p.grade ? `, grade ${p.grade}` : ''}`;
      const lines = p.items
        .map((it: any) => `  - ${it.label}${it.size ? ` ${it.size}` : ''}${it.number ? ` #${it.number}` : ''}${it.option ? ` [${it.option}]` : ''}${it.quantity > 1 ? ` x${it.quantity}` : ''}`)
        .join('\n');
      return head + '\n' + lines;
    })
    .join('\n\n');

  // Save the inbox submission first so the webhook can flip it to paid.
  const submissionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  await saveSubmission({
    id: submissionId,
    formName: 'parent-order',
    data: {
      name,
      email,
      phone,
      town: town.name,
      town_slug: town.slug,
      player_count: String(resolvedPlayers.length),
      jersey_count: String(resolvedPlayers.length), // one jersey per player; keeps inbox list preview accurate
      notes: payload.notes || '',
      subtotal_cents: String(subtotalCents),
      players_json: JSON.stringify(resolvedPlayers),
      order_summary: orderSummary,
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
      customer_email: email,
      line_items: lineItems,
      automatic_tax: { enabled: true },
      success_url: `${siteUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/order/${town.slug}?canceled=1`,
      metadata: {
        submission_id: submissionId,
        town_slug: town.slug,
        jersey_count: String(resolvedPlayers.length),
      },
      payment_intent_data: {
        description: `${town.name} order — ${resolvedPlayers.length} ${resolvedPlayers.length === 1 ? 'player' : 'players'}, ${lineItems.length} item(s). All custom jersey sales are final.`,
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
    // Stripe errors can echo back the request payload (parent email/name).
    // Log only the type/code, not the full error.
    console.error('Stripe Checkout Session create failed:', e?.type || e?.name || 'Unknown', e?.code || '');
    return err('Could not start checkout. Please try again or call (978) 352-8240.', 502);
  }
};
