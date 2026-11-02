import { useState } from 'react';

/**
 * The state of a list's pull to refresh. Only the pull shows the spinner, not every fetch of the query: a search is
 * fetched again with each letter, and a spinner shown for that pushes the list down and back up.
 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return { refreshing, onRefresh: () => void onRefresh() };
}
