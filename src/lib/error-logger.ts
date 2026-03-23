import { supabase } from '@/integrations/supabase/client';

interface ErrorLogEntry {
  level: 'error' | 'warning' | 'info';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  timestamp: string;
  userId?: string;
  url?: string;
  userAgent?: string;
}

class ErrorLogger {
  private isEnabled = true;
  private buffer: ErrorLogEntry[] = [];
  private maxBufferSize = 50;
  private flushInterval = 30000; // 30 seconds
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic flush
    if (typeof window !== 'undefined') {
      this.intervalId = setInterval(() => this.flush(), this.flushInterval);

      // Flush on page unload
      window.addEventListener('beforeunload', () => this.flush());
    }
  }

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.flush();
  }

  async logError(
    error: Error | string,
    context: Record<string, unknown> = {},
    level: 'error' | 'warning' | 'info' = 'error',
  ): Promise<void> {
    if (!this.isEnabled) return;

    const entry: ErrorLogEntry = {
      level,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    // Try to get current user ID
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (session?.user?.id) {
        entry.userId = session.user.id;
      }
    } catch {
      // Ignore auth errors when logging
    }

    // Add to buffer
    this.buffer.push(entry);

    // Console log for development
    if (import.meta.env.DEV) {
      const logMethod =
        level === 'error' ? console.error : level === 'warning' ? console.warn : console.log;
      logMethod(`[${level.toUpperCase()}] ${entry.message}`, {
        context,
        stack: entry.stack,
      });
    }

    // Flush if buffer is getting full
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      // In a production app, you'd send these to your logging service
      // For now, we'll just store them in user_activity table as error events
      for (const entry of entries) {
        if (entry.userId) {
          await supabase.from('user_activity').insert({
            user_id: entry.userId,
            activity_type: 'error_logged',
            metadata: {
              level: entry.level,
              message: entry.message,
              context: entry.context as
                | Record<string, string | number | boolean | null>
                | undefined,
              url: entry.url,
              timestamp: entry.timestamp,
            } as unknown,
          } as never);
        }
      }
    } catch (error) {
      // Avoid infinite recursion - don't log errors from the error logger
      console.error('Failed to flush error logs:', error);
    }
  }

  // Manual flush method
  async flushNow(): Promise<void> {
    await this.flush();
  }

  // Convenience methods
  async error(message: string | Error, context?: Record<string, unknown>): Promise<void> {
    await this.logError(message, context, 'error');
  }

  async warning(message: string | Error, context?: Record<string, unknown>): Promise<void> {
    await this.logError(message, context, 'warning');
  }

  async info(message: string | Error, context?: Record<string, unknown>): Promise<void> {
    await this.logError(message, context, 'info');
  }

  // Performance tracking
  async trackPerformance(
    metricName: string,
    value: number,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.info(`Performance: ${metricName}`, {
      metric: metricName,
      value,
      unit: 'ms',
      ...context,
    });
  }
}

export const errorLogger = new ErrorLogger();

// Global error handlers
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    errorLogger.error(event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    errorLogger.error(event.reason instanceof Error ? event.reason : String(event.reason), {
      type: 'unhandled_promise_rejection',
    });
  });
}
