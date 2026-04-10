import type { APIRoute } from 'astro';
import { saveSubmission } from '../../../lib/inbox';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let data: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await request.text();
      const params = new URLSearchParams(body);
      for (const [key, value] of params) {
        if (key !== 'form-name' && key !== 'bot-field') {
          data[key] = value;
        }
      }
    } else {
      data = await request.json();
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const formName = data['form-name'] || 'order';
    delete data['form-name'];

    await saveSubmission({
      id,
      formName,
      data,
      createdAt: new Date().toISOString(),
      status: 'new',
      replies: [],
    });

    return new Response(JSON.stringify({ ok: true, id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Submit error:', e);
    return new Response(JSON.stringify({ error: 'Failed to save' }), { status: 500 });
  }
};
