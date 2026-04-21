import type { APIRoute } from 'astro';
import { parseSessionFromCookie, revokeSession } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const session = parseSessionFromCookie(cookie);
  if (session) {
    await revokeSession(session);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'tlo_session=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0',
    },
  });
};
