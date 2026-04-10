import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'tlo_session=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0',
    },
  });
};
