'use client';

import { createApiClient } from '@limon/api-client';
import { publicEnv } from '@/lib/env';
import { session } from './session';

export const api = createApiClient({ baseUrl: publicEnv.apiBaseUrl, getAccessToken: session.getToken });
