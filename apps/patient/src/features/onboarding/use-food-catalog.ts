import type { FoodOptionDto } from '@limon/types';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';

type CatalogLoad = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; foods: FoodOptionDto[] };

/** One request per app run: the catalog only changes when our team loads new foods. */
let cached: Promise<FoodOptionDto[]> | null = null;
const fetchCatalog = () => {
  cached ??= api.foods.catalog().then(
    ({ items }) => items,
    (err: unknown) => {
      cached = null; // Let a retry ask again.
      throw err;
    },
  );
  return cached;
};

/** The food catalog (sorted by name), for picking disliked foods. */
export function useFoodCatalog() {
  const [load, setLoad] = useState<CatalogLoad>({ status: 'loading' });

  const fetch = useCallback(() => {
    let active = true;
    setLoad({ status: 'loading' });
    fetchCatalog()
      .then((foods) => active && setLoad({ status: 'loaded', foods }))
      .catch((err) => {
        console.error('[onboarding] loading the food catalog failed', err);
        if (active) setLoad({ status: 'failed' });
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(fetch, [fetch]);

  return { load, retry: fetch };
}
