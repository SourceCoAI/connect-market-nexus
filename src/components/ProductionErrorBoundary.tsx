import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import {
  adminErrorHandler,
  authErrorHandler,
  errorHandler,
  ErrorSeverity,
} from '@/lib/error-handler';

interface ProductionErrorBoundaryProps {
  children: React.ReactNode;
  component: string;
  errorType?: 'admin' | 'auth' | 'general';
  severity?: ErrorSeverity;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * Enhanced ErrorBoundary for production use
 * Automatically handles error classification and reporting
 */
export const ProductionErrorBoundary: React.FC<ProductionErrorBoundaryProps> = ({
  children,
  component,
  errorType = 'general',
  severity = 'medium',
  fallback,
  onError,
}) => {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Call custom error handler if provided
    onError?.(error, errorInfo);

    // Use appropriate error handler based on type
    const context = {
      component,
      operation: 'component rendering',
      metadata: {
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
      },
    };

    switch (errorType) {
      case 'admin':
        adminErrorHandler(error, 'admin component error');
        break;
      case 'auth':
        authErrorHandler(error, 'authentication component error');
        break;
      default:
        errorHandler(error, context, severity);
        break;
    }
  };

  return (
    <ErrorBoundary fallback={fallback} onError={handleError} showDetails={import.meta.env.DEV}>
      {children}
    </ErrorBoundary>
  );
};

// Convenience wrapper for admin components
export const AdminErrorBoundary: React.FC<Omit<ProductionErrorBoundaryProps, 'errorType'>> = (
  props,
) => <ProductionErrorBoundary {...props} errorType="admin" />;

// Convenience wrapper for auth components
export const AuthErrorBoundary: React.FC<Omit<ProductionErrorBoundaryProps, 'errorType'>> = (
  props,
) => <ProductionErrorBoundary {...props} errorType="auth" />;
