import type { APIRoute } from 'astro';
import { findByEmail } from '../../../lib/inbox';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

const stageLabels: Record<string, string> = {
  'review': 'Order Received — Under Review',
  'production': 'Confirmed — In Production',
  'ready': 'Ready for Pickup',
  'picked-up': 'Picked Up — Complete',
};

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(ip, 10, 60000)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }

  try {
    const { email } = await request.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), { status: 400 });
    }

    const sub = await findByEmail(email);
    if (!sub) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stage = sub.stage || 'review';
    const stageIndex = ['review', 'production', 'ready', 'picked-up'].indexOf(stage);

    return new Response(JSON.stringify({
      found: true,
      team: sub.data.team || '',
      sport: sub.data.sport || '',
      stage: stage,
      stageLabel: stageLabels[stage] || stage,
      stageNumber: stageIndex + 1,
      date: sub.createdAt,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }
};
