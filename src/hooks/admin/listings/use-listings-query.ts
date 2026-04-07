import { useListingsByType } from './use-listings-by-type';

/**
 * Hook for fetching admin listings with status filtering.
 * Delegates to useListingsByType('all') to share the query cache
 * and avoid redundant listing query definitions.
 */
export function useListingsQuery(status?: 'active' | 'inactive' | 'all', enabled?: boolean) {
  // Map the enabled flag: useListingsByType handles its own auth gating,
  // but we pass undefined status as 'all' to match the expected behavior.
  const mappedStatus = status || 'all';

  const result = useListingsByType('all' as const, mappedStatus === 'all' ? undefined : mappedStatus as 'active' | 'inactive' | 'archived');

  // If explicitly disabled, return empty data
  if (enabled === false) {
    return {
      ...result,
      data: [],
    };
  }

  return result;
}
