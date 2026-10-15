import { useQuery } from '@tanstack/react-query';

import { catalogApi } from '../api/catalog.api';

export const catalogKey = ['catalog'] as const;

/** Explore's free classics; the list itself rarely changes, only what's on the shelf */
export function useCatalog() {
  return useQuery({ queryKey: catalogKey, queryFn: catalogApi.list, staleTime: 60_000 });
}
