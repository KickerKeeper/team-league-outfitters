import type { APIRoute } from 'astro';
import { recordPageView } from '../../../lib/analytics';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
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
