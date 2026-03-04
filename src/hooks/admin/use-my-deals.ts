import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// TODO: Phase 6 — migrate to data access layer: getPipelineDeals() from '@/lib/data-access'
// useMyDeals() queries .from('deal_pipeline') with stage/listing joins filtered by assigned_to.
// getPipelineDeals({ assignedTo }) is a close match but queries the 'deals' table (not 'deal_pipeline')
// and doesn't include stage/listing joins. Once the table rename is complete and joins are added
// to getPipelineDeals(), this hook can migrate.

/**
 * Hook to fetch deals assigned to the current admin
 * Useful for "My Deals" dashboard widget
 */
export function useMyDeals() {
  return useQuery({
    queryKey: ['my-deals'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('deal_pipeline')
        .select(`
          *,
          stage:deal_stages(name, color),
          listing:listings(title, revenue, ebitda)
        `)
        .eq('assigned_to', user.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Hook to get deal statistics for the current admin
 */
export function useMyDealStats() {
  return useQuery({
    queryKey: ['my-deal-stats'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      // Get deals with stage information to identify terminal stages
      const { data: deals, error } = await supabase
        .from('deal_pipeline')
        .select(`
          id, 
          stage_id, 
          value, 
          followed_up, 
          stage_entered_at,
          created_at,
          updated_at,
          stage:deal_stages(name, stage_type)
        `)
        .eq('assigned_to', user.id)
        .is('deleted_at', null);

      if (error) throw error;

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Filter active deals (exclude closed won/lost)
      const activeDeals = deals?.filter(d => {
        const stageType = d.stage?.stage_type;
        return stageType !== 'closed_won' && stageType !== 'closed_lost';
      }) || [];

      // Active deals count
      const activeDealCount = activeDeals.length;

      // Need attention: not followed up OR stale (7+ days in same stage)
      const needAttention = activeDeals.filter(d =>
        !d.followed_up || (d.stage_entered_at && new Date(d.stage_entered_at) < weekAgo)
      ).length;

      // This week: created or updated in last 7 days
      const thisWeek = activeDeals.filter(d =>
        (d.created_at && new Date(d.created_at) >= weekAgo) || (d.updated_at && new Date(d.updated_at) >= weekAgo)
      ).length;

      // Stale deals (7+ days, only active)
      const staleDeals = activeDeals.filter(d =>
        d.stage_entered_at && new Date(d.stage_entered_at) < weekAgo
      ).length;

      // Needs follow-up (only active)
      const needsFollowUp = activeDeals.filter(d => !d.followed_up).length;

      return {
        activeDeals: activeDealCount,
        needAttention,
        thisWeek,
        staleDeals,
        needsFollowUp,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
