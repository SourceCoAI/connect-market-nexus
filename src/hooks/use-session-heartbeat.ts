import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessionContext } from '@/contexts/SessionContext';

const HEARTBEAT_INTERVAL = 60000; // 60 seconds (was 30s — reduces edge function calls by 50%)

interface HeartbeatState {
  isActive: boolean;
  lastHeartbeat: number;
}

/**
 * Hook to send periodic heartbeats to keep session alive
 * and accurately track session duration
 */
export function useSessionHeartbeat(userId?: string | null) {
  const { sessionId } = useSessionContext();
  const stateRef = useRef<HeartbeatState>({
    isActive: true,
    lastHeartbeat: 0,
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = useCallback(async () => {
    // Skip if tab is hidden
    if (document.hidden) {
      stateRef.current.isActive = false;
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('session-heartbeat', {
        body: {
          session_id: sessionId,
          user_id: userId || null,
          page_path: window.location.pathname,
          is_focused: document.hasFocus(),
        },
      });

      if (error) {
        console.error('Heartbeat failed:', error);
      } else {
        stateRef.current.lastHeartbeat = Date.now();
        stateRef.current.isActive = true;
      }
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  }, [sessionId, userId]);

  useEffect(() => {
    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible - send immediate heartbeat
        sendHeartbeat();
      }
    };

    // Handle before unload - mark session as inactive
    const handleBeforeUnload = async () => {
      try {
        // Use sendBeacon for reliability during page unload.
        // Pass the auth token via the payload since sendBeacon doesn't support
        // custom headers — the edge function checks both Authorization header
        // and body.access_token for authentication.
        const { data: { session } } = await supabase.auth.getSession();
        const payload = JSON.stringify({
          session_id: sessionId,
          user_id: userId || null,
          ended: true,
          access_token: session?.access_token || null,
        });

        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-heartbeat`,
          new Blob([payload], { type: 'application/json' }),
        );
      } catch (error) {
        console.error('Failed to send final heartbeat:', error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sendHeartbeat, sessionId, userId]);

  return {
    isActive: stateRef.current.isActive,
    lastHeartbeat: stateRef.current.lastHeartbeat,
    forceHeartbeat: sendHeartbeat,
  };
}
