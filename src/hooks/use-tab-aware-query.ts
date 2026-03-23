/**
 * Tab Aware Query Hook (Phase 6)
 *
 * Prevents infinite loading loops when switching tabs by managing query state intelligently.
 * Only refetches when truly necessary and tab has been visible for sufficient time.
 */

import { useQuery, QueryKey, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTabVisibility } from '@/contexts/TabVisibilityContext';

interface TabAwareQueryOptions<TData, TError> extends Omit<
  UseQueryOptions<TData, TError>,
  'queryKey' | 'queryFn'
> {
  // Custom options for tab awareness
  refetchOnVisibilityChange?: boolean;
  minVisibleTimeBeforeRefetch?: number; // ms
  pauseWhenHidden?: boolean;
}

export function useTabAwareQuery<TData = unknown, TError = Error>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options: TabAwareQueryOptions<TData, TError> = {},
): UseQueryResult<TData, TError> {
  const tabVisibility = useTabVisibility();
  const [isTabVisible, setIsTabVisible] = useState(tabVisibility.getVisibility());
  const [lastVisibilityChange, setLastVisibilityChange] = useState(Date.now());

  const {
    refetchOnVisibilityChange = false,
    minVisibleTimeBeforeRefetch = 1000,
    pauseWhenHidden = false, // Default to false to prevent queries from being disabled
    ...queryOptions
  } = options;

  // Track tab visibility
  useEffect(() => {
    const unsubscribe = tabVisibility.subscribe((visible) => {
      setIsTabVisible(visible);
      setLastVisibilityChange(Date.now());
    });

    return unsubscribe;
  }, [tabVisibility]);

  // Smart refetch logic - be more permissive to prevent "nothing loads" issues
  const shouldRefetch = () => {
    // Always allow queries when tab is visible
    if (isTabVisible) {
      return true;
    }

    // Only pause queries when explicitly requested AND tab is hidden
    if (pauseWhenHidden && !isTabVisible) {
      return false;
    }

    return true;
  };

  // Enhanced query options
  const enhancedOptions: UseQueryOptions<TData, TError> = {
    ...queryOptions,
    queryKey,
    queryFn,
    enabled: queryOptions.enabled !== false && shouldRefetch(),
    refetchOnWindowFocus: false, // We handle this manually with global config
    refetchOnMount: shouldRefetch(),
    refetchOnReconnect: shouldRefetch(),
  };

  const queryResult = useQuery(enhancedOptions);

  // Handle manual refetch on visibility change - but be conservative
  useEffect(() => {
    if (refetchOnVisibilityChange && isTabVisible && queryResult.refetch) {
      const timeSinceVisible = Date.now() - lastVisibilityChange;

      // Only refetch if explicitly requested and enough time has passed
      if (timeSinceVisible >= minVisibleTimeBeforeRefetch && !queryResult.isFetching) {
        // Small delay to avoid race conditions
        const timeoutId = setTimeout(() => {
          queryResult.refetch();
        }, 200);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [
    isTabVisible,
    lastVisibilityChange,
    refetchOnVisibilityChange,
    minVisibleTimeBeforeRefetch,
    queryResult.refetch,
    queryResult.isFetching,
    queryKey,
  ]);

  return queryResult;
}

// Convenience hook for common marketplace queries - more permissive settings
export function useTabAwareMarketplaceQuery<TData = unknown, TError = Error>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options: TabAwareQueryOptions<TData, TError> = {},
): UseQueryResult<TData, TError> {
  return useTabAwareQuery(queryKey, queryFn, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnVisibilityChange: false, // Don't refetch on tab switch for marketplace
    pauseWhenHidden: false, // Allow queries even when tab is hidden
    ...options,
  });
}
