import type { APIRoute } from 'astro';
import { recordPageView } from '../../../lib/analytics';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Rate limit: 30 page views per minute per IP
    const ip = getClientIp(request);
    if (!checkRateLimit(ip, 30, 60000)) {
      return new Response(null, { status: 429 });
    }

    const body = await request.json();
    const { path, referrer, visitorId } = body;

    if (!path || !visitorId) {
      return new Response(null, { status: 400 });
    }

    // Get country from Netlify geo headers (safely)
    let country: string | undefined;
    try {
      const geoHeader = request.headers.get('x-nf-geo');
      if (geoHeader) {
        const geo = JSON.parse(geoHeader);
        country = geo?.country?.name;
      }
    } catch {
      // Ignore geo parsing errors
    }

    await recordPageView({
      path,
      referrer: referrer || '',
      userAgent: request.headers.get('user-agent') || '',
      visitorId,
      timestamp: Date.now(),
    }, country);

    return new Response(null, { status: 200 });
  } catch (e) {
    console.error('Analytics track error:', e);
    return new Response(null, { status: 500 });
  }
};
