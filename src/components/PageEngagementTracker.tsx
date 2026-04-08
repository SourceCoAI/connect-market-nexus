import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageEngagement } from '@/hooks/use-page-engagement';
import { useAuth } from '@/contexts/AuthContext';

interface PageEngagementTrackerProps {
  children: React.ReactNode;
}

/**
 * PageEngagementTracker - Tracks page-level engagement metrics
 * 
 * Metrics tracked:
 * - Time on page (seconds)
 * - Max scroll depth (0-100%)
 * - Focus time (active reading time)
 * - Click count
 * 
 * Data is flushed:
 * - On page navigation (route change)
 * - On page unload (tab close/refresh)
 */
const PageEngagementTrackerInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();
  const { handlePageChange } = usePageEngagement(user?.id);
  const previousPathRef = useRef<string>(location.pathname);

  useEffect(() => {
    // Check if path actually changed
    if (previousPathRef.current !== location.pathname) {
      handlePageChange();
      previousPathRef.current = location.pathname;
    }
  }, [location.pathname, handlePageChange]);

  return <>{children}</>;
};

export const PageEngagementTracker: React.FC<PageEngagementTrackerProps> = ({ children }) => {
  return (
    <PageEngagementTrackerInner>
      {children}
    </PageEngagementTrackerInner>
  );
};

export default PageEngagementTracker;
