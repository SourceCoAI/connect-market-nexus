/**
 * Hook to find or create an inquiry-type connection request for a listing.
 * Used by the "Ask a Question" sidebar action so buyers can message
 * about a deal without formally requesting a connection.
 *
 * Reuses connection_requests + connection_messages infrastructure so
 * admin Message Center picks up threads automatically.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Finds an existing connection_request for the current user + listing.
 * Returns the request id regardless of source (inquiry or real connection).
 */
export function useDealInquiry(listingId: string | undefined) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['deal-inquiry', listingId, user?.id],
    queryFn: async () => {
      if (!user?.id || !listingId) return null;

      const { data, error } = await supabase
        .from('connection_requests')
        .select('id, status, source')
        .eq('user_id', user.id)
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as { id: string; status: string; source: string | null } | null;
    },
    enabled: !!user?.id && !!listingId,
    staleTime: 30_000,
  });

  return query;
}

/**
 * Creates an inquiry connection request if none exists yet.
 * Returns the connection_request_id to send messages against.
 */
export function useCreateInquiry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listingId: string) => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Not authenticated');

      // Check if one already exists
      const { data: existing } = await supabase
        .from('connection_requests')
        .select('id')
        .eq('user_id', user.id)
        .eq('listing_id', listingId)
        .limit(1)
        .maybeSingle();

      if (existing) return existing.id as string;

      // Create a new inquiry-type request
      const { data, error } = await supabase
        .from('connection_requests')
        .insert({
          user_id: user.id,
          listing_id: listingId,
          status: 'pending',
          source: 'inquiry',
          message: 'Inquiry from listing page',
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_, listingId) => {
      queryClient.invalidateQueries({ queryKey: ['deal-inquiry', listingId] });
    },
  });
}

/**
 * Query the buyer's last data room access timestamp for a listing.
 */
export function useDataRoomLastAccess(listingId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['data-room-last-access', listingId, user?.id],
    queryFn: async () => {
      if (!user?.id || !listingId) return null;

      // Check deal_data_room_access for buyer's last access
      const { data, error } = await supabase
        .from('deal_data_room_access' as never)
        .select('last_accessed_at')
        .eq('deal_id', listingId)
        .eq('buyer_id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('[data-room-last-access] Query failed:', error.message);
        return null;
      }

      return (data as { last_accessed_at: string | null } | null)?.last_accessed_at || null;
    },
    enabled: !!user?.id && !!listingId,
    staleTime: 60_000,
  });
}
