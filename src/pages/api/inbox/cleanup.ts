import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { getSubmissions } from '../../../lib/inbox';
import { getStore } from '@netlify/blobs';

export const prerender = false;

function cleanEmailBody(body: string): string {
  let clean = body;

  const gmailPattern = /On\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s*(AM|PM)\s+/i;
  const match = clean.match(gmailPattern);
  if (match && match.index !== undefined && match.index > 0) {
    clean = clean.substring(0, match.index);
  }

  clean = clean
    .replace(/\r?\n-{2,}\s*\r?\n[\s\S]*$/, '')
    .replace(/\r?\n_{3,}\s*\r?\n[\s\S]*$/, '')
    .trim();

  return clean;
}

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const store = getStore('inbox');
  const submissions = await getSubmissions();
  let cleaned = 0;

  for (const sub of submissions) {
    const msgs = sub.messages || [];
    let changed = false;

    for (const msg of msgs) {
      if (msg.type === 'received' && msg.body) {
        const original = msg.body;
        msg.body = cleanEmailBody(msg.body);
        if (msg.body !== original) changed = true;
      }
    }

    if (changed) {
      sub.messages = msgs;
      await store.set(`submission/${sub.id}`, JSON.stringify(sub));
      cleaned++;
    }
  }

  return new Response(JSON.stringify({ ok: true, cleaned }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
