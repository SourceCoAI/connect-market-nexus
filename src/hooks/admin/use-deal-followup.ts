import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface UpdateDealFollowupParams {
  dealId: string;
  connectionRequestIds?: string[]; // Optional: specific requests to update
  isFollowedUp: boolean;
  followupType: 'positive' | 'negative';
  notes?: string;
}

export const useUpdateDealFollowup = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dealId,
      connectionRequestIds,
      isFollowedUp,
      followupType,
      notes,
    }: UpdateDealFollowupParams) => {
      // First, update the deal
      const dealField = followupType === 'positive' ? 'followed_up' : 'negative_followed_up';
      const dealAtField =
        followupType === 'positive' ? 'followed_up_at' : 'negative_followed_up_at';
      const dealByField =
        followupType === 'positive' ? 'followed_up_by' : 'negative_followed_up_by';

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      const { error: dealError } = await supabase
        .from('deal_pipeline')
        .update({
          [dealField]: isFollowedUp,
          [dealAtField]: isFollowedUp ? new Date().toISOString() : null,
          [dealByField]: isFollowedUp ? user?.id : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dealId);

      if (dealError) throw dealError;

      // Get the connection_request_id from the deal
      const { data: deal, error: dealError2 } = await supabase
        .from('deal_pipeline')
        .select('connection_request_id, contact_email')
        .eq('id', dealId)
        .single();
      if (dealError2) throw dealError2;

      if (!deal?.connection_request_id) {
        return { dealUpdated: true, requestsUpdated: 0 };
      }

      // If specific request IDs provided, update only those
      // Otherwise, update only the associated connection request
      const requestIdsToUpdate =
        connectionRequestIds && connectionRequestIds.length > 0
          ? connectionRequestIds
          : [deal.connection_request_id];

      // Update connection requests using the RPC function
      const rpcFunction =
        followupType === 'positive'
          ? 'update_connection_request_followup'
          : 'update_connection_request_negative_followup';

      const updates = requestIdsToUpdate.map(async (requestId) => {
        const { error } = await supabase.rpc(rpcFunction, {
          request_id: requestId,
          is_followed_up: isFollowedUp,
          admin_notes: notes,
        });
        if (error) throw error;
      });

      await Promise.all(updates);

      return {
        dealUpdated: true,
        requestsUpdated: requestIdsToUpdate.length,
      };
    },
    onSuccess: (data, variables) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['user-connection-requests'] });

      const type =
        variables.followupType === 'positive' ? 'positive follow-up' : 'rejection notice';
      toast({
        title: `${type} updated`,
        description: `Successfully updated deal and ${data.requestsUpdated} connection request(s).`,
      });
    },
    onError: (error: unknown) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: `Could not update follow-up status: ${error instanceof Error ? error.message : String(error)}`,
      });
    },
  });
};
