import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from './types';

/** Maps a single RPC row from get_deals_with_buyer_profiles to a Deal object. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRpcRowToDeal(row: Record<string, any>) {
  return {
    deal_id: row.deal_id,
    title: row.deal_title || row.listing_title || 'Deal',
    deal_description: row.deal_description,
    deal_value: Number(row.deal_value ?? 0),
    deal_priority: row.deal_priority ?? 'medium',
    deal_probability: Number(row.deal_probability ?? 50),
    deal_expected_close_date: row.deal_expected_close_date,
    deal_source: row.deal_source ?? 'manual',
    source: row.deal_source ?? 'manual',
    deal_created_at: row.deal_created_at,
    deal_updated_at: row.deal_updated_at,
    deal_stage_entered_at: row.deal_stage_entered_at,

    // Stage
    stage_id: row.stage_id ?? '',
    stage_name: row.stage_name,
    stage_color: row.stage_color ?? '',
    stage_position: row.stage_position ?? 0,

    // Listing
    listing_id: row.listing_id ?? null,
    listing_title: row.listing_title,
    listing_revenue: Number(row.listing_revenue ?? 0),
    listing_ebitda: Number(row.listing_ebitda ?? 0),
    listing_location: row.listing_location,
    listing_category: row.listing_category,
    listing_real_company_name: row.listing_internal_company_name,

    // Contact info (from connection_requests lead fields via RPC JOIN)
    contact_name: row.contact_name ?? undefined,
    contact_email: row.contact_email ?? undefined,
    contact_company: row.contact_company ?? undefined,
    contact_phone: row.contact_phone ?? undefined,
    contact_role: row.contact_role ?? undefined,

    // Document/status (from RPC)
    nda_status: (row.nda_status ?? 'not_sent') as 'not_sent' | 'sent' | 'signed' | 'declined',
    fee_agreement_status: (row.fee_agreement_status ?? 'not_sent') as
      | 'not_sent'
      | 'sent'
      | 'signed'
      | 'declined',
    followed_up: row.followed_up ?? false,
    followed_up_at: row.followed_up_at ?? undefined,
    negative_followed_up: row.negative_followed_up ?? false,
    negative_followed_up_at: row.negative_followed_up_at ?? undefined,

    // Assignment
    assigned_to: row.admin_id ?? undefined,
    assigned_admin_name: row.admin_first_name
      ? `${row.admin_first_name} ${row.admin_last_name}`
      : undefined,
    assigned_admin_email: row.admin_email ?? undefined,

    // Tasks and activity (not available via RPC, default to 0)
    total_tasks: 0,
    pending_tasks: 0,
    completed_tasks: 0,
    pending_tasks_count: 0,
    completed_tasks_count: 0,
    activity_count: 0,
    total_activities_count: 0,
    last_activity_at: undefined,

    // Buyer (pre-joined via RPC)
    buyer_type: row.buyer_type ?? null,
    buyer_website: row.buyer_website ?? undefined,
    buyer_quality_score: row.buyer_quality_score ?? null,
    buyer_tier: row.buyer_tier ?? null,
    buyer_name: row.buyer_first_name
      ? `${row.buyer_first_name} ${row.buyer_last_name || ''}`.trim()
      : undefined,
    buyer_email: row.buyer_email ?? undefined,
    buyer_company: row.buyer_company ?? undefined,
    buyer_phone: row.buyer_phone ?? undefined,
    buyer_priority_score: 0,

    // Extras
    connection_request_id: row.connection_request_id ?? undefined,
    company_deal_count: 0,
    listing_deal_count: 1,
    buyer_connection_count: 1,
    buyer_id: undefined,
    last_contact_at: undefined,
    last_contact_type: undefined,

    // Remarketing bridge
    remarketing_buyer_id: undefined,
    remarketing_score_id: undefined,

    // Scoring & flags from listing (pre-joined via RPC)
    deal_score: row.listing_deal_total_score ?? null,
    is_priority_target: row.listing_is_priority_target ?? null,
    needs_owner_contact: row.listing_needs_owner_contact ?? null,
    needs_buyer_search: row.listing_needs_buyer_search ?? null,

    // Document distribution flags (populated below)
    memo_sent: false,
    has_data_room: false,

    // Meeting scheduled
    meeting_scheduled: row.meeting_scheduled ?? false,
  };
}

export function useDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      // Single RPC call replaces the previous N+1 pattern
      // (deals -> connection_requests -> profiles done server-side)
      const { data: rpcRows, error: rpcError } = await supabase.rpc(
        'get_deals_with_buyer_profiles',
      );

      if (rpcError) throw rpcError;
      const rows = rpcRows || [];

      const mapped = rows.map(mapRpcRowToDeal);

      // Batch-fetch memo distribution, data room documents, and task counts
      const listingIds = [...new Set(mapped.map((d) => d.listing_id).filter(Boolean))] as string[];
      const dealIds = mapped.map((d) => d.deal_id);
      const memoSentListings = new Set<string>();
      const dataRoomListings = new Set<string>();
      const taskCountMap = new Map<string, { pending: number; completed: number; total: number }>();

      if (listingIds.length > 0) {
        for (let i = 0; i < listingIds.length; i += 100) {
          const chunk = listingIds.slice(i, i + 100);
          const [memoRes, drRes] = await Promise.all([
            supabase.from('memo_distribution_log').select('deal_id').in('deal_id', chunk),
            supabase
              .from('data_room_documents')
              .select('deal_id')
              .in('deal_id', chunk)
              .eq('status', 'active'),
          ]);
          if (memoRes.error) throw memoRes.error;
          if (drRes.error) throw drRes.error;
          memoRes.data?.forEach((r: { deal_id: string }) => memoSentListings.add(r.deal_id));
          drRes.data?.forEach((r: { deal_id: string }) => dataRoomListings.add(r.deal_id));
        }
      }

      // Batch-fetch task counts per deal from daily_standup_tasks
      if (dealIds.length > 0) {
        for (let i = 0; i < dealIds.length; i += 100) {
          const chunk = dealIds.slice(i, i + 100);
          const { data: taskRows, error: taskErr } = await supabase
            .from('daily_standup_tasks' as never)
            .select('entity_id, status')
            .eq('entity_type', 'deal')
            .in('entity_id', chunk);

          if (taskErr) throw taskErr;
          for (const row of (taskRows || []) as { entity_id: string; status: string }[]) {
            const entry = taskCountMap.get(row.entity_id) || { pending: 0, completed: 0, total: 0 };
            entry.total++;
            if (['pending', 'pending_approval', 'in_progress', 'overdue'].includes(row.status)) {
              entry.pending++;
            } else if (row.status === 'completed') {
              entry.completed++;
            }
            taskCountMap.set(row.entity_id, entry);
          }
        }
      }

      mapped.forEach((deal) => {
        deal.memo_sent = memoSentListings.has(deal.listing_id as string);
        deal.has_data_room = dataRoomListings.has(deal.listing_id as string);
        const tc = taskCountMap.get(deal.deal_id);
        if (tc) {
          deal.total_tasks = tc.total;
          deal.pending_tasks = tc.pending;
          deal.completed_tasks = tc.completed;
        }
      });

      return mapped as unknown as Deal[];
    },
    staleTime: 30000,
  });
}
