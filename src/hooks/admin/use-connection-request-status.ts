import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invalidateConnectionRequests } from '@/lib/query-client-helpers';
import { QUERY_KEYS } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';

interface UpdateConnectionRequestStatusParams {
  requestId: string;
  status: 'pending' | 'approved' | 'rejected' | 'on_hold';
  notes?: string;
}

export const useUpdateConnectionRequestStatus = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ requestId, status, notes }: UpdateConnectionRequestStatusParams) => {
      const adminId = user?.id as string | undefined;
      const now = new Date().toISOString();

      // Build mutually exclusive update payload safely on the client
      const base: Record<string, unknown> = {
        status,
        updated_at: now,
        decision_at: status === 'pending' ? null : now,
        admin_comment: notes ?? null,
      };

      // Clear all decision fields first
      Object.assign(base, {
        approved_by: null,
        approved_at: null,
        rejected_by: null,
        rejected_at: null,
        on_hold_by: null,
        on_hold_at: null,
      });

      if (status === 'approved') {
        Object.assign(base, { approved_by: adminId ?? null, approved_at: now });
      } else if (status === 'rejected') {
        Object.assign(base, { rejected_by: adminId ?? null, rejected_at: now });
      } else if (status === 'on_hold') {
        Object.assign(base, { on_hold_by: adminId ?? null, on_hold_at: now });
      }

      const { data, error } = await supabase
        .from('connection_requests')
        .update(base)
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ requestId, status }) => {
      // Cancel outgoing queries for this data (all relevant keys)
      await Promise.all([
        queryClient.cancelQueries({ queryKey: QUERY_KEYS.admin.connectionRequests }),
        queryClient.cancelQueries({ queryKey: QUERY_KEYS.connectionRequests }),
        queryClient.cancelQueries({ queryKey: QUERY_KEYS.userConnectionRequests }),
      ]);

      const prevAdmin = queryClient.getQueryData<Record<string, unknown>[]>(
        QUERY_KEYS.admin.connectionRequests,
      );

      // Optimistic update on admin list
      queryClient.setQueryData<Record<string, unknown>[]>(
        QUERY_KEYS.admin.connectionRequests,
        (old) => {
          if (!old) return [];
          const now = new Date().toISOString();
          const adminId = user?.id;
          return old.map((req) =>
            req.id === requestId
              ? {
                  ...req,
                  status,
                  updated_at: now,
                  decision_at: status === 'pending' ? null : now,
                  approved_by: status === 'approved' ? adminId : null,
                  approved_at: status === 'approved' ? now : null,
                  rejected_by: status === 'rejected' ? adminId : null,
                  rejected_at: status === 'rejected' ? now : null,
                  on_hold_by: status === 'on_hold' ? adminId : null,
                  on_hold_at: status === 'on_hold' ? now : null,
                }
              : req,
          );
        },
      );

      return { prevAdmin };
    },
    onSuccess: (_, variables) => {
      // Invalidate all related caches safely
      invalidateConnectionRequests(queryClient);

      const statusLabels = {
        pending: 'pending',
        approved: 'approved',
        rejected: 'rejected',
        on_hold: 'on hold',
      } as const;

      toast({
        title: 'Status updated',
        description: `Connection request marked as ${statusLabels[variables.status]}.`,
      });
    },
    onError: (err, _variables, context) => {
      // Rollback optimistic update
      if (context?.prevAdmin) {
        queryClient.setQueryData(QUERY_KEYS.admin.connectionRequests, context.prevAdmin);
      }

      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Could not update request status',
      });
    },
  });
};
