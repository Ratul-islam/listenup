import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry only transient failures, never 4xx responses
      retry: (failureCount, error) =>
        failureCount < 2 && (!(error instanceof ApiError) || error.isNetworkError || error.status >= 500),
    },
    mutations: {
      retry: false,
    },
  },
});
