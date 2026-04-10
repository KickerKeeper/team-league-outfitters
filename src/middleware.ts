import { defineMiddleware } from 'astro:middleware';
import { getSessionFromCookie } from './lib/auth';

export const onRequest = defineMiddleware(async ({ request, redirect, url }, next) => {
  // Only protect /admin/* routes (except /admin/login)
  if (url.pathname.startsWith('/admin') && !url.pathname.startsWith('/admin/login')) {
    const cookie = request.headers.get('cookie');
    if (!getSessionFromCookie(cookie)) {
      return redirect('/admin/login');
    }
  }

  return next();
});
