import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminConnectionRequest } from '@/types/admin';
import { createUserObject } from '@/lib/auth-helpers';
import { createListingFromData } from '@/utils/user-helpers';
import { createQueryKey } from '@/lib/query-keys';

/**
 * Hook for fetching all connection requests by a specific user
 */
export function useUserConnectionRequests(userId: string) {
  return useQuery({
    queryKey: createQueryKey.userConnectionRequests(userId),
    queryFn: async () => {
      if (!userId) return [];

      const { data: requests, error } = await supabase
        .from('connection_requests')
        .select('id, created_at, updated_at, listing_id, status, user_id, firm_id, pipeline_stage_id, source, source_metadata, user_message, lead_name, lead_email, lead_phone, lead_company, lead_role, approved_at, approved_by, rejected_at, rejected_by, converted_at, converted_by, decision_at, decision_notes, stage_entered_at, on_hold_at, on_hold_by, followed_up, followed_up_at, followed_up_by, negative_followed_up, negative_followed_up_at, negative_followed_up_by, lead_nda_signed, lead_nda_signed_at, lead_nda_email_sent, lead_nda_email_sent_at, lead_fee_agreement_signed, lead_fee_agreement_signed_at, lead_fee_agreement_email_sent, lead_fee_agreement_email_sent_at, buyer_priority_score')
        .eq('user_id', userId)
        .in('status', ['pending', 'approved']) // Active requests that need follow-up tracking
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Batch-fetch all related data instead of N+1 queries per request
      const allProfileIds = new Set<string>();
      const allListingIds = new Set<string>();

      for (const req of requests) {
        if (req.user_id) allProfileIds.add(req.user_id);
        if (req.followed_up_by) allProfileIds.add(req.followed_up_by);
        if (req.negative_followed_up_by) allProfileIds.add(req.negative_followed_up_by);
        if (req.listing_id) allListingIds.add(req.listing_id);
      }

      const [{ data: allProfiles }, { data: allListings }] = await Promise.all([
        supabase.from('profiles').select('id, email, first_name, last_name, company, company_name, phone_number, buyer_type, approval_status, is_admin, created_at, updated_at, email_verified, website, linkedin_profile, job_title, bio, business_categories, target_locations, revenue_range_min, revenue_range_max, investment_size, fund_size, aum, estimated_revenue, onboarding_completed, fee_agreement_signed, fee_agreement_signed_at, fee_agreement_email_sent, fee_agreement_email_sent_at, nda_signed, nda_signed_at, nda_email_sent, nda_email_sent_at').in('id', [...allProfileIds]),
        supabase.from('listings').select('id, title, category, location, description, image_url, revenue, ebitda, full_time_employees, part_time_employees, acquisition_type, status, industry, created_at, updated_at').in('id', [...allListingIds]),
      ]);

      const profileMap = new Map((allProfiles || []).map(p => [p.id, p]));
      const listingMap = new Map((allListings || []).map(l => [l.id, l]));

      const enhancedRequests = requests.map(request => {
        const userData = request.user_id ? profileMap.get(request.user_id) : undefined;
        const listingData = request.listing_id ? listingMap.get(request.listing_id) : undefined;

        const followedUpByAdmin = request.followed_up_by
          ? (profileMap.get(request.followed_up_by) ? createUserObject(profileMap.get(request.followed_up_by)!) : null)
          : null;
        const negativeFollowedUpByAdmin = request.negative_followed_up_by
          ? (profileMap.get(request.negative_followed_up_by) ? createUserObject(profileMap.get(request.negative_followed_up_by)!) : null)
          : null;

        const user = userData ? createUserObject(userData) : null;
        const listing = listingData ? createListingFromData(listingData) : null;
        const status = request.status as "pending" | "approved" | "rejected";

        const result = {
          ...request,
          status,
          user,
          listing,
          source: (request.source as AdminConnectionRequest['source']) || 'marketplace',
          source_metadata: (request.source_metadata as Record<string, unknown>) || {},
          followedUpByAdmin,
          negativeFollowedUpByAdmin
        } as AdminConnectionRequest;

        return result;
      });

      return enhancedRequests;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  });
}