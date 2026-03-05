/**
 * useDealSignals
 *
 * Queries and mutations for the rm_deal_signals table.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type { DealSignal } from '@/types/daily-tasks';

const SIGNALS_KEY = 'deal-signals';

export function useDealSignals(options: { listingId?: string | null; dealId?: string | null }) {
  const { listingId, dealId } = options;
  const filterKey = listingId || dealId;

  return useQuery({
    queryKey: [SIGNALS_KEY, listingId, dealId],
    enabled: !!filterKey,
    queryFn: async () => {
      let query = (supabase
        .from('rm_deal_signals' as any) as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (listingId) query = query.eq('listing_id', listingId);
      if (dealId) query = query.eq('deal_id', dealId);

      const { data, error } = await query;
      // rm_deal_signals table may not exist yet — gracefully return empty
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return [] as DealSignal[];
        }
        throw error;
      }
      return (data || []) as unknown as DealSignal[];
    },
    staleTime: 60_000,
  });
}

export function useAcknowledgeSignal() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (signalId: string) => {
      const { error } = await (supabase
        .from('rm_deal_signals' as any) as any)
        .update({
          acknowledged_by: user?.id ?? null,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', signalId);

      // rm_deal_signals table may not exist yet
      if (error && error.code !== '42P01' && !error.message?.includes('does not exist')) {
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [SIGNALS_KEY] });
    },
  });
}
