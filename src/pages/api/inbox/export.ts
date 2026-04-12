import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { getSubmissions } from '../../../lib/inbox';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const submissions = await getSubmissions();

  // Build CSV
  const headers = ['ID', 'Date', 'Type', 'Stage', 'Name', 'Email', 'Phone', 'Team', 'Sport', 'Colors', 'Players', 'Sizes', 'Numbers', 'Customization', 'Fulfillment', 'Notes', 'Messages'];

  const escape = (val: string) => {
    if (!val) return '';
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  };

  const rows = submissions.map(s => {
    const msgCount = (s.messages || []).length;
    return [
      s.id,
      s.createdAt,
      s.formName === 'email' ? 'Email' : 'Order',
      s.stage || 'review',
      s.data.name || '',
      s.data.email || '',
      s.data.phone || '',
      s.data.team || '',
      s.data.sport || '',
      s.data.colors || '',
      s.data.players || '',
      s.data.sizes || '',
      s.data.numbers || '',
      s.data.customization || '',
      s.data.fulfillment || '',
      s.data.notes || '',
      String(msgCount),
    ].map(escape).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const date = new Date().toISOString().split('T')[0];

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="tlo-orders-${date}.csv"`,
    },
  });
};
