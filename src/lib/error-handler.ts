import React from 'react';
import { toast } from '@/hooks/use-toast';
import { errorLogger } from '@/lib/error-logger';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
  component?: string;
  operation?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorHandler {
  (error: Error | string, context?: ErrorContext, severity?: ErrorSeverity): void;
}

class ErrorManager {
  private static instance: ErrorManager;
  private errorQueue: Array<{
    error: Error | string;
    context?: ErrorContext;
    severity: ErrorSeverity;
    timestamp: Date;
  }> = [];
  private maxQueueSize = 100;

  static getInstance(): ErrorManager {
    if (!ErrorManager.instance) {
      ErrorManager.instance = new ErrorManager();
    }
    return ErrorManager.instance;
  }

  handleError: ErrorHandler = (error, context = {}, severity = 'medium') => {
    const timestamp = new Date();
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Add to error queue for potential batch reporting
    this.addToQueue({ error, context, severity, timestamp });

    // Log to console with context
    const logMessage = `🚨 [${severity.toUpperCase()}] ${context.component || 'Unknown'}: ${errorMessage}`;

    switch (severity) {
      case 'critical':
        console.error(logMessage, { error, context, stack: errorStack });
        break;
      case 'high':
        console.error(logMessage, { error, context });
        break;
      case 'medium':
        console.warn(logMessage, { error, context });
        break;
      case 'low':
        console.warn(logMessage, { error, context });
        break;
    }

    // Show user-facing notifications based on severity
    this.showUserNotification(errorMessage, context, severity);

    // Send to error tracking service in production
    if (!import.meta.env.DEV && severity !== 'low') {
      this.reportToExternalService(error, context, severity);
    }

    // Always log to error logger for production monitoring
    errorLogger.logError(
      error,
      context as Record<string, unknown>,
      severity === 'low' ? 'info' : 'error',
    );
  };

  private addToQueue(errorEntry: {
    error: Error | string;
    context?: ErrorContext;
    severity: ErrorSeverity;
    timestamp: Date;
  }) {
    this.errorQueue.push(errorEntry);

    // Keep queue size manageable
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift(); // Remove oldest entry
    }
  }

  private showUserNotification(_message: string, context: ErrorContext, severity: ErrorSeverity) {
    // Don't show toast for low severity errors
    if (severity === 'low') return;

    const operation = context.operation || 'operation';
    let userMessage = '';
    let variant: 'default' | 'destructive' = 'default';

    switch (severity) {
      case 'critical':
        userMessage = `Critical error occurred. Please refresh the page or contact support.`;
        variant = 'destructive';
        break;
      case 'high':
        userMessage = `Failed to ${operation}. Please try again or contact support if the issue persists.`;
        variant = 'destructive';
        break;
      case 'medium':
        userMessage = `Unable to complete ${operation}. Please try again.`;
        variant = 'destructive';
        break;
    }

    if (userMessage) {
      toast({
        title: severity === 'critical' ? '🚨 Critical Error' : '⚠️ Error',
        description: userMessage,
        variant,
        duration: severity === 'critical' ? 0 : 5000, // Critical errors don't auto-dismiss
      });
    }
  }

  private async reportToExternalService(
    error: Error | string,
    context: ErrorContext,
    severity: ErrorSeverity,
  ) {
    try {
      // In a real application, you would send this to a service like Sentry, LogRocket, etc.
      const errorData = {
        message: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        severity,
        context,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: context.userId,
      };

      console.warn('📊 Would report to external service:', errorData);

      // Example: await fetch('/api/errors', { method: 'POST', body: JSON.stringify(errorData) });
    } catch (reportingError) {
      console.error('❌ Failed to report error to external service:', reportingError);
    }
  }

  // Get recent errors for debugging
  getRecentErrors(limit = 10) {
    return this.errorQueue.slice(-limit);
  }

  // Clear error queue
  clearErrors() {
    this.errorQueue = [];
  }
}

// Export singleton instance
export const errorHandler = ErrorManager.getInstance().handleError;

// Specialized error handlers for common scenarios
export const authErrorHandler = (error: Error | string, operation = 'authenticate') => {
  errorHandler(error, { component: 'AuthSystem', operation }, 'high');
};

export const adminErrorHandler = (error: Error | string, operation = 'admin operation') => {
  errorHandler(error, { component: 'AdminDashboard', operation }, 'medium');
};

export const networkErrorHandler = (error: Error | string, endpoint?: string) => {
  errorHandler(
    error,
    { component: 'NetworkLayer', operation: `API call to ${endpoint}` },
    'medium',
  );
};

export const formErrorHandler = (error: Error | string, formName = 'form') => {
  errorHandler(error, { component: 'FormValidation', operation: `${formName} submission` }, 'low');
};

// Enrichment error handler with specific error codes
export const enrichmentErrorHandler = (
  error: Error | { message: string; error_code?: string; recoverable?: boolean },
  entityType: 'buyer' | 'deal',
  entityId: string,
) => {
  const errorCode = 'error_code' in error ? error.error_code : undefined;
  const isRecoverable = 'recoverable' in error ? error.recoverable : false;
  const message = error instanceof Error ? error.message : error.message;

  // Map error codes to user-friendly messages
  const userMessages: Record<string, string> = {
    concurrent_modification:
      'This record was updated by another user. Please refresh and try again.',
    rate_limited: 'Too many requests. Please wait a moment and try again.',
    payment_required: 'AI credits depleted. Contact administrator.',
    db_update_failed: 'Failed to save enrichment data. Please try again.',
    ssrf_blocked: 'Invalid URL provided for enrichment.',
  };

  const userMessage = errorCode ? userMessages[errorCode] || message : message;
  const severity =
    errorCode === 'concurrent_modification'
      ? 'medium'
      : errorCode === 'payment_required'
        ? 'critical'
        : 'high';

  errorHandler(
    new Error(userMessage),
    {
      component: 'EnrichmentService',
      operation: `enrich ${entityType}`,
      metadata: { entityId, errorCode, isRecoverable },
    },
    severity,
  );

  return { userMessage, isRecoverable, errorCode };
};

// Import error handler
export const importErrorHandler = (error: Error | string, importType = 'deals') => {
  errorHandler(error, { component: 'ImportService', operation: `import ${importType}` }, 'high');
};

// Scoring error handler
export const scoringErrorHandler = (error: Error | string, operation = 'score') => {
  errorHandler(error, { component: 'ScoringEngine', operation }, 'medium');
};

// Error boundary helpers
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorFallback?: React.ComponentType<{ error: Error }>,
) => {
  return (props: P) => {
    const fallbackElement = errorFallback
      ? React.createElement(errorFallback, { error: new Error('Component error') })
      : undefined;

    return React.createElement(ErrorBoundary, {
      fallback: fallbackElement,
      children: React.createElement(Component, props),
    });
  };
};
