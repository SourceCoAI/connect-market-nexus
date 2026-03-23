/**
 * Navigation State Context (Phase 6)
 *
 * Replaces NavigationStateManager singleton with React context.
 * Prevents navigation state conflicts and ensures queries complete before navigation.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { QueryClient } from '@tanstack/react-query';

type NavigationGuard = (to: string, from: string) => boolean | Promise<boolean>;
type LoadingStateListener = (isLoading: boolean) => void;

interface NavigationState {
  currentRoute: string;
  isNavigating: boolean;
  hasActiveQueries: boolean;
  persistentLoadingStates: Map<string, boolean>;
}

interface NavigationStateContextType {
  getState: () => NavigationState;
  setCurrentRoute: (newRoute: string) => Promise<boolean>;
  addNavigationGuard: (guard: NavigationGuard) => () => void;
  setLoadingState: (context: string, isLoading: boolean) => void;
  getLoadingState: (context: string) => boolean;
  getOverallLoadingState: () => boolean;
  subscribeToLoadingState: (listener: LoadingStateListener) => () => void;
  waitForQueriesSettled: (timeout?: number) => Promise<boolean>;
  clearLoadingState: (context: string) => void;
  clearAllLoadingStates: () => void;
  initialize: (queryClient: QueryClient) => void;
}

const NavigationStateContext = createContext<NavigationStateContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useNavigationState = () => {
  const context = useContext(NavigationStateContext);
  if (context === undefined) {
    throw new Error('useNavigationState must be used within a NavigationStateProvider');
  }
  return context;
};

export const NavigationStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queryClientRef = useRef<QueryClient | null>(null);
  const [navigationState, setNavigationState] = useState<NavigationState>({
    currentRoute: '/',
    isNavigating: false,
    hasActiveQueries: false,
    persistentLoadingStates: new Map(),
  });

  const [navigationGuards] = useState(new Set<NavigationGuard>());
  const [loadingListeners] = useState(new Set<LoadingStateListener>());
  const queryCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Configuration
  const QUERY_SETTLE_TIMEOUT = 2000; // ms
  const QUERY_CHECK_INTERVAL = 100; // ms

  const initialize = useCallback(
    (queryClient: QueryClient) => {
      queryClientRef.current = queryClient;

      // Start query monitoring
      if (queryCheckIntervalRef.current) return;

      queryCheckIntervalRef.current = setInterval(() => {
        if (!queryClientRef.current) return;

        const isFetching = queryClientRef.current.isFetching() > 0;
        const isMutating = queryClientRef.current.isMutating() > 0;
        const hasActiveQueries = isFetching || isMutating;

        setNavigationState((prev) => {
          if (prev.hasActiveQueries !== hasActiveQueries) {
            const newState = { ...prev, hasActiveQueries };

            // Notify loading listeners
            const overallLoading =
              Array.from(newState.persistentLoadingStates.values()).some(Boolean) ||
              newState.hasActiveQueries ||
              newState.isNavigating;

            loadingListeners.forEach((listener) => {
              try {
                listener(overallLoading);
              } catch (error) {
                console.error('❌ Loading state listener error:', error);
              }
            });

            return newState;
          }
          return prev;
        });
      }, QUERY_CHECK_INTERVAL);

      // NavigationStateManager initialized
    },
    [loadingListeners],
  );

  const getState = useCallback(() => ({ ...navigationState }), [navigationState]);

  const checkNavigationGuards = useCallback(
    async (to: string, from: string): Promise<boolean> => {
      for (const guard of navigationGuards) {
        try {
          const result = await guard(to, from);
          if (!result) return false;
        } catch (error) {
          console.error('❌ Navigation guard error:', error);
          return false;
        }
      }
      return true;
    },
    [navigationGuards],
  );

  const waitForQueries = useCallback(async (): Promise<boolean> => {
    if (!queryClientRef.current || !navigationState.hasActiveQueries) {
      return true;
    }

    // Waiting for queries to settle before navigation
    return await waitForQueriesSettled();
  }, [navigationState.hasActiveQueries]);

  const waitForQueriesSettled = useCallback(
    (timeout: number = QUERY_SETTLE_TIMEOUT): Promise<boolean> => {
      return new Promise((resolve) => {
        const startTime = Date.now();

        const checkQueries = () => {
          if (!queryClientRef.current) {
            resolve(true);
            return;
          }

          const isFetching = queryClientRef.current.isFetching() > 0;
          const isMutating = queryClientRef.current.isMutating() > 0;
          const hasActiveQueries = isFetching || isMutating;

          if (!hasActiveQueries) {
            // All queries settled
            resolve(true);
            return;
          }

          if (Date.now() - startTime > timeout) {
            // Query settle timeout reached
            resolve(false);
            return;
          }

          setTimeout(checkQueries, QUERY_CHECK_INTERVAL);
        };

        checkQueries();
      });
    },
    [],
  );

  const preserveLoadingStates = useCallback((fromRoute: string, toRoute: string) => {
    // Preserve certain loading states when navigating between related routes
    const shouldPreserve = shouldPreserveLoadingState(fromRoute, toRoute);

    if (!shouldPreserve) {
      // Clear non-persistent states on navigation
      setNavigationState((prev) => {
        const newPersistentStates = new Map(prev.persistentLoadingStates);
        const keysToRemove: string[] = [];

        newPersistentStates.forEach((_, key) => {
          if (key.includes('temporary') || key.includes('page-specific')) {
            keysToRemove.push(key);
          }
        });

        keysToRemove.forEach((key) => {
          newPersistentStates.delete(key);
        });

        return {
          ...prev,
          persistentLoadingStates: newPersistentStates,
        };
      });
    }

    // Loading states preserved
  }, []);

  const shouldPreserveLoadingState = useCallback((fromRoute: string, toRoute: string): boolean => {
    // Preserve loading states when navigating within the same section
    const getRouteSection = (route: string): string => {
      const segments = route.split('/').filter(Boolean);
      return segments[0] || 'root';
    };

    const fromSection = getRouteSection(fromRoute);
    const toSection = getRouteSection(toRoute);

    return fromSection === toSection;
  }, []);

  const setCurrentRoute = useCallback(
    async (newRoute: string): Promise<boolean> => {
      const oldRoute = navigationState.currentRoute;

      if (oldRoute === newRoute) return true;

      // Navigation attempt

      // Check navigation guards
      const canNavigate = await checkNavigationGuards(newRoute, oldRoute);
      if (!canNavigate) {
        // Navigation blocked by guard
        return false;
      }

      // Wait for active queries if needed
      const queriesSettled = await waitForQueries();
      if (!queriesSettled) {
        // Navigation delayed due to active queries
        return false;
      }

      // Update navigation state
      setNavigationState((prev) => ({
        ...prev,
        isNavigating: true,
        currentRoute: newRoute,
      }));

      // Preserve loading states across navigation
      preserveLoadingStates(oldRoute, newRoute);

      // Navigation completed
      setNavigationState((prev) => ({ ...prev, isNavigating: false }));

      return true;
    },
    [navigationState.currentRoute, checkNavigationGuards, waitForQueries, preserveLoadingStates],
  );

  const addNavigationGuard = useCallback(
    (guard: NavigationGuard): (() => void) => {
      navigationGuards.add(guard);

      return () => {
        navigationGuards.delete(guard);
      };
    },
    [navigationGuards],
  );

  const setLoadingState = useCallback(
    (context: string, isLoading: boolean) => {
      setNavigationState((prev) => {
        const changed = prev.persistentLoadingStates.get(context) !== isLoading;

        if (changed) {
          const newStates = new Map(prev.persistentLoadingStates);
          newStates.set(context, isLoading);

          const newState = {
            ...prev,
            persistentLoadingStates: newStates,
          };

          // Notify loading listeners
          const overallLoading =
            Array.from(newStates.values()).some(Boolean) ||
            prev.hasActiveQueries ||
            prev.isNavigating;

          loadingListeners.forEach((listener) => {
            try {
              listener(overallLoading);
            } catch (error) {
              console.error('❌ Loading state listener error:', error);
            }
          });

          return newState;
        }

        return prev;
      });
    },
    [loadingListeners],
  );

  const getLoadingState = useCallback(
    (context: string): boolean => {
      return navigationState.persistentLoadingStates.get(context) || false;
    },
    [navigationState.persistentLoadingStates],
  );

  const getOverallLoadingState = useCallback((): boolean => {
    return (
      Array.from(navigationState.persistentLoadingStates.values()).some(Boolean) ||
      navigationState.hasActiveQueries ||
      navigationState.isNavigating
    );
  }, [navigationState]);

  const subscribeToLoadingState = useCallback(
    (listener: LoadingStateListener): (() => void) => {
      loadingListeners.add(listener);

      // Immediately notify with current state
      listener(getOverallLoadingState());

      return () => {
        loadingListeners.delete(listener);
      };
    },
    [loadingListeners, getOverallLoadingState],
  );

  const clearLoadingState = useCallback(
    (context: string) => {
      setNavigationState((prev) => {
        if (prev.persistentLoadingStates.has(context)) {
          const newStates = new Map(prev.persistentLoadingStates);
          newStates.delete(context);

          const newState = {
            ...prev,
            persistentLoadingStates: newStates,
          };

          // Notify loading listeners
          const overallLoading =
            Array.from(newStates.values()).some(Boolean) ||
            prev.hasActiveQueries ||
            prev.isNavigating;

          loadingListeners.forEach((listener) => {
            try {
              listener(overallLoading);
            } catch (error) {
              console.error('❌ Loading state listener error:', error);
            }
          });

          return newState;
        }
        return prev;
      });
    },
    [loadingListeners],
  );

  const clearAllLoadingStates = useCallback(() => {
    setNavigationState((prev) => {
      const newState = {
        ...prev,
        persistentLoadingStates: new Map(),
      };

      // Notify loading listeners
      const overallLoading = prev.hasActiveQueries || prev.isNavigating;

      loadingListeners.forEach((listener) => {
        try {
          listener(overallLoading);
        } catch (error) {
          console.error('❌ Loading state listener error:', error);
        }
      });

      return newState;
    });
  }, [loadingListeners]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Destroying NavigationStateManager

      if (queryCheckIntervalRef.current) {
        clearInterval(queryCheckIntervalRef.current);
        queryCheckIntervalRef.current = null;
      }

      navigationGuards.clear();
      loadingListeners.clear();
      queryClientRef.current = null;
    };
  }, [navigationGuards, loadingListeners]);

  const value = useMemo(
    () => ({
      getState,
      setCurrentRoute,
      addNavigationGuard,
      setLoadingState,
      getLoadingState,
      getOverallLoadingState,
      subscribeToLoadingState,
      waitForQueriesSettled,
      clearLoadingState,
      clearAllLoadingStates,
      initialize,
    }),
    [
      getState,
      setCurrentRoute,
      addNavigationGuard,
      setLoadingState,
      getLoadingState,
      getOverallLoadingState,
      subscribeToLoadingState,
      waitForQueriesSettled,
      clearLoadingState,
      clearAllLoadingStates,
      initialize,
    ],
  );

  return (
    <NavigationStateContext.Provider value={value}>{children}</NavigationStateContext.Provider>
  );
};
