
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { createQueryKey } from '@/lib/query-keys';
import { invalidateSavedListings } from '@/lib/query-client-helpers';

// Save/unsave a listing
export const useSaveListingMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      listingId, 
      action 
    }: { 
      listingId: string, 
      action: 'save' | 'unsave' 
    }) => {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) throw new Error('You must be logged in to save listings');

        const userId = session.user.id;

        if (action === 'save') {
          const { data, error } = await supabase
            .from('saved_listings')
            .insert({
              user_id: userId,
              listing_id: listingId
            })
            .select()
            .single();

          if (error) throw error;
          return data;
        } else {
          const { error } = await supabase
            .from('saved_listings')
            .delete()
            .eq('user_id', userId)
            .eq('listing_id', listingId);

          if (error) throw error;
          return { success: true };
        }
    },
    onSuccess: (_, variables) => {
      // PHASE 2: Use centralized cache invalidation with backward compatibility
      invalidateSavedListings(queryClient);
      toast({
        title: variables.action === 'save' ? 'Listing Saved' : 'Listing Removed',
        description: variables.action === 'save'
          ? 'The listing has been saved to your favorites.'
          : 'The listing has been removed from your favorites.',
      });
      // Clean up annotation when unsaving
      if (variables.action === 'unsave') {
        try {
          const raw = localStorage.getItem('sourceco_saved_listing_notes');
          if (raw) {
            const notes = JSON.parse(raw);
            delete notes[variables.listingId];
            localStorage.setItem('sourceco_saved_listing_notes', JSON.stringify(notes));
          }
        } catch { /* ignore */ }
      }
      // Notify admins when a buyer saves a listing (fire-and-forget)
      if (variables.action === 'save') {
        supabase.functions
          .invoke('notify-admin-listing-saved', {
            body: { listingId: variables.listingId },
          })
          .catch(() => {
            // Non-critical — don't fail the save
          });
      }
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update saved listing',
      });
    },
  });
};

// Batch fetch all saved listing IDs for the current user (single query)
export const useAllSavedListingIds = () => {
  return useQuery({
    queryKey: ['saved-listing-ids'],
    queryFn: async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) return new Set<string>();
        
        const { data, error } = await supabase
          .from('saved_listings')
          .select('listing_id')
          .eq('user_id', session.user.id);
        
        if (error) throw error;
        
        return new Set((data || []).map(r => r.listing_id));
      } catch (error: unknown) {
        console.error('Error fetching saved listing ids:', error);
        return new Set<string>();
      }
    },
    staleTime: 1000 * 60, // 1 minute
  });
};

// Check if listing is saved - uses batch query when savedIds provided, falls back to individual query
export const useSavedStatus = (listingId: string | undefined, savedIds?: Set<string>) => {
  // If a batch set is provided, skip the individual query entirely
  const skip = !!savedIds;
  const query = useQuery({
    queryKey: createQueryKey.savedStatus(listingId),
    queryFn: async () => {
      if (!listingId) return false;
      
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) return false;
        
        const { data, error } = await supabase
          .from('saved_listings')
          .select()
          .eq('listing_id', listingId)
          .eq('user_id', session.user.id)
          .maybeSingle();
        
        if (error) throw error;
        
        return !!data;
      } catch (error: unknown) {
        console.error('Error checking saved status:', error);
        return false;
      }
    },
    enabled: !!listingId && !skip,
    staleTime: 1000 * 60,
  });

  if (skip && listingId) {
    return { ...query, data: savedIds.has(listingId) };
  }
  return query;
};
