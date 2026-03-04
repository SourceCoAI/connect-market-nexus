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

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

export function useRealtimeAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const isAdmin = user?.is_admin || false;

  useEffect(() => {
    if (!isAdmin) {
      setIsConnected(false);
      return;
    }

    // Setting up consolidated realtime admin notifications

    const channel = supabase
      .channel('admin-notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          toast({
            title: '👤 New User Registration',
            description: `${payload.new.first_name} ${payload.new.last_name} has registered`,
          });
          queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'connection_requests',
        },
        () => {
          toast({
            title: '🔗 New Connection Request',
            description: 'A new connection request requires review',
          });
          queryClient.invalidateQueries({ queryKey: ['admin-connection-requests'] });
          queryClient.refetchQueries({ queryKey: ['connection-requests'], type: 'active' });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'connection_requests',
        },
        (_payload) => {
          queryClient.refetchQueries({ queryKey: ['connection-requests'], type: 'active' });
          queryClient.refetchQueries({ queryKey: ['connection-request-details'], type: 'active' });
          queryClient.refetchQueries({ queryKey: ['deals'], type: 'active' });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'listings',
        },
        (payload) => {
          toast({
            title: '📋 New Listing Created',
            description: `"${payload.new.title}" has been added`,
          });
          queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          // Enhanced status change notifications (consolidated from enhanced hook)
          if (payload.old?.approval_status !== payload.new?.approval_status) {
            const status = payload.new.approval_status;
            const userName = `${payload.new.first_name} ${payload.new.last_name}`;
            toast({
              title: `👤 User ${status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Updated'}`,
              description: `${userName} status changed to ${status}`,
            });
          }

          // Admin privilege changes (consolidated from enhanced hook)
          if (payload.old?.is_admin !== payload.new?.is_admin) {
            const userName = `${payload.new.first_name} ${payload.new.last_name}`;
            toast({
              title: payload.new.is_admin
                ? '👑 User Promoted to Admin'
                : '👤 Admin Privileges Revoked',
              description: `${userName} ${payload.new.is_admin ? 'is now an admin' : 'is no longer an admin'}`,
            });
          }
          queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const userName = `${payload.old.first_name} ${payload.old.last_name}`;
          toast({
            title: '🗑️ User Deleted',
            description: `${userName} has been removed from the system`,
          });
          queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals',
        },
        (_payload) => {
          queryClient.refetchQueries({ queryKey: ['deals'], type: 'active' });
          queryClient.invalidateQueries({ queryKey: ['deal-activities'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_standup_tasks',
        },
        (_payload) => {
          queryClient.refetchQueries({ queryKey: ['daily-standup-tasks'], type: 'active' });
          queryClient.refetchQueries({ queryKey: ['entity-tasks'], type: 'active' });
          queryClient.refetchQueries({ queryKey: ['deals'], type: 'active' });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connection_request_stages',
        },
        (_payload) => {
          queryClient.refetchQueries({ queryKey: ['connection-request-stages'], type: 'active' });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'firm_agreements',
        },
        (_payload) => {
          queryClient.refetchQueries({ queryKey: ['firm-agreements'], type: 'active' });
          queryClient.invalidateQueries({ queryKey: ['admin-users'] });
          queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
          queryClient.invalidateQueries({ queryKey: ['inbound-leads'] });
          queryClient.invalidateQueries({ queryKey: ['deals'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'valuation_leads',
        },
        () => {
          toast({
            title: '📊 New Valuation Lead',
            description: 'A new lead has been submitted',
          });
          queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'valuation_leads',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'firm_members',
        },
        (_payload) => {
          queryClient.refetchQueries({ queryKey: ['firm-members'], type: 'active' });
          queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
          queryClient.invalidateQueries({ queryKey: ['admin-users'] });
        },
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [isAdmin, queryClient]);

  return { isConnected };
}
