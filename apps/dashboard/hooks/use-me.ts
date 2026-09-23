'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@limon/api-client';
import type { MeResponse } from '@limon/types';
import { api } from '@/services/api';

export function useMe() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.auth.me().then(setMe).catch(setError).finally(() => setLoading(false));
  }, []);
  return { me, error, loading };
}
