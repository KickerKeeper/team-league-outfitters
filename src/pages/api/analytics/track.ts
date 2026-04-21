import type { APIRoute } from 'astro';
import { recordPageView } from '../../../lib/analytics';
import { checkRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

const MAX_BODY_BYTES = 4 * 1024;
const MAX_PATH_LEN = 500;
const MAX_REFERRER_LEN = 1000;
const MAX_VISITOR_LEN = 64;
const MAX_UA_LEN = 500;

function clip(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.length > max ? s.slice(0, max) : s;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Rate limit: 30 page views per minute per IP
    const ip = getClientIp(request);
    if (!checkRateLimit(`track:${ip}`, 30, 60000)) {
      return new Response(null, { status: 429 });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(null, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400 });
    }

    const path = clip(body?.path, MAX_PATH_LEN);
    const visitorId = clip(body?.visitorId, MAX_VISITOR_LEN);
    const referrer = clip(body?.referrer, MAX_REFERRER_LEN);

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
      referrer,
      userAgent: clip(request.headers.get('user-agent'), MAX_UA_LEN),
      visitorId,
      timestamp: Date.now(),
    }, country);

    return new Response(null, { status: 200 });
  } catch (e) {
    console.error('Analytics track error:', (e as Error)?.name || 'Unknown');
    return new Response(null, { status: 500 });
  }
};
