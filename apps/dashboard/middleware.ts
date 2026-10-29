import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * Sends signed-out visitors to /login before any page renders. Convenience only: the cookie
 * isn't verified here, the API does that on every call (an invalid one comes back as 401).
 */
export function middleware(req: NextRequest) {
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!login|api/|_next/|favicon.ico).*)'],
};
