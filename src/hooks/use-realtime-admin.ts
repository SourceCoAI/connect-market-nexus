/**
 * useRealtimeAdmin
 *
 * Subscribes to Supabase Realtime postgres_changes for admin-relevant tables
 * and shows toast notifications when new registrations, connection requests,
 * listings, deals, or agreement changes occur. Only active for admin users.
 *
 * Returns: { isConnected }
 *
 * Tables: profiles, connection_requests, listings, deals, deal_tasks, connection_request_stages, firm_agreements, firm_members
 */

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export function useRealtimeAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const isAdmin = user?.is_admin || false;

  // Debounce invalidations: batch all query keys within a 200ms window
  const pendingKeysRef = useRef(new Set<string>());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleInvalidation = (...keys: string[]) => {
    for (const key of keys) pendingKeysRef.current.add(key);
    if (!debounceTimerRef.current) {
      debounceTimerRef.current = setTimeout(() => {
        const batch = Array.from(pendingKeysRef.current);
        pendingKeysRef.current.clear();
        debounceTimerRef.current = null;
        for (const key of batch) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }, 200);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      setIsConnected(false);
      return;
    }

    const channel = supabase
      .channel('admin-notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        (payload) => {
          toast({
            title: '👤 New User Registration',
            description: `${payload.new.first_name} ${payload.new.last_name} has registered`,
          });
          scheduleInvalidation('admin-users');
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connection_requests' },
        () => {
          toast({
            title: '🔗 New Connection Request',
            description: 'A new connection request requires review',
          });
          scheduleInvalidation('admin-connection-requests', 'connection-requests');
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'connection_requests' },
        () => {
          scheduleInvalidation('connection-requests', 'connection-request-details', 'deals');
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'listings' },
        (payload) => {
          toast({
            title: '📋 New Listing Created',
            description: `"${payload.new.title}" has been added`,
          });
          scheduleInvalidation('admin-listings');
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          if (payload.old?.approval_status !== payload.new?.approval_status) {
            const status = payload.new.approval_status;
            const userName = `${payload.new.first_name} ${payload.new.last_name}`;
            toast({
              title: `👤 User ${status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Updated'}`,
              description: `${userName} status changed to ${status}`,
            });
          }
          if (payload.old?.is_admin !== payload.new?.is_admin) {
            const userName = `${payload.new.first_name} ${payload.new.last_name}`;
            toast({
              title: payload.new.is_admin
                ? '👑 User Promoted to Admin'
                : '👤 Admin Privileges Revoked',
              description: `${userName} ${payload.new.is_admin ? 'is now an admin' : 'is no longer an admin'}`,
            });
          }
          scheduleInvalidation('admin-users');
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'profiles' },
        (payload) => {
          const userName = `${payload.old.first_name} ${payload.old.last_name}`;
          toast({
            title: '🗑️ User Deleted',
            description: `${userName} has been removed from the system`,
          });
          scheduleInvalidation('admin-users');
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        scheduleInvalidation('deals', 'deal-activities');
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_standup_tasks' },
        () => {
          scheduleInvalidation('daily-standup-tasks', 'entity-tasks', 'deals');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connection_request_stages' },
        () => {
          scheduleInvalidation('connection-request-stages');
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'firm_agreements' }, () => {
        scheduleInvalidation(
          'firm-agreements',
          'admin-users',
          'connection-requests',
          'inbound-leads',
          'deals',
        );
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'valuation_leads' },
        () => {
          toast({
            title: '📊 New Valuation Lead',
            description: 'A new lead has been submitted',
          });
          scheduleInvalidation('remarketing');
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'valuation_leads' },
        () => {
          scheduleInvalidation('remarketing');
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'firm_members' }, () => {
        scheduleInvalidation('firm-members', 'firm-agreements', 'admin-users');
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isAdmin, queryClient]);

  return { isConnected };
}
