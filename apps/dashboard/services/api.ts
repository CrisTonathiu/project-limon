'use client';

import { createApiClient } from '@limon/api-client';

/**
 * Calls go to this origin's /api/v1 proxy, which adds the session from the httpOnly cookie
 * (app/api/v1/[...path]/route.ts). The browser never holds a token.
 */
export const api = createApiClient({ baseUrl: '', getAccessToken: async () => null });
