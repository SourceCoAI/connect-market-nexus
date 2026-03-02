import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type EngagementSource = 'marketplace' | 'remarketing' | 'pipeline' | 'document';

export interface EngagementItem {
  id: string;
  date: string;
  dealTitle: string;
  dealId: string | null;
  listingId: string | null;
  source: EngagementSource;
  status: string;
  stage: string | null;
  score: number | null;
  tier: string | null;
  contactName: string | null;
  contactEmail: string | null;
  documentsShared: {
    teaser: boolean;
    memo: boolean;
    dataRoom: boolean;
  } | null;
}

export interface EngagementSummary {
  totalDealsShown: number;
  interestedCount: number;
  pipelineActiveCount: number;
  documentsSharedCount: number;
}

export function useBuyerEngagementHistory(buyerId: string | undefined, emailDomain: string | null | undefined, marketplaceFirmId: string | null | undefined) {
  return useQuery({
    queryKey: ['buyer-engagement-history', buyerId, emailDomain, marketplaceFirmId],
    queryFn: async () => {
      if (!buyerId) return { items: [], summary: { totalDealsShown: 0, interestedCount: 0, pipelineActiveCount: 0, documentsSharedCount: 0 } };

      const items: EngagementItem[] = [];

      // 1. Remarketing scores
      const { data: scores } = await supabase
        .from('remarketing_scores')
        .select(`
          id, composite_score, tier, status, created_at,
          listing:listings(id, title)
        `)
        .eq('buyer_id', buyerId)
        .order('created_at', { ascending: false });

      for (const s of scores || []) {
        const listing = s.listing as { id?: string; title?: string } | null;
        items.push({
          id: `rm-${s.id}`,
          date: s.created_at,
          dealTitle: listing?.title || 'Unknown Listing',
          dealId: null,
          listingId: listing?.id || null,
          source: 'remarketing',
          status: s.status || 'pending',
          stage: null,
          score: s.composite_score,
          tier: s.tier,
          contactName: null,
          contactEmail: null,
          documentsShared: null,
        });
      }

      // 2. Marketplace connection requests (via email domain)
      if (emailDomain) {
        // Find marketplace profiles with same email domain
        const { data: domainProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .ilike('email', `%@${emailDomain}`)
          .is('deleted_at', null);

        const profileIds = (domainProfiles || []).map(p => p.id);

        if (profileIds.length > 0) {
          const { data: connectionRequests } = await supabase
            .from('connection_requests')
            .select(`
              id, status, created_at, user_id,
              listing:listings(id, title)
            `)
            .in('user_id', profileIds)
            .order('created_at', { ascending: false });

          for (const cr of connectionRequests || []) {
            const listing = cr.listing as { id?: string; title?: string } | null;
            const profile = domainProfiles?.find(p => p.id === cr.user_id);
            items.push({
              id: `mp-${cr.id}`,
              date: cr.created_at,
              dealTitle: listing?.title || 'Unknown Listing',
              dealId: null,
              listingId: listing?.id || null,
              source: 'marketplace',
              status: cr.status || 'pending',
              stage: null,
              score: null,
              tier: null,
              contactName: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : null,
              contactEmail: profile?.email || null,
              documentsShared: null,
            });
          }
        }
      }

      // 3. Pipeline deals (via remarketing_buyer_id or connection_request linkage)
      const { data: pipelineDeals } = await supabase
        .from('deal_pipeline')
        .select(`
          id, title, created_at, source, contact_name, contact_email,
          nda_status, fee_agreement_status, meeting_scheduled,
          stage:deal_stages!deals_stage_id_fkey(id, name, stage_type)
        `)
        .eq('remarketing_buyer_id', buyerId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      for (const d of pipelineDeals || []) {
        const stage = d.stage as { id?: string; name?: string; stage_type?: string } | null;
        items.push({
          id: `pl-${d.id}`,
          date: d.created_at || '',
          dealTitle: d.title || 'Untitled Deal',
          dealId: d.id,
          listingId: null,
          source: 'pipeline',
          status: (stage?.stage_type === 'won' ? 'won' : stage?.stage_type === 'lost' ? 'lost' : 'active') as string,
          stage: stage?.name || null,
          score: null,
          tier: null,
          contactName: d.contact_name,
          contactEmail: d.contact_email,
          documentsShared: null,
        });
      }

      // 4. Document distributions via RPC
      const { data: docHistory } = await supabase.rpc('get_buyer_deal_history', {
        p_buyer_id: buyerId,
      });

      for (const doc of docHistory || []) {
        // Avoid duplicates - merge doc info into existing pipeline items
        const existingPipeline = items.find(i => i.dealId === doc.deal_id);
        if (existingPipeline) {
          existingPipeline.documentsShared = {
            teaser: doc.has_teaser_access,
            memo: doc.has_full_memo_access,
            dataRoom: doc.has_data_room_access,
          };
        } else {
          items.push({
            id: `doc-${doc.deal_id}`,
            date: doc.last_memo_sent_at || '',
            dealTitle: doc.deal_title || 'Unknown Deal',
            dealId: doc.deal_id,
            listingId: null,
            source: 'document',
            status: doc.pipeline_stage || 'shared',
            stage: doc.pipeline_stage || null,
            score: null,
            tier: null,
            contactName: null,
            contactEmail: null,
            documentsShared: {
              teaser: doc.has_teaser_access,
              memo: doc.has_full_memo_access,
              dataRoom: doc.has_data_room_access,
            },
          });
        }
      }

      // Sort by date descending
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Calculate summary
      const summary: EngagementSummary = {
        totalDealsShown: items.filter(i => i.source === 'remarketing').length,
        interestedCount: items.filter(i => i.status === 'approved' || i.status === 'interested').length,
        pipelineActiveCount: items.filter(i => i.source === 'pipeline' && i.status === 'active').length,
        documentsSharedCount: items.filter(i => i.documentsShared && (i.documentsShared.teaser || i.documentsShared.memo || i.documentsShared.dataRoom)).length,
      };

      return { items, summary };
    },
    enabled: !!buyerId,
    staleTime: 30_000,
  });
}
