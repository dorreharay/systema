import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';

/**
 * One cache for everything read from the backend. A list is shown from the cache at once and
 * refreshed behind it; a request that failed because the server said no (a 4xx) is not tried again,
 * one that failed because the connection did is.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) =>
        failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});
