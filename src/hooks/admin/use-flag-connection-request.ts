import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateConnectionRequests } from '@/lib/query-client-helpers';
import { QUERY_KEYS } from '@/lib/query-keys';

interface ToggleFlagParams {
  requestId: string;
  flagged: boolean;
  assignedTo?: string | null;
}

export function useFlagConnectionRequest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ requestId, flagged, assignedTo }: ToggleFlagParams) => {
      const now = new Date().toISOString();
      const adminId = user?.id;

      const { data, error } = await supabase
        .from('connection_requests')
        .update({
          flagged_for_review: flagged,
          flagged_for_review_at: flagged ? now : null,
          flagged_for_review_by: flagged ? adminId : null,
          flagged_for_review_assigned_to: flagged ? (assignedTo ?? null) : null,
        })
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ requestId, flagged, assignedTo }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.admin.connectionRequests });

      const prev = queryClient.getQueryData<Record<string, unknown>[]>(
        QUERY_KEYS.admin.connectionRequests,
      );

      queryClient.setQueryData<Record<string, unknown>[]>(
        QUERY_KEYS.admin.connectionRequests,
        (old) => {
          if (!old) return [];
          const now = new Date().toISOString();
          return old.map((req) =>
            req.id === requestId
              ? {
                  ...req,
                  flagged_for_review: flagged,
                  flagged_for_review_at: flagged ? now : null,
                  flagged_for_review_by: flagged ? user?.id : null,
                  flagged_for_review_assigned_to: flagged ? (assignedTo ?? null) : null,
                }
              : req,
          );
        },
      );

      return { prev };
    },
    onSuccess: (_, { flagged }) => {
      invalidateConnectionRequests(queryClient);
      toast({
        title: flagged ? 'Request flagged' : 'Flag removed',
        description: flagged
          ? 'This request has been flagged for team review.'
          : 'The review flag has been removed.',
      });
    },
    onError: (err, _, context) => {
      if (context?.prev) {
        queryClient.setQueryData(QUERY_KEYS.admin.connectionRequests, context.prev);
      }
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Could not update flag status',
      });
    },
  });
}
