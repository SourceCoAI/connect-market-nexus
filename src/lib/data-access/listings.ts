/**
 * Listings Data Access
 *
 * All listing-related queries go through these functions.
 * Currently the most-queried table (~177 direct .from() calls in the codebase).
 */

import { supabase } from '@/integrations/supabase/client';
import { safeQuery, type DatabaseResult } from '@/lib/database';
import type { ListingSummary, ListingDetail } from './types';

const LISTING_SUMMARY_SELECT =
  'id, title, description, asking_price, revenue, ebitda, status, category, location, created_at, updated_at';

const LISTING_DETAIL_SELECT =
  `${LISTING_SUMMARY_SELECT}, description_html, owner_id, main_contact_name, main_contact_email, is_published`;

/**
 * Fetch active listings for the marketplace.
 */
export async function getActiveListings(options?: {
  limit?: number;
  offset?: number;
  category?: string;
  search?: string;
}): Promise<DatabaseResult<ListingSummary[]>> {
  return safeQuery(async () => {
    let query = supabase
      .from('listings')
      .select(LISTING_SUMMARY_SELECT)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (options?.category) {
      query = query.eq('category', options.category);
    }
    if (options?.search) {
      query = query.ilike('title', `%${options.search}%`);
    }
    if (options?.limit) {
      const from = options.offset ?? 0;
      query = query.range(from, from + options.limit - 1);
    }

    return query;
  });
}

/**
 * Fetch a single listing by ID.
 */
export async function getListingById(
  id: string,
): Promise<DatabaseResult<ListingDetail>> {
  return safeQuery(async () => {
    return supabase
      .from('listings')
      .select(LISTING_DETAIL_SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .single();
  });
}

/**
 * Fetch listings owned by a specific user (for seller dashboard).
 */
export async function getListingsByOwner(
  ownerId: string,
): Promise<DatabaseResult<ListingSummary[]>> {
  return safeQuery(async () => {
    return supabase
      .from('listings')
      .select(LISTING_SUMMARY_SELECT)
      .eq('owner_id', ownerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
  });
}

/**
 * Fetch listings for admin view (includes all statuses).
 */
export async function getAdminListings(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<DatabaseResult<ListingSummary[]>> {
  return safeQuery(async () => {
    let query = supabase
      .from('listings')
      .select(LISTING_SUMMARY_SELECT, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (options?.status) {
      query = query.eq('status', options.status);
    }
    if (options?.limit) {
      const from = options.offset ?? 0;
      query = query.range(from, from + options.limit - 1);
    }

    return query;
  });
}
