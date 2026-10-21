import { NextResponse, type NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { isAllowedOrigin } from '@/lib/proxy';
import { serverEnv } from '@/lib/server-env';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from '@/lib/session-cookie';

export const dynamic = 'force-dynamic';

/** An ID token older than this can't start a session: a session needs a fresh sign-in. */
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

const fail = (status: number, code: string) => NextResponse.json({ error: { code } }, { status });

/**
 * Starts a session. Identity Platform: `{ idToken }` from a project-level sign-in becomes a
 * Firebase session cookie. Dev auth: `{ subject, email? }` becomes a dev token from the API.
 * Either way the credential only ever lives in the httpOnly cookie. Unverified emails get a
 * session too (registration needs one); the API refuses them everywhere else.
 */
export async function POST(req: NextRequest) {
  const env = serverEnv();
  if (!isAllowedOrigin('POST', req.headers.get('origin'), env.origin)) return fail(403, 'FORBIDDEN');
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  let credential: string;
  if (env.authProvider === 'identity-platform') {
    const idToken = body?.['idToken'];
    if (typeof idToken !== 'string') return fail(400, 'VALIDATION_ERROR');
    const auth = adminAuth(env.projectId!);
    try {
      const decoded = await auth.verifyIdToken(idToken);
      // Patients' logins live in their practice's identity tenant; the dashboard is for
      // project-level (nutritionist) logins only.
      if (decoded.firebase.tenant) return fail(403, 'FORBIDDEN');
      if (Date.now() / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_SECONDS) return fail(401, 'UNAUTHENTICATED');
      credential = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 });
    } catch {
      return fail(401, 'UNAUTHENTICATED');
    }
  } else {
    const subject = body?.['subject'];
    const email = body?.['email'];
    if (typeof subject !== 'string' || (email !== undefined && typeof email !== 'string')) return fail(400, 'VALIDATION_ERROR');
    const res = await fetch(`${env.apiBaseUrl}/api/v1/dev/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, email }),
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) return fail(503, 'DEV_LOGIN_UNAVAILABLE');
    credential = ((await res.json()) as { accessToken: string }).accessToken;
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, credential, sessionCookieOptions);
  return response;
}

/** Ends the session on this browser. */
export async function DELETE(req: NextRequest) {
  if (!isAllowedOrigin('DELETE', req.headers.get('origin'), serverEnv().origin)) return fail(403, 'FORBIDDEN');
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
