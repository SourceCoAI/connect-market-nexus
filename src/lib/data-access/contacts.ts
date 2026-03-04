/**
 * Contacts Data Access
 *
 * All contact queries go through these functions.
 * The unified `contacts` table is the single source of truth for contact info.
 */

import { supabase } from '@/integrations/supabase/client';
import { safeQuery, type DatabaseResult } from '@/lib/database';
import type { ContactRecord } from './types';

const CONTACT_SELECT =
  'id, first_name, last_name, email, phone, linkedin_url, title, contact_type, firm_id, nda_signed, fee_agreement_signed, created_at';

/**
 * Fetch contacts by type (buyer/seller).
 */
export async function getContactsByType(
  contactType: 'buyer' | 'seller',
  options?: { limit?: number; offset?: number },
): Promise<DatabaseResult<ContactRecord[]>> {
  return safeQuery(async () => {
    let query = supabase
      .from('contacts')
      .select(CONTACT_SELECT, { count: 'exact' })
      .eq('contact_type', contactType)
      .neq('archived', true)
      .order('created_at', { ascending: false });

    if (options?.limit) {
      const from = options.offset ?? 0;
      query = query.range(from, from + options.limit - 1);
    }

    return query;
  });
}

/**
 * Fetch a contact by ID.
 */
export async function getContactById(
  id: string,
): Promise<DatabaseResult<ContactRecord>> {
  return safeQuery(async () => {
    return supabase
      .from('contacts')
      .select(CONTACT_SELECT)
      .eq('id', id)
      .single();
  });
}

/**
 * Fetch contacts for a specific firm.
 */
export async function getContactsForFirm(
  firmId: string,
): Promise<DatabaseResult<ContactRecord[]>> {
  return safeQuery(async () => {
    return supabase
      .from('contacts')
      .select(CONTACT_SELECT)
      .eq('firm_id', firmId)
      .neq('archived', true)
      .order('is_primary_at_firm', { ascending: false })
      .order('created_at', { ascending: false });
  });
}

/**
 * Fetch contacts for a specific listing (seller contacts).
 */
export async function getContactsForListing(
  listingId: string,
): Promise<DatabaseResult<ContactRecord[]>> {
  return safeQuery(async () => {
    return supabase
      .from('contacts')
      .select(CONTACT_SELECT)
      .eq('listing_id', listingId)
      .eq('contact_type', 'seller')
      .neq('archived', true)
      .order('is_primary_seller_contact', { ascending: false });
  });
}

/**
 * Fetch contact by profile ID (for marketplace users).
 */
export async function getContactByProfileId(
  profileId: string,
): Promise<DatabaseResult<ContactRecord>> {
  return safeQuery(async () => {
    return supabase
      .from('contacts')
      .select(CONTACT_SELECT)
      .eq('profile_id', profileId)
      .single();
  });
}

/**
 * Search contacts by name or email.
 */
export async function searchContacts(
  query: string,
  options?: { contactType?: 'buyer' | 'seller'; limit?: number },
): Promise<DatabaseResult<ContactRecord[]>> {
  return safeQuery(async () => {
    let q = supabase
      .from('contacts')
      .select(CONTACT_SELECT)
      .neq('archived', true)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(options?.limit ?? 25);

    if (options?.contactType) {
      q = q.eq('contact_type', options.contactType);
    }

    return q;
  });
}
