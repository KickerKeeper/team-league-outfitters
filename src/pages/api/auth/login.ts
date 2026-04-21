import type { APIRoute } from 'astro';
import { validateCredentials, createSessionToken } from '../../../lib/auth';
import { checkDurableRateLimit, getClientIp } from '../../../lib/ratelimit';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);

  // Per-IP throttle — 5 attempts per 15 minutes.
  const ipOk = await checkDurableRateLimit('login-ip', ip, 5, 15 * 60 * 1000);
  if (!ipOk) {
    return new Response(JSON.stringify({ error: 'Too many login attempts. Try again in a few minutes.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Global cap so a botnet across many IPs can't grind down the single admin
  // account. 30 attempts/15min site-wide is more than legitimate use needs.
  const globalOk = await checkDurableRateLimit('login-global', 'all', 30, 15 * 60 * 1000);
  if (!globalOk) {
    return new Response(JSON.stringify({ error: 'Too many login attempts. Try again in a few minutes.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { username, password } = body;

    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return new Response(JSON.stringify({ error: 'Missing credentials' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (username.length > 200 || password.length > 200) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!validateCredentials(username, password)) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = createSessionToken(username);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `tlo_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=28800`,
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
