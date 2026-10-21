/**
 * The nutritionist's session: a Firebase session cookie (or a dev token locally), httpOnly so
 * page scripts never see it. `__Host-` pins it to this origin, over HTTPS, with no Domain.
 * Plain name in development, where the dashboard runs on http://localhost.
 * No Node imports: the middleware (Edge runtime) reads the name too.
 */
const secure = process.env.NODE_ENV === 'production';

export const SESSION_COOKIE = secure ? '__Host-limon_session' : 'limon_session';

/** A working day. Firebase allows 5 minutes to 2 weeks; dev tokens last 12 h as well. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export const sessionCookieOptions = {
  httpOnly: true,
  secure,
  sameSite: 'strict',
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const;
