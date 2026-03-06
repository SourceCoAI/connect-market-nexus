import { ResilientErrorBoundary } from '@/components/common/ErrorBoundary';
import type { ReactNode } from 'react';

interface PageErrorBoundaryProps {
  children: ReactNode;
  pageName?: string;
}

/**
 * Per-page error boundary for admin pages.
 * Wraps individual page content so a crash in one page
 * doesn't take down the entire admin layout.
 */
const PageErrorBoundary = ({ children, pageName }: PageErrorBoundaryProps) => (
  <ResilientErrorBoundary componentName={pageName ?? 'AdminPage'} showDetails>
    {children}
  </ResilientErrorBoundary>
);

export default PageErrorBoundary;
