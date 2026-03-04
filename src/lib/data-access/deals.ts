/**
 * Deals Data Access
 *
 * All deal pipeline queries go through these functions.
 * The `deals` table (being renamed to `deal_pipeline`) tracks all active deals.
 */

import { supabase } from '@/integrations/supabase/client';
import { safeQuery, type DatabaseResult } from '@/lib/database';
import type { DealSummary } from './types';

const DEAL_SUMMARY_SELECT =
  'id, listing_id, stage, source, buyer_priority_score, buyer_contact_id, seller_contact_id, assigned_admin_id, created_at, updated_at';

/**
 * Fetch deals for the pipeline view.
 */
export async function getPipelineDeals(options?: {
  stage?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
}): Promise<DatabaseResult<DealSummary[]>> {
  return safeQuery(async () => {
    let query = supabase
      .from('deals')
      .select(`${DEAL_SUMMARY_SELECT}, listings!inner(title)`, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (options?.stage) {
      query = query.eq('stage', options.stage);
    }
    if (options?.assignedTo) {
      query = query.eq('assigned_admin_id', options.assignedTo);
    }
    if (options?.limit) {
      const from = options.offset ?? 0;
      query = query.range(from, from + options.limit - 1);
    }

    return query;
  });
}

/**
 * Fetch a single deal by ID with full details.
 * For complex multi-table joins, prefer the get_deals_with_details() RPC.
 */
export async function getDealById(
  id: string,
): Promise<DatabaseResult<DealSummary>> {
  return safeQuery(async () => {
    return supabase
      .from('deals')
      .select(`${DEAL_SUMMARY_SELECT}, listings(title)`)
      .eq('id', id)
      .single();
  });
}

/**
 * Fetch deals for a specific listing.
 */
export async function getDealsForListing(
  listingId: string,
): Promise<DatabaseResult<DealSummary[]>> {
  return safeQuery(async () => {
    return supabase
      .from('deals')
      .select(DEAL_SUMMARY_SELECT)
      .eq('listing_id', listingId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
  });
}

/**
 * Fetch deals involving a specific buyer contact.
 */
export async function getDealsForBuyer(
  buyerContactId: string,
): Promise<DatabaseResult<DealSummary[]>> {
  return safeQuery(async () => {
    return supabase
      .from('deals')
      .select(`${DEAL_SUMMARY_SELECT}, listings(title)`)
      .eq('buyer_contact_id', buyerContactId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
  });
}

/**
 * Fetch deal stage counts for pipeline overview.
 * Uses the get_deals_with_details RPC for the full pipeline view.
 */
export async function getDealStageCounts(): Promise<
  DatabaseResult<{ stage: string; count: number }[]>
> {
  return safeQuery(async () => {
    return supabase.rpc('get_deal_stage_counts');
  });
}
