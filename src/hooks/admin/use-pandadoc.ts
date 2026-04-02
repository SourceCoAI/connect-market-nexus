import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook to trigger auto-create-firm-on-approval edge function.
 */
export function useAutoCreateFirmOnApproval() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { data, error } = await supabase.functions.invoke('auto-create-firm-on-approval', {
        body: { user_id: userId },
      });

      if (error) throw error;
      return data as {
        firm_id: string;
        firm_created: boolean;
        member_linked: boolean;
        nda_document_prepared: boolean;
        embed_url: string | null;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firm-agreements'] });
      queryClient.invalidateQueries({ queryKey: ['firm-members'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to auto-create firm on approval',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to fetch NDA signing status for the current buyer.
 * Uses the canonical `get_user_firm_agreement_status` RPC
 * to deterministically resolve the correct firm.
 */
const SAFE_NDA_DEFAULT = { hasFirm: false, ndaSigned: false, embedUrl: null, firmId: null };

function isRpcError(error: unknown): boolean {
  const msg = String((error as Record<string, unknown>)?.message ?? error).toLowerCase();
  const code = String((error as Record<string, unknown>)?.code ?? '');
  return msg.includes('404') || msg.includes('400') || msg.includes('not found') || code === '404' || code === '400' || code === 'PGRST202';
}

export function useBuyerNdaStatus(userId: string | undefined) {
  return useQuery({
    queryKey: ['buyer-nda-status', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase.rpc('get_user_firm_agreement_status', {
        p_user_id: userId,
      });

      if (error) {
        if (isRpcError(error)) {
          console.warn('[agreements] get_user_firm_agreement_status RPC error — returning safe defaults (gates will activate)');
          return SAFE_NDA_DEFAULT;
        }
        throw error;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.firm_id) return SAFE_NDA_DEFAULT;

      return {
        hasFirm: true,
        ndaSigned: row.nda_signed ?? false,
        hasDocument: true,
        firmId: row.firm_id,
        embedUrl: null as string | null,
      };
    },
    enabled: !!userId,
    staleTime: 30_000,
    retry: (count, error) => {
      if (isRpcError(error)) return false;
      return count < 2;
    },
  });
}
