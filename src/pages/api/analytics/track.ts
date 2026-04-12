import type { APIRoute } from 'astro';
import { recordPageView } from '../../../lib/analytics';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Rate limit: 30 page views per minute per IP
    const ip = getClientIp(request);
    if (!checkRateLimit(ip, 30, 60000)) {
      return new Response('', { status: 429 });
    }
    const body = await request.json();
    const { path, referrer, visitorId } = body;

    if (!path || !visitorId) {
      return new Response('', { status: 400 });
    }

    // Get country from Netlify geo headers
    const country = request.headers.get('x-nf-geo')
      ? JSON.parse(request.headers.get('x-nf-geo') || '{}')?.country?.name
      : request.headers.get('x-country') || undefined;

    await recordPageView({
      path,
      referrer: referrer || '',
      userAgent: request.headers.get('user-agent') || '',
      visitorId,
      timestamp: Date.now(),
    }, country);

    return new Response('', { status: 204 });
  } catch {
    return new Response('', { status: 500 });
  }
};
