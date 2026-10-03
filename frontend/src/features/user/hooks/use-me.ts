import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthStore } from '@/features/auth/store/auth.store';

import { userApi } from '../api/user.api';

export const meQueryKey = ['user', 'me'] as const;

/** Fresh profile from the server, kept in sync with the cached auth user */
export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);
  const query = useQuery({ queryKey: meQueryKey, queryFn: userApi.me });

  useEffect(() => {
    if (query.data) setUser(query.data);
  }, [query.data, setUser]);

  return query;
}
