/**
 * useDealTeam
 *
 * Queries and mutations for the rm_deal_team table — managing team membership
 * per listing (sellside engagement).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DealTeamMember, DealTeamRole } from '@/types/daily-tasks';

const DEAL_TEAM_KEY = 'deal-team';

export function useDealTeam(listingId: string | null) {
  return useQuery({
    queryKey: [DEAL_TEAM_KEY, listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rm_deal_team')
        .select(
          `
          *,
          user:profiles!rm_deal_team_user_id_fkey(id, first_name, last_name, email)
        `,
        )
        .eq('listing_id', listingId!)
        .order('role', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as DealTeamMember[];
    },
    staleTime: 60_000,
  });
}

export function useAddDealTeamMember() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listingId,
      userId,
      role,
    }: {
      listingId: string;
      userId: string;
      role: DealTeamRole;
    }) => {
      const { data, error } = await supabase
        .from('rm_deal_team')
        .insert({ listing_id: listingId, user_id: userId, role })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [DEAL_TEAM_KEY, variables.listingId] });
    },
  });
}

export function useUpdateDealTeamRole() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      listingId,
      role,
    }: {
      memberId: string;
      listingId: string;
      role: DealTeamRole;
    }) => {
      const { error } = await supabase.from('rm_deal_team').update({ role }).eq('id', memberId);

      if (error) throw error;
      return listingId;
    },
    onSuccess: (listingId) => {
      qc.invalidateQueries({ queryKey: [DEAL_TEAM_KEY, listingId] });
    },
  });
}

export function useRemoveDealTeamMember() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, listingId }: { memberId: string; listingId: string }) => {
      const { error } = await supabase.from('rm_deal_team').delete().eq('id', memberId);

      if (error) throw error;
      return listingId;
    },
    onSuccess: (listingId) => {
      qc.invalidateQueries({ queryKey: [DEAL_TEAM_KEY, listingId] });
    },
  });
}
