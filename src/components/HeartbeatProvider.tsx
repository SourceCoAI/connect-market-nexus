import React from 'react';
import { useSessionHeartbeat } from '@/hooks/use-session-heartbeat';
import { useAuth } from '@/contexts/AuthContext';

interface HeartbeatProviderProps {
  children: React.ReactNode;
}

/**
 * HeartbeatProvider - Sends periodic heartbeats to track session activity
 *
 * Features:
 * - Sends heartbeat every 30 seconds when tab is active
 * - Pauses when tab is hidden (saves resources)
 * - Resumes immediately when tab becomes visible
 * - Tracks accurate session duration
 * - Enables real-time "active users" count
 */
const HeartbeatTracker: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Initialize heartbeat tracking
  useSessionHeartbeat(user?.id);

  return <>{children}</>;
};

export const HeartbeatProvider: React.FC<HeartbeatProviderProps> = ({ children }) => {
  return <HeartbeatTracker>{children}</HeartbeatTracker>;
};

export default HeartbeatProvider;
