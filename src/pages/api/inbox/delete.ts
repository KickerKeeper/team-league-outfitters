import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { getStore } from '@netlify/blobs';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }

  const store = getStore('inbox');

  // Delete the submission
  await store.delete(`submission/${id}`);

  // Remove from index
  try {
    const index = await store.get('index');
    if (index) {
      const ids: string[] = JSON.parse(index);
      const updated = ids.filter(i => i !== id);
      await store.set('index', JSON.stringify(updated));
    }
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
