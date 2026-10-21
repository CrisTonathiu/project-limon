/** Pure helpers for the API proxy and session routes (unit-tested in proxy.test.ts). */

/**
 * The API URL for a proxied path. Each segment is re-encoded, and `.` / `..` are refused, so a
 * request can't climb out of /api/v1. Returns null for a path that isn't allowed.
 */
export function apiUrl(apiBaseUrl: string, segments: string[], search: string): string | null {
  if (segments.length === 0 || segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  return `${apiBaseUrl.replace(/\/+$/, '')}/api/v1/${segments.map(encodeURIComponent).join('/')}${search}`;
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/**
 * CSRF guard on top of the SameSite=Strict cookie: a state-changing request must carry an
 * Origin header equal to the dashboard's own. Reads are allowed without one.
 */
export function isAllowedOrigin(method: string, origin: string | null, expected: string): boolean {
  if (SAFE_METHODS.has(method)) return true;
  return origin !== null && origin === expected;
}

/** Response headers passed back from the API; everything else (cookies included) is dropped. */
export const FORWARDED_RESPONSE_HEADERS = ['content-type', 'x-request-id', 'retry-after'] as const;
