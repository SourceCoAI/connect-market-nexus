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
  TeaserSection,
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
    queryFn: async (): Promise<PortalDealPush[]> => {
      if (!portalOrgId) return [];
      const { data, error } = await untypedFrom('portal_deal_pushes')
        .select('*')
        .eq('portal_org_id', portalOrgId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as PortalDealPush[];
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

/** Build a deal snapshot from a listing + its full memo.
 *  Portal clients are under NDA/fee agreement so we include full company info. */
async function buildDealSnapshot(listingId: string): Promise<DealSnapshot> {
  // 1. Fetch listing basics (including internal company name)
  const { data: listing, error: listError } = await supabase
    .from('listings')
    .select('id, title, internal_company_name, category, categories, location, revenue, ebitda, description, description_html, project_name, website, executive_summary, linkedin_employee_count, google_rating, google_review_count')
    .eq('id', listingId)
    .maybeSingle();

  if (listError || !listing) throw new Error('Listing not found');

  // 2. Fetch the full memo HTML (preferred view for NDA clients)
  const { data: fullMemo } = await supabase
    .from('lead_memos')
    .select('content, html_content, branding, status')
    .eq('deal_id', listingId)
    .eq('memo_type', 'full_memo')
    .in('status', ['published', 'completed', 'draft'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Extract memo sections from content JSONB if available
  const memoContent = fullMemo?.content as Record<string, unknown> | null;
  const sections: TeaserSection[] = [];
  if (memoContent && Array.isArray(memoContent.sections)) {
    for (const s of memoContent.sections) {
      if (s && typeof s === 'object' && 'key' in s && 'title' in s && 'content' in s) {
        sections.push({
          key: String(s.key),
          title: String(s.title),
          content: String(s.content),
        });
      }
    }
  }

  return {
    headline: listing.internal_company_name || listing.title || 'Untitled Deal',
    industry: listing.category || '',
    geography: listing.location || '',
    ebitda: listing.ebitda,
    revenue: listing.revenue,
    website: listing.website || undefined,
    business_description: listing.description || undefined,
    category: listing.category || undefined,
    teaser_sections: sections.length > 0 ? sections : undefined,
    memo_html: fullMemo?.html_content || listing.description_html || undefined,
    project_name: listing.internal_company_name || listing.title || undefined,
    branding: fullMemo?.branding || undefined,
    executive_summary: listing.executive_summary || undefined,
    linkedin_employee_count: listing.linkedin_employee_count ?? undefined,
    google_rating: listing.google_rating ?? undefined,
    google_review_count: listing.google_review_count ?? undefined,
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
          data_room_access_token: input.data_room_access_token || null,
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
        metadata: { listing_id: input.listing_id, headline: snapshot.headline, priority: input.priority, actor_name: user.email },
      });

      // Send notifications to portal users (fire-and-forget)
      supabase.functions.invoke('send-portal-notification', {
        body: {
          portal_org_id: input.portal_org_id,
          push_id: data.id,
          deal_headline: snapshot.headline,
          priority: input.priority || 'standard',
          push_note: input.push_note,
        },
      }).catch((err) => console.warn('Portal notification error:', err));

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
    mutationFn: async (input: SubmitDealResponseInput & { portal_user_id: string; portal_org_id: string; responder_name?: string }) => {
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
      };

      await untypedFrom('portal_deal_pushes')
        .update({
          status: statusMap[input.response_type] || input.response_type,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.push_id);

      // Log activity with actor name for display
      await untypedFrom('portal_activity_log').insert({
        portal_org_id: input.portal_org_id,
        actor_id: user.id,
        actor_type: 'portal_user',
        action: 'response_submitted',
        push_id: input.push_id,
        metadata: {
          response_type: input.response_type,
          actor_name: input.responder_name || user.email,
        },
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

/** Mark a deal as viewed (sets first_viewed_at if not already set) */
export function useMarkDealViewed() {
  return useMutation({
    mutationFn: async ({ pushId, portalOrgId, viewerName }: { pushId: string; portalOrgId: string; viewerName?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Only set first_viewed_at if it hasn't been set yet
      const { data: push } = await untypedFrom('portal_deal_pushes')
        .select('first_viewed_at, status')
        .eq('id', pushId)
        .single();

      if (!push) return;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (!push.first_viewed_at) {
        updates.first_viewed_at = new Date().toISOString();
      }
      // Move from pending_review to viewed if still pending
      if (push.status === 'pending_review') {
        updates.status = 'viewed';
      }

      await untypedFrom('portal_deal_pushes')
        .update(updates)
        .eq('id', pushId);

      // Log view activity
      await untypedFrom('portal_activity_log').insert({
        portal_org_id: portalOrgId,
        actor_id: user.id,
        actor_type: 'portal_user',
        action: 'deal_viewed',
        push_id: pushId,
        metadata: { actor_name: viewerName || user.email },
      });
    },
  });
}

/** Admin: update a deal push (note, priority, or archive) */
export function useUpdateDealPush() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pushId, ...updates }: { pushId: string; push_note?: string; priority?: string; status?: string }) => {
      const { error } = await untypedFrom('portal_deal_pushes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', pushId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PORTAL_PUSHES_KEY] });
      queryClient.invalidateQueries({ queryKey: ['portal-deal-push'] });
      toast({ title: 'Deal updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error updating deal', description: err.message, variant: 'destructive' });
    },
  });
}

/** Admin: resend invite to a portal user */
export function useResendPortalInvite() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { portal_org_id: string; portal_slug: string; email: string; first_name: string; last_name?: string; role: string; buyer_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('invite-portal-user', {
        body: input,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, input) => {
      toast({ title: 'Invitation resent', description: `New login link sent to ${input.email}.` });
    },
    onError: (err: Error) => {
      toast({ title: 'Error resending invite', description: err.message, variant: 'destructive' });
    },
  });
}

/** Admin: refresh a deal snapshot with latest listing/memo data */
export function useRefreshDealSnapshot() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pushId, listingId }: { pushId: string; listingId: string }) => {
      const snapshot = await buildDealSnapshot(listingId);

      const { error } = await untypedFrom('portal_deal_pushes')
        .update({ deal_snapshot: snapshot, updated_at: new Date().toISOString() })
        .eq('id', pushId);

      if (error) throw error;
      return snapshot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PORTAL_PUSHES_KEY] });
      queryClient.invalidateQueries({ queryKey: ['portal-deal-push'] });
      queryClient.invalidateQueries({ queryKey: ['my-portal-deals'] });
      toast({ title: 'Snapshot refreshed', description: 'Deal data updated with latest memo and listing info.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error refreshing snapshot', description: err.message, variant: 'destructive' });
    },
  });
}

/** Check if a listing has a lead memo (required before pushing to portal) */
export function useCheckLeadMemo(listingId: string | undefined) {
  return useQuery({
    queryKey: ['check-lead-memo', listingId],
    queryFn: async () => {
      if (!listingId) return null;
      const { data } = await supabase
        .from('lead_memos')
        .select('id')
        .eq('deal_id', listingId)
        .eq('memo_type', 'full_memo')
        .in('status', ['published', 'completed', 'draft'])
        .limit(1)
        .maybeSingle();
      return { hasMemo: !!data };
    },
    enabled: !!listingId,
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
      }

        // Call the RPC to create the pipeline deal from the connection request
        const { data: _dealId, error: rpcError } = await supabase.rpc(
          'create_pipeline_deal',
          { p_connection_request_id: connectionRequestId },
        );

      if (rpcError) {
        // RPC may error if deal already exists — that's okay, log and continue
        console.warn('create_pipeline_deal RPC:', rpcError.message);
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
          actor_name: user.email,
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
