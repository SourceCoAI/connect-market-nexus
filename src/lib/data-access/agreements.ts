/**
 * Agreements Data Access
 *
 * All agreement-related queries go through these functions.
 * `firm_agreements` is the single source of truth for agreement status.
 * Use resolve_contact_agreement_status() RPC for individual-level resolution.
 */

import { supabase } from '@/integrations/supabase/client';
import { safeQuery, type DatabaseResult } from '@/lib/database';
import type { AgreementStatus } from './types';

/**
 * Fetch agreement status for a firm.
 */
export async function getAgreementForFirm(
  firmId: string,
): Promise<DatabaseResult<AgreementStatus>> {
  return safeQuery(async () => {
    return supabase
      .from('firm_agreements')
      .select('id, firm_name, nda_status, fee_agreement_status, nda_signed_at, fee_agreement_signed_at')
      .eq('id', firmId)
      .single();
  });
}

/**
 * Resolve agreement status for a contact.
 * Uses the resolve_contact_agreement_status() RPC which checks both
 * firm-level and individual-level agreement status.
 */
export async function resolveContactAgreementStatus(
  contactId: string,
): Promise<DatabaseResult<{ nda_signed: boolean; fee_agreement_signed: boolean }>> {
  return safeQuery(async () => {
    return supabase.rpc('resolve_contact_agreement_status', {
      p_contact_id: contactId,
    });
  });
}

/**
 * Fetch all firm agreements for admin overview.
 */
export async function getAllAgreements(options?: {
  ndaStatus?: string;
  feeStatus?: string;
  limit?: number;
}): Promise<DatabaseResult<AgreementStatus[]>> {
  return safeQuery(async () => {
    let query = supabase
      .from('firm_agreements')
      .select('id, firm_name, nda_status, fee_agreement_status, nda_signed_at, fee_agreement_signed_at')
      .order('created_at', { ascending: false });

    if (options?.ndaStatus) {
      query = query.eq('nda_status', options.ndaStatus);
    }
    if (options?.feeStatus) {
      query = query.eq('fee_agreement_status', options.feeStatus);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return query;
  });
}
