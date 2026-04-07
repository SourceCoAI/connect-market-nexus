import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/client';
import type { PortalActivityLog } from '@/types/portal';

export function usePortalActivity(portalOrgId: string | undefined) {
  return useQuery({
    queryKey: ['portal-activity', portalOrgId],
    queryFn: async (): Promise<PortalActivityLog[]> => {
      if (!portalOrgId) return [];
      const { data, error } = await untypedFrom('portal_activity_log')
        .select('*')
        .eq('portal_org_id', portalOrgId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: !!portalOrgId,
  });
}

export function usePortalAnalytics(portalOrgId: string | undefined) {
  return useQuery({
    queryKey: ['portal-analytics', portalOrgId],
    queryFn: async () => {
      if (!portalOrgId) return null;

      const { data: pushes, error } = await untypedFrom('portal_deal_pushes')
        .select('id, status, created_at, updated_at')
        .eq('portal_org_id', portalOrgId);

      if (error) throw error;

      const total = pushes?.length || 0;
      const statusCounts: Record<string, number> = {};
      (pushes || []).forEach((p: { status: string }) => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      });

      const responded = total - (statusCounts['pending_review'] || 0);
      const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;

      return {
        total_pushes: total,
        status_counts: statusCounts,
        response_rate: responseRate,
        pending_count: statusCounts['pending_review'] || 0,
        interested_count: statusCounts['interested'] || 0,
        passed_count: statusCounts['passed'] || 0,
        needs_info_count: statusCounts['needs_info'] || 0,
      };
    },
    enabled: !!portalOrgId,
  });
}
