import { NextResponse, type NextRequest } from 'next/server';
import { apiUrl, FORWARDED_RESPONSE_HEADERS, isAllowedOrigin } from '@/lib/proxy';
import { serverEnv } from '@/lib/server-env';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };

/**
 * Same-origin proxy to the API. The browser calls /api/v1/… with its httpOnly session cookie;
 * this forwards the call with the cookie as the bearer credential. Only the body and the
 * content headers go through: no client Authorization, cookies or tenant headers.
 * The API stays the authority on who may do what.
 */
async function proxy(req: NextRequest, { params }: Context) {
  const env = serverEnv();
  if (!isAllowedOrigin(req.method, req.headers.get('origin'), env.origin)) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Cross-origin request refused' } }, { status: 403 });
  }
  const url = apiUrl(env.apiBaseUrl, (await params).path, req.nextUrl.search);
  if (!url) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });

  const headers: Record<string, string> = { Accept: req.headers.get('accept') ?? 'application/json' };
  const contentType = req.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (session) headers['Authorization'] = `Bearer ${session}`;

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'API unavailable' } }, { status: 502 });

  const out = new NextResponse(res.status === 204 ? null : res.body, { status: res.status });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = res.headers.get(name);
    if (value) out.headers.set(name, value);
  }
  out.headers.set('Cache-Control', 'no-store');
  // An expired or revoked session: drop the cookie so the next page load goes to /login.
  if (res.status === 401 && session) out.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
  return out;
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
