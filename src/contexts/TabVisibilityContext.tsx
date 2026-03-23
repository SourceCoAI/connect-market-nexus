/**
 * Tab Visibility Context (Phase 6)
 *
 * Replaces TabVisibilityManager singleton with React context.
 * Manages tab visibility state and prevents infinite loading loops when switching tabs.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useMemo,
} from 'react';

type VisibilityListener = (isVisible: boolean) => void;

interface TabVisibilityContextType {
  isVisible: boolean;
  getVisibility: () => boolean;
  subscribe: (listener: VisibilityListener) => () => void;
  pauseOperation: (operationId: string) => void;
  resumeOperation: (operationId: string) => void;
  shouldPauseOperation: (operationId: string) => boolean;
  getTimeSinceLastVisibilityChange: () => number;
  isRecentlyVisible: (thresholdMs?: number) => boolean;
}

const TabVisibilityContext = createContext<TabVisibilityContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useTabVisibility = () => {
  const context = useContext(TabVisibilityContext);
  if (context === undefined) {
    throw new Error('useTabVisibility must be used within a TabVisibilityProvider');
  }
  return context;
};

export const TabVisibilityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isVisible, setIsVisible] = useState(() => !document.hidden);
  const [lastVisibilityChange, setLastVisibilityChange] = useState(() => Date.now());
  const [listeners] = useState(new Set<VisibilityListener>());
  const [pausedOperations] = useState(new Set<string>());

  const getVisibility = useCallback(() => isVisible, [isVisible]);

  const subscribe = useCallback(
    (listener: VisibilityListener) => {
      listeners.add(listener);

      // Immediately notify with current state
      listener(isVisible);

      return () => {
        listeners.delete(listener);
      };
    },
    [listeners, isVisible],
  );

  const pauseOperation = useCallback(
    (operationId: string) => {
      pausedOperations.add(operationId);
    },
    [pausedOperations],
  );

  const resumeOperation = useCallback(
    (operationId: string) => {
      pausedOperations.delete(operationId);
    },
    [pausedOperations],
  );

  const shouldPauseOperation = useCallback(
    (operationId: string) => {
      return !isVisible || pausedOperations.has(operationId);
    },
    [isVisible, pausedOperations],
  );

  const getTimeSinceLastVisibilityChange = useCallback(() => {
    return Date.now() - lastVisibilityChange;
  }, [lastVisibilityChange]);

  const isRecentlyVisible = useCallback(
    (thresholdMs: number = 1000) => {
      return isVisible && getTimeSinceLastVisibilityChange() < thresholdMs;
    },
    [isVisible, getTimeSinceLastVisibilityChange],
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      const newVisibility = !document.hidden;

      if (newVisibility !== isVisible) {
        // Debug log removed

        setIsVisible(newVisibility);
        setLastVisibilityChange(Date.now());

        // Notify all listeners
        listeners.forEach((listener) => {
          try {
            listener(newVisibility);
          } catch (error) {
            console.error('❌ Tab visibility listener error:', error);
          }
        });

        // Clear paused operations when becoming visible
        if (newVisibility) {
          pausedOperations.clear();
        }
      }
    };

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also listen for focus/blur events as backup
    const handleFocus = () => {
      if (document.hidden === false && !isVisible) {
        handleVisibilityChange();
      }
    };

    const handleBlur = () => {
      if (!isVisible) return; // Already handled
      setTimeout(handleVisibilityChange, 100); // Small delay to check document.hidden
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isVisible, listeners, pausedOperations]);

  const value = useMemo(
    () => ({
      isVisible,
      getVisibility,
      subscribe,
      pauseOperation,
      resumeOperation,
      shouldPauseOperation,
      getTimeSinceLastVisibilityChange,
      isRecentlyVisible,
    }),
    [
      isVisible,
      getVisibility,
      subscribe,
      pauseOperation,
      resumeOperation,
      shouldPauseOperation,
      getTimeSinceLastVisibilityChange,
      isRecentlyVisible,
    ],
  );

  return <TabVisibilityContext.Provider value={value}>{children}</TabVisibilityContext.Provider>;
};
