import { defineMiddleware } from 'astro:middleware';
import { getSessionFromCookie } from './lib/auth';

// Endpoints under /api/ that REQUIRE admin auth. Each handler also checks
// individually (defense in depth), but listing them here makes it impossible
// to forget the check on a future endpoint that lands in one of these prefixes.
const ADMIN_API_PREFIXES = [
  '/api/inbox/',       // submit + inbound are public — exempted below
  '/api/pricing/',
  '/api/assistant/',
  '/api/analytics/stats',
];

// Endpoints under those prefixes that are intentionally public.
// Anyone-callable: /api/inbox/submit (the order form), /api/inbox/inbound (Resend webhook).
const PUBLIC_EXEMPTIONS = new Set<string>([
  '/api/inbox/submit',
  '/api/inbox/inbound',
]);

function isProtectedApi(pathname: string): boolean {
  if (PUBLIC_EXEMPTIONS.has(pathname)) return false;
  return ADMIN_API_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function jsonUnauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequest = defineMiddleware(async ({ request, redirect, url }, next) => {
  // Normalize before pattern matching so trailing-slash / case games can't
  // sneak past the prefix check.
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  pathname = pathname.toLowerCase().replace(/\/+/g, '/');
  // Strip a single trailing slash for matching purposes (but keep root).
  const matchPath = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;

  const cookie = request.headers.get('cookie');

  // Browser-routed admin pages: redirect to login.
  if (matchPath.startsWith('/admin') && !matchPath.startsWith('/admin/login')) {
    if (!getSessionFromCookie(cookie)) {
      return redirect('/admin/login');
    }
  }

  // Protected JSON APIs: return 401 (don't redirect — clients want the status).
  if (isProtectedApi(matchPath)) {
    if (!getSessionFromCookie(cookie)) {
      return jsonUnauthorized();
    }
  }

  return next();
});
