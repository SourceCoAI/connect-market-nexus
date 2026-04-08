/**
 * Hook for managing the current user's Outlook email connection.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { EmailConnection } from '@/types/email';

const EMAIL_CONNECTION_KEY = ['email', 'connection'];

export function useEmailConnection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const connectionQuery = useQuery({
    queryKey: [...EMAIL_CONNECTION_KEY, user?.id],
    queryFn: async (): Promise<EmailConnection | null> => {
      if (!user?.id) return null;

      const { data, error } = await (supabase as any)
        .from('email_connections')
        .select('*')
        .eq('sourceco_user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const resp = await supabase.functions.invoke('outlook-auth', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (resp.error) throw new Error(resp.error.message || 'Failed to start OAuth flow');
      return resp.data?.data as { authUrl: string; state: string };
    },
    onSuccess: (data) => {
      // Redirect to Microsoft OAuth consent screen
      if (data?.authUrl) {
        // Store state in localStorage (persists across tabs, unlike sessionStorage)
        localStorage.setItem('outlook_oauth_state', data.state);
        window.location.href = data.authUrl;
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Connection Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const callbackMutation = useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const resp = await supabase.functions.invoke('outlook-callback', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { code, state },
      });

      if (resp.error) throw new Error(resp.error.message || 'Callback failed');
      return resp.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMAIL_CONNECTION_KEY });
      toast({
        title: 'Outlook Connected',
        description: 'Your Outlook account has been connected successfully. Initial email sync is running in the background.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Connection Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (targetUserId?: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const resp = await supabase.functions.invoke('outlook-disconnect', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: targetUserId ? { targetUserId } : {},
      });

      if (resp.error) throw new Error(resp.error.message || 'Disconnect failed');
      return resp.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMAIL_CONNECTION_KEY });
      toast({
        title: 'Outlook Disconnected',
        description: 'Your Outlook account has been disconnected. Email history is preserved.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Disconnect Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    connection: connectionQuery.data,
    isLoading: connectionQuery.isLoading,
    isConnected: connectionQuery.data?.status === 'active',
    hasError: connectionQuery.data?.status === 'error',
    isExpired: connectionQuery.data?.status === 'expired',

    connect: connectMutation.mutate,
    isConnecting: connectMutation.isPending,

    handleCallback: callbackMutation.mutate,
    isProcessingCallback: callbackMutation.isPending,

    disconnect: disconnectMutation.mutate,
    isDisconnecting: disconnectMutation.isPending,
  };
}
