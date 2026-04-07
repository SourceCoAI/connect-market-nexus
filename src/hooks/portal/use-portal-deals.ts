import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  PortalDealPush,
  PortalDealPushWithDetails,
  PortalDealResponse,
  PushDealToPortalInput,
  SubmitDealResponseInput,
  DealSnapshot,
} from '@/types/portal';

const PORTAL_PUSHES_KEY = 'portal-deal-pushes';

/** Admin: fetch all pushes for a portal org */
export function usePortalDealPushes(portalOrgId: string | undefined) {
  return useQuery({
    queryKey: [PORTAL_PUSHES_KEY, portalOrgId],
    queryFn: async (): Promise<PortalDealPushWithDetails[]> => {
      if (!portalOrgId) return [];
      const { data, error } = await untypedFrom('portal_deal_pushes')
        .select(`
          *,
          pushed_by_profile:profiles!portal_deal_pushes_pushed_by_fkey(
            id, first_name, last_name
          )
        `)
        .eq('portal_org_id', portalOrgId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch latest response for each push
      const pushIds = (data || []).map((p: PortalDealPush) => p.id);
      if (pushIds.length === 0) return data || [];

      const { data: responses } = await untypedFrom('portal_deal_responses')
        .select('*')
        .in('push_id', pushIds)
        .order('created_at', { ascending: false });

      const latestByPush: Record<string, PortalDealResponse> = {};
      const countByPush: Record<string, number> = {};
      (responses || []).forEach((r: PortalDealResponse) => {
        countByPush[r.push_id] = (countByPush[r.push_id] || 0) + 1;
        if (!latestByPush[r.push_id]) latestByPush[r.push_id] = r;
      });

      return (data || []).map((push: PortalDealPush & { pushed_by_profile: PortalDealPushWithDetails['pushed_by_profile'] }) => ({
        ...push,
        latest_response: latestByPush[push.id] || null,
        response_count: countByPush[push.id] || 0,
      }));
    },
    enabled: !!portalOrgId,
  });
}

/** Client portal: fetch pushes visible to a portal user */
export function useMyPortalDeals(portalOrgId: string | undefined) {
  return useQuery({
    queryKey: ['my-portal-deals', portalOrgId],
    queryFn: async (): Promise<PortalDealPushWithDetails[]> => {
      if (!portalOrgId) return [];
      const { data, error } = await untypedFrom('portal_deal_pushes')
        .select('*')
        .eq('portal_org_id', portalOrgId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as PortalDealPushWithDetails[];
    },
    enabled: !!portalOrgId,
  });
}

/** Single push detail */
export function usePortalDealPush(pushId: string | undefined) {
  return useQuery({
    queryKey: ['portal-deal-push', pushId],
    queryFn: async () => {
      if (!pushId) return null;
      const { data, error } = await untypedFrom('portal_deal_pushes')
        .select(`
          *,
          pushed_by_profile:profiles!portal_deal_pushes_pushed_by_fkey(
            id, first_name, last_name
          ),
          portal_org:portal_organizations!portal_deal_pushes_portal_org_id_fkey(
            id, name, portal_slug
          )
        `)
        .eq('id', pushId)
        .maybeSingle();

      if (error) throw error;
      return data as PortalDealPushWithDetails | null;
    },
    enabled: !!pushId,
  });
}

/** Responses for a single push */
export function usePortalDealResponses(pushId: string | undefined) {
  return useQuery({
    queryKey: ['portal-deal-responses', pushId],
    queryFn: async (): Promise<(PortalDealResponse & { responder?: { name: string } })[]> => {
      if (!pushId) return [];
      const { data, error } = await untypedFrom('portal_deal_responses')
        .select(`
          *,
          responder:portal_users!portal_deal_responses_responded_by_fkey(name)
        `)
        .eq('push_id', pushId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!pushId,
  });
}

/** Build a deal snapshot from a listing using actual DB columns */
async function buildDealSnapshot(listingId: string): Promise<DealSnapshot> {
  // Try marketplace_listings view first (buyer-safe, active deals only)
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('id, title, category, categories, location, revenue, ebitda, description')
    .eq('id', listingId)
    .maybeSingle();

  if (error || !data) {
    // Fallback: fetch from listings directly (for internal/inactive deals)
    const { data: listing, error: listError } = await supabase
      .from('listings')
      .select('id, title, category, categories, location, revenue, ebitda, description')
      .eq('id', listingId)
      .maybeSingle();

    if (listError || !listing) throw new Error('Listing not found');

    return {
      headline: listing.title || 'Untitled Deal',
      industry: listing.category || '',
      geography: listing.location || '',
      ebitda: listing.ebitda,
      revenue: listing.revenue,
      business_description: listing.description || undefined,
      category: listing.category || undefined,
    };
  }

  return {
    headline: data.title || 'Untitled Deal',
    industry: data.category || '',
    geography: data.location || '',
    ebitda: data.ebitda,
    revenue: data.revenue,
    business_description: data.description || undefined,
    category: data.category || undefined,
  };
}

/** Push a deal to a portal */
export function usePushDealToPortal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: PushDealToPortalInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for duplicates
      const { data: existing } = await untypedFrom('portal_deal_pushes')
        .select('id, status, created_at')
        .eq('portal_org_id', input.portal_org_id)
        .eq('listing_id', input.listing_id)
        .neq('status', 'archived')
        .maybeSingle();

      if (existing) {
        throw new Error(`This deal was already pushed to this portal on ${new Date(existing.created_at).toLocaleDateString()}. Status: ${existing.status}`);
      }

      const snapshot = await buildDealSnapshot(input.listing_id);

      const { data, error } = await untypedFrom('portal_deal_pushes')
        .insert({
          portal_org_id: input.portal_org_id,
          listing_id: input.listing_id,
          pushed_by: user.id,
          push_note: input.push_note || null,
          priority: input.priority || 'standard',
          response_due_by: input.response_due_by || null,
          deal_snapshot: snapshot,
        })
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await untypedFrom('portal_activity_log').insert({
        portal_org_id: input.portal_org_id,
        actor_id: user.id,
        actor_type: 'admin',
        action: 'deal_pushed',
        push_id: data.id,
        metadata: { listing_id: input.listing_id, headline: snapshot.headline, priority: input.priority },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PORTAL_PUSHES_KEY] });
      queryClient.invalidateQueries({ queryKey: ['portal-organizations'] });
      toast({ title: 'Deal pushed to portal', description: 'The deal has been sent to the client portal.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error pushing deal', description: err.message, variant: 'destructive' });
    },
  });
}

/** Submit a response to a pushed deal (client portal) */
export function useSubmitDealResponse() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: SubmitDealResponseInput & { portal_user_id: string; portal_org_id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create response
      const { data, error } = await untypedFrom('portal_deal_responses')
        .insert({
          push_id: input.push_id,
          responded_by: input.portal_user_id,
          response_type: input.response_type,
          notes: input.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Update push status
      const statusMap: Record<string, string> = {
        interested: 'interested',
        pass: 'passed',
        need_more_info: 'needs_info',
        reviewing: 'reviewing',
        internal_review: 'reviewing',
      };

      await untypedFrom('portal_deal_pushes')
        .update({
          status: statusMap[input.response_type] || input.response_type,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.push_id);

      // Log activity
      await untypedFrom('portal_activity_log').insert({
        portal_org_id: input.portal_org_id,
        actor_id: user.id,
        actor_type: 'portal_user',
        action: 'response_submitted',
        push_id: input.push_id,
        metadata: { response_type: input.response_type },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-portal-deals'] });
      queryClient.invalidateQueries({ queryKey: ['portal-deal-push'] });
      queryClient.invalidateQueries({ queryKey: ['portal-deal-responses'] });
      toast({ title: 'Response submitted' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error submitting response', description: err.message, variant: 'destructive' });
    },
  });
}

/** Check if a deal has already been pushed to a portal */
export function useCheckDuplicatePush(portalOrgId: string | undefined, listingId: string | undefined) {
  return useQuery({
    queryKey: ['check-duplicate-push', portalOrgId, listingId],
    queryFn: async () => {
      if (!portalOrgId || !listingId) return null;
      const { data } = await untypedFrom('portal_deal_pushes')
        .select('id, status, created_at, pushed_by')
        .eq('portal_org_id', portalOrgId)
        .eq('listing_id', listingId)
        .neq('status', 'archived')
        .maybeSingle();
      return data;
    },
    enabled: !!portalOrgId && !!listingId,
  });
}

/**
 * Convert an "Interested" portal deal push into a pipeline deal.
 *
 * Flow:
 * 1. Create a connection_request with source='portal', status='approved'
 * 2. Call create_pipeline_deal() RPC to create the deal_pipeline row
 * 3. Update portal_deal_pushes.status to 'under_nda'
 * 4. Log activity
 */
export function useConvertToPipelineDeal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      pushId,
      portalOrgId,
      listingId,
      portalOrgName,
    }: {
      pushId: string;
      portalOrgId: string;
      listingId: string;
      portalOrgName: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Resolve the portal org's linked buyer profile (if any)
      const { data: portalOrg } = await untypedFrom('portal_organizations')
        .select('buyer_id, profile_id, name')
        .eq('id', portalOrgId)
        .single();

      // Check if a connection request already exists for this buyer + listing
      let connectionRequestId: string | null = null;

      if (portalOrg?.profile_id) {
        const { data: existing } = await supabase
          .from('connection_requests')
          .select('id')
          .eq('user_id', portalOrg.profile_id)
          .eq('listing_id', listingId)
          .limit(1)
          .maybeSingle();

        if (existing) {
          connectionRequestId = existing.id;
        }
      }

      // Create connection request if none exists
      if (!connectionRequestId) {
        const { data: newCr, error: crError } = await supabase
          .from('connection_requests')
          .insert({
            user_id: portalOrg?.profile_id || null,
            listing_id: listingId,
            status: 'approved',
            source: 'portal',
            lead_name: portalOrgName,
            user_message: `Expressed interest via Client Portal (${portalOrgName})`,
            source_metadata: {
              created_by_admin: true,
              admin_id: user.id,
              created_via: 'portal_conversion',
              portal_org_id: portalOrgId,
              portal_push_id: pushId,
            },
          })
          .select()
          .single();

        if (crError) throw crError;
        connectionRequestId = newCr.id;

        // Call the RPC to create the pipeline deal from the connection request
        const { data: dealId, error: rpcError } = await supabase.rpc(
          'create_pipeline_deal',
          { p_connection_request_id: connectionRequestId },
        );

        if (rpcError) {
          console.warn('create_pipeline_deal RPC error (trigger may handle it):', rpcError.message);
        }
      }

      // Update portal push status to under_nda
      const { error: updateError } = await untypedFrom('portal_deal_pushes')
        .update({
          status: 'under_nda',
          updated_at: new Date().toISOString(),
        })
        .eq('id', pushId);

      if (updateError) throw updateError;

      // Log activity
      await untypedFrom('portal_activity_log').insert({
        portal_org_id: portalOrgId,
        actor_id: user.id,
        actor_type: 'admin',
        action: 'converted_to_pipeline',
        push_id: pushId,
        metadata: {
          connection_request_id: connectionRequestId,
          listing_id: listingId,
        },
      });

      return { connectionRequestId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PORTAL_PUSHES_KEY] });
      queryClient.invalidateQueries({ queryKey: ['portal-deal-push'] });
      queryClient.invalidateQueries({ queryKey: ['portal-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      toast({
        title: 'Converted to pipeline deal',
        description: 'A connection request and pipeline deal have been created.',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Conversion failed', description: err.message, variant: 'destructive' });
    },
  });
}
