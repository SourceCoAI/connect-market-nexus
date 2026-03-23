import { useEffect, useState } from 'react';
import {
  SessionSecurity,
  SessionValidationResult,
  SessionAnomalyResult,
} from '@/lib/session-security';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface SessionMonitoringState {
  isValidating: boolean;
  sessionValid: boolean;
  anomalies: string[];
  riskScore: number;
  concurrentSessions: number;
  maxAllowedSessions: number;
}

export const useSessionMonitoring = () => {
  const { user } = useAuth();
  const [state, setState] = useState<SessionMonitoringState>({
    isValidating: false,
    sessionValid: true,
    anomalies: [],
    riskScore: 0,
    concurrentSessions: 1,
    maxAllowedSessions: 5,
  });

  useEffect(() => {
    if (!user?.id) return;

    const validateSession = async () => {
      setState((prev) => ({ ...prev, isValidating: true }));

      try {
        // Validate current session
        const validation: SessionValidationResult = await SessionSecurity.validateSession(user.id);

        // Check for anomalies
        const anomalyResult: SessionAnomalyResult = await SessionSecurity.detectAnomalies(user.id);

        // Check concurrent sessions
        const concurrentResult = await SessionSecurity.checkConcurrentSessions(user.id);

        setState((prev) => ({
          ...prev,
          isValidating: false,
          sessionValid: validation.valid,
          anomalies: anomalyResult.anomalies,
          riskScore: anomalyResult.risk_score,
          concurrentSessions: concurrentResult.concurrent_sessions,
          maxAllowedSessions: concurrentResult.max_allowed,
        }));

        // Handle security alerts
        if (!validation.valid) {
          toast({
            title: 'Session Security Alert',
            description:
              validation.reason || 'Your session appears to be invalid. Please log in again.',
            variant: 'destructive',
          });
        }

        if (anomalyResult.risk_score > 7) {
          toast({
            title: 'Unusual Activity Detected',
            description:
              "We've detected unusual activity on your account. Please verify your recent actions.",
            variant: 'destructive',
          });
        }

        if (concurrentResult.concurrent_sessions > concurrentResult.max_allowed) {
          toast({
            title: 'Too Many Active Sessions',
            description: `You have ${concurrentResult.concurrent_sessions} active sessions. Please log out from unused devices.`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Session monitoring failed:', error);
        setState((prev) => ({ ...prev, isValidating: false }));
      }
    };

    // Initial validation
    validateSession();

    // Set up periodic validation (every 5 minutes)
    const intervalId = setInterval(validateSession, 5 * 60 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [user?.id]);

  const invalidateOldSessions = async () => {
    if (!user?.id) return;

    try {
      const result = await SessionSecurity.invalidateOldSessions(user.id);
      toast({
        title: 'Sessions Cleaned Up',
        description: `Invalidated ${result.invalidated} old sessions.`,
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to clean up old sessions.',
        variant: 'destructive',
      });
    }
  };

  return {
    ...state,
    invalidateOldSessions,
  };
};
