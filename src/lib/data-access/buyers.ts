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
  'id, company_name, buyer_type, thesis_summary, target_revenue_min, target_revenue_max, target_geographies, archived, created_at';

/**
 * Fetch active buyers for admin views.
 */
export async function getActiveBuyers(options?: {
  limit?: number;
  offset?: number;
  buyerType?: string;
}): Promise<DatabaseResult<BuyerSummary[]>> {
  return safeQuery(async () => {
    let query = supabase
      .from('buyers')
      .select(BUYER_SUMMARY_SELECT, { count: 'exact' })
      .eq('archived', false)
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
      .from('buyers')
      .select(BUYER_SUMMARY_SELECT)
      .eq('id', id)
      .single();
  });
}

/**
 * Fetch buyer with marketplace firm info.
 * For full profile data (name, email, etc.) use the get_buyer_profile RPC.
 */
export async function getBuyerWithProfile(
  buyerId: string,
): Promise<DatabaseResult<BuyerWithProfile>> {
  return safeQuery(async () => {
    return supabase
      .from('buyers')
      .select(`
        ${BUYER_SUMMARY_SELECT},
        marketplace_firm_id
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
): Promise<DatabaseResult<{ composite_score: number; buyer_id: string }[]>> {
  return safeQuery(async () => {
    return supabase
      .from('remarketing_scores')
      .select('composite_score, buyer_id')
      .eq('listing_id', listingId)
      .order('composite_score', { ascending: false })
      .limit(options?.limit ?? 50);
  });
}
