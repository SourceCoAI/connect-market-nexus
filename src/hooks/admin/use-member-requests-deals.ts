import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useMemberRequestsDeals(userId: string | null, leadEmail: string | null) {
  return useQuery({
    queryKey: ['member-requests-deals', userId, leadEmail],
    queryFn: async () => {
      if (!userId && !leadEmail) return { requests: [], deals: [] };

      // Fetch connection requests
      let requestsQuery = supabase
        .from('connection_requests')
        .select(`
          id,
          status,
          created_at,
          lead_fee_agreement_signed,
          lead_nda_signed,
          listing:listings(id, title)
        `);

      if (userId) {
        requestsQuery = requestsQuery.eq('user_id', userId);
      } else if (leadEmail) {
        requestsQuery = requestsQuery.eq('lead_email', leadEmail);
      }

      const { data: requests, error: requestsError } = await requestsQuery;
      if (requestsError) throw requestsError;

      // Fetch deals linked to these requests
      const requestIds = requests?.map(r => r.id) || [];
      const { data: deals, error: dealsError } = await supabase
        .from('deal_pipeline')
        .select(`
          id,
          title,
          stage_id,
          value,
          created_at,
          stage:deal_stages(name, color)
        `)
        .in('connection_request_id', requestIds);

      if (dealsError) throw dealsError;

      return {
        requests: requests || [],
        deals: deals || [],
      };
    },
    enabled: !!(userId || leadEmail),
    staleTime: 30000,
  });
}
