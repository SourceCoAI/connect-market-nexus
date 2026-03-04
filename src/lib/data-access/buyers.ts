/**
 * Buyers Data Access
 *
 * All buyer-related queries go through these functions.
 * The `buyers` table (formerly remarketing_buyers) is the single source of truth
 * for buyer organization data.
 */

import { supabase } from '@/integrations/supabase/client';
import { safeQuery, type DatabaseResult } from '@/lib/database';
import type { BuyerSummary, BuyerWithProfile } from './types';

const BUYER_SUMMARY_SELECT =
  'id, company_name, buyer_type, thesis_summary, target_revenue_min, target_revenue_max, geographic_focus, status, created_at';

/**
 * Fetch active buyers for admin views.
 */
export async function getActiveBuyers(options?: {
  limit?: number;
  offset?: number;
  buyerType?: string;
}): Promise<DatabaseResult<BuyerSummary[]>> {
  return safeQuery(async () => {
    // Use the renamed table via the view if available, otherwise fallback
    let query = supabase
      .from('remarketing_buyers')
      .select(BUYER_SUMMARY_SELECT, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (options?.buyerType) {
      query = query.eq('buyer_type', options.buyerType);
    }
    if (options?.limit) {
      const from = options.offset ?? 0;
      query = query.range(from, from + options.limit - 1);
    }

    return query;
  });
}

/**
 * Fetch a single buyer by ID.
 */
export async function getBuyerById(
  id: string,
): Promise<DatabaseResult<BuyerSummary>> {
  return safeQuery(async () => {
    return supabase
      .from('remarketing_buyers')
      .select(BUYER_SUMMARY_SELECT)
      .eq('id', id)
      .single();
  });
}

/**
 * Fetch buyer with joined profile data.
 * Uses the get_buyer_profile RPC once available (Phase 1).
 * Until then, does a manual join via two queries.
 */
export async function getBuyerWithProfile(
  buyerId: string,
): Promise<DatabaseResult<BuyerWithProfile>> {
  return safeQuery(async () => {
    return supabase
      .from('remarketing_buyers')
      .select(`
        id, company_name, buyer_type, thesis_summary,
        target_revenue_min, target_revenue_max, geographic_focus,
        status, created_at,
        marketplace_user_id,
        profiles!remarketing_buyers_marketplace_user_id_fkey (
          id, first_name, last_name, email, phone_number
        )
      `)
      .eq('id', buyerId)
      .single();
  });
}

/**
 * Fetch buyers matched to a listing for deal sourcing.
 */
export async function getBuyerMatchesForListing(
  listingId: string,
  options?: { limit?: number },
): Promise<DatabaseResult<BuyerSummary[]>> {
  return safeQuery(async () => {
    return supabase
      .from('remarketing_scores')
      .select(`
        score,
        remarketing_buyers!inner (
          id, company_name, buyer_type, thesis_summary,
          target_revenue_min, target_revenue_max, geographic_focus,
          status, created_at
        )
      `)
      .eq('listing_id', listingId)
      .order('score', { ascending: false })
      .limit(options?.limit ?? 50);
  });
}
