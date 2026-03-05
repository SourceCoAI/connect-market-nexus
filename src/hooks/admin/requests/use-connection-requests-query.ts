import { supabase } from '@/integrations/supabase/client';
import { AdminConnectionRequest } from '@/types/admin';
import { toast } from '@/hooks/use-toast';
import { createUserObject } from '@/lib/auth-helpers';
import { createListingFromData } from '@/utils/user-helpers';
import { createQueryKey } from '@/lib/query-keys';
import { useAuth } from '@/context/AuthContext';
import { useTabAwareQuery } from '@/hooks/use-tab-aware-query';

// TODO: Phase 6 — migrate to data access layer once connection_requests queries are centralized.
// This hook queries .from('connection_requests') with inbound_leads joins, then batch-fetches
// profiles and listings by ID. A getAdminConnectionRequests() data access function with
// pre-joined profile/listing data (or an RPC) would consolidate this N+1-avoidance pattern.

/**
 * Hook for fetching connection requests in admin dashboard
 */
export function useConnectionRequestsQuery() {
  const { user, authChecked } = useAuth();

  // Get cached auth state for more stable query enabling
  const cachedAuthState = (() => {
    try {
      const cached = localStorage.getItem('user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  })();

  const isAdminUser = user?.is_admin === true || cachedAuthState?.is_admin === true;
  const shouldEnable = (authChecked || cachedAuthState) && isAdminUser;

  return useTabAwareQuery(
    createQueryKey.adminConnectionRequests(),
    async () => {
      try {
        console.time('fetch-connection-requests');

        if (!isAdminUser) {
          throw new Error('Admin authentication required');
        }

        const { data: requests, error } = await supabase
          .from('connection_requests')
          .select(
            `
            *,
            source_lead:inbound_leads!source_lead_id (
              id,
              name,
              email,
              company_name,
              message,
              priority_score,
              source,
              source_form_name
            )
          `,
          )
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (!requests || requests.length === 0) {
          console.timeEnd('fetch-connection-requests');
          return [] as AdminConnectionRequest[];
        }

        // Collect unique IDs for batch fetching (avoid N+1 queries)
        // Filter out null user_ids for lead-only requests
        const userIds = Array.from(new Set(requests.map((r) => r.user_id).filter(Boolean)));
        const listingIds = Array.from(new Set(requests.map((r) => r.listing_id).filter(Boolean)));
        const followedIds = Array.from(
          new Set(requests.map((r) => r.followed_up_by).filter(Boolean)),
        );
        const negativeFollowedIds = Array.from(
          new Set(requests.map((r) => r.negative_followed_up_by).filter(Boolean)),
        );
        const approvedIds = Array.from(new Set(requests.map((r) => r.approved_by).filter(Boolean)));
        const rejectedIds = Array.from(new Set(requests.map((r) => r.rejected_by).filter(Boolean)));
        const onHoldIds = Array.from(new Set(requests.map((r) => r.on_hold_by).filter(Boolean)));
        const flaggedIds = Array.from(
          new Set(requests.map((r) => r.flagged_for_review_by).filter(Boolean)),
        );
        const flaggedAssignedIds = Array.from(
          new Set(requests.map((r) => r.flagged_for_review_assigned_to).filter(Boolean)),
        );
        const profileIds = Array.from(
          new Set([
            ...userIds,
            ...followedIds,
            ...negativeFollowedIds,
            ...approvedIds,
            ...rejectedIds,
            ...onHoldIds,
            ...flaggedIds,
            ...flaggedAssignedIds,
          ]),
        ).filter((id): id is string => id !== null);

        // Batch fetch related data in parallel
        // Chunk large ID arrays to avoid exceeding PostgREST URL length limits
        const CHUNK_SIZE = 100;
        const fetchInChunks = async (
          table: 'profiles' | 'listings',
          select: string,
          ids: string[],
        ): Promise<{ data: Record<string, unknown>[]; error: unknown }> => {
          if (ids.length === 0) return { data: [], error: null };
          const chunks: string[][] = [];
          for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            chunks.push(ids.slice(i, i + CHUNK_SIZE));
          }
          const results = await Promise.all(
            chunks.map((chunk) =>
              supabase.from(table).select(select).in('id', chunk),
            ),
          );
          const allData: Record<string, unknown>[] = [];
          let firstError: unknown = null;
          for (const res of results) {
            if (res.error && !firstError) firstError = res.error;
            if (res.data) allData.push(...res.data);
          }
          return { data: allData, error: firstError };
        };

        const [profilesRes, listingsRes] = await Promise.all([
          fetchInChunks('profiles', '*', profileIds),
          fetchInChunks(
            'listings',
            'id, title, category, status, revenue, ebitda, image_url, location, internal_company_name',
            listingIds,
          ),
        ]);

        if (profilesRes.error) console.error('Error fetching profiles batch:', profilesRes.error);
        if (listingsRes.error) console.error('Error fetching listings batch:', listingsRes.error);

        const profilesById = new Map<string, NonNullable<typeof profilesRes.data>[number]>();
        (profilesRes.data ?? []).forEach((p) => profilesById.set(p.id as string, p));

        const listingsById = new Map<string, NonNullable<typeof listingsRes.data>[number]>();
        (listingsRes.data ?? []).forEach((l) => listingsById.set(l.id as string, l));

        const enhancedRequests: AdminConnectionRequest[] = requests.map((request) => {
          const userData = request.user_id ? profilesById.get(request.user_id) : undefined;
          const listingData = listingsById.get(request.listing_id);

          const followedAdminProfile = request.followed_up_by
            ? profilesById.get(request.followed_up_by)
            : null;
          const negativeFollowedAdminProfile = request.negative_followed_up_by
            ? profilesById.get(request.negative_followed_up_by)
            : null;
          const approvedAdminProfile = request.approved_by
            ? profilesById.get(request.approved_by)
            : null;
          const rejectedAdminProfile = request.rejected_by
            ? profilesById.get(request.rejected_by)
            : null;
          const onHoldAdminProfile = request.on_hold_by
            ? profilesById.get(request.on_hold_by)
            : null;
          const flaggedAdminProfile = request.flagged_for_review_by
            ? profilesById.get(request.flagged_for_review_by)
            : null;
          const flaggedAssignedProfile = request.flagged_for_review_assigned_to
            ? profilesById.get(request.flagged_for_review_assigned_to)
            : null;

          const user = userData ? createUserObject(userData) : null;
          const listing = listingData ? createListingFromData(listingData) : null;

          const status = request.status as 'pending' | 'approved' | 'rejected' | 'on_hold';

          return {
            ...request,
            status,
            user,
            listing,
            flaggedByAdmin: flaggedAdminProfile ? createUserObject(flaggedAdminProfile) : null,
            flaggedAssignedToAdmin: flaggedAssignedProfile
              ? createUserObject(flaggedAssignedProfile)
              : null,
            followedUpByAdmin: followedAdminProfile ? createUserObject(followedAdminProfile) : null,
            negativeFollowedUpByAdmin: negativeFollowedAdminProfile
              ? createUserObject(negativeFollowedAdminProfile)
              : null,
            approvedByAdmin: approvedAdminProfile ? createUserObject(approvedAdminProfile) : null,
            rejectedByAdmin: rejectedAdminProfile ? createUserObject(rejectedAdminProfile) : null,
            onHoldByAdmin: onHoldAdminProfile ? createUserObject(onHoldAdminProfile) : null,
            sourceLead: request.source_lead || null,
          } as AdminConnectionRequest;
        });

        console.timeEnd('fetch-connection-requests');
        return enhancedRequests;
      } catch (error: unknown) {
        toast({
          variant: 'destructive',
          title: 'Error fetching connection requests',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        return [] as AdminConnectionRequest[];
      }
    },
    {
      enabled: shouldEnable,
      staleTime: 1000 * 60 * 2,
      // Remove refetchOnWindowFocus - let global settings handle this
    },
  );
}
