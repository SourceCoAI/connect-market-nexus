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
        .select('id, status, created_at, updated_at, first_viewed_at')
        .eq('portal_org_id', portalOrgId);

      if (error) throw error;

      const total = pushes?.length || 0;
      const statusCounts: Record<string, number> = {};
      let totalResponseDays = 0;
      let responseCount = 0;

      (pushes || []).forEach((p: { status: string; created_at: string; updated_at: string; first_viewed_at: string | null }) => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;

        // Calculate avg response time (push created -> first status change that isn't pending/viewed)
        if (p.status !== 'pending_review' && p.status !== 'viewed' && p.status !== 'archived') {
          const pushDate = new Date(p.created_at).getTime();
          const responseDate = new Date(p.updated_at).getTime();
          const days = (responseDate - pushDate) / (1000 * 60 * 60 * 24);
          if (days >= 0 && days < 365) { // sanity check
            totalResponseDays += days;
            responseCount++;
          }
        }
      });

      const pending = (statusCounts['pending_review'] || 0) + (statusCounts['viewed'] || 0);
      const responded = total - pending - (statusCounts['archived'] || 0);
      const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
      const avgResponseDays = responseCount > 0 ? Math.round(totalResponseDays / responseCount) : null;

      return {
        total_pushes: total,
        status_counts: statusCounts,
        response_rate: responseRate,
        avg_response_days: avgResponseDays,
        pending_count: statusCounts['pending_review'] || 0,
        viewed_count: statusCounts['viewed'] || 0,
        interested_count: statusCounts['interested'] || 0,
        passed_count: statusCounts['passed'] || 0,
        needs_info_count: statusCounts['needs_info'] || 0,
        reviewing_count: statusCounts['reviewing'] || 0,
      };
    },
    enabled: !!portalOrgId,
  });
}

/** Export portal activity as CSV */
export function exportPortalActivityCSV(activity: PortalActivityLog[], orgName: string) {
  const headers = ['Date', 'Action', 'Actor Type', 'Actor Name', 'Details'];
  const rows = activity.map((log) => {
    const meta = log.metadata && typeof log.metadata === 'object' ? log.metadata as Record<string, unknown> : {};
    const actorName = meta.actor_name ? String(meta.actor_name) : (meta.user_name ? String(meta.user_name) : '');
    const headline = meta.headline ? String(meta.headline) : '';
    return [
      new Date(log.created_at).toISOString(),
      log.action.replace(/_/g, ' '),
      log.actor_type,
      actorName,
      headline,
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${orgName.replace(/\s+/g, '-').toLowerCase()}-portal-activity.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
