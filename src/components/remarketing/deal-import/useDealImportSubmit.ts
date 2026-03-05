/**
 * useDealImportSubmit.ts
 *
 * Import and merge logic for the deal spreadsheet import workflow.
 * Handles row-by-row insertion, duplicate detection, merge-fill for
 * existing listings, and progress tracking.
 *
 * Extracted from DealImportDialog.tsx for maintainability.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { normalizeDomain } from '@/lib/remarketing/normalizeDomain';
import {
  type ColumnMapping,
  processRow,
  sanitizeListingInsert,
} from '@/lib/deal-csv-import';

export interface ExistingDealRef {
  id: string;
  deal_source: string | null;
  company_name: string;
}

export interface ImportResults {
  imported: number;
  merged: number;
  errors: string[];
  importedIds: string[];
  /** Deals that already existed in the system (from any source) — includes both merged and pure-duplicate rows */
  existingDeals: ExistingDealRef[];
}

// Fields eligible for merge-fill
const MERGEABLE_FIELDS = [
  'main_contact_name', 'main_contact_email', 'main_contact_phone', 'main_contact_title',
  'description', 'executive_summary', 'general_notes', 'internal_notes', 'owner_goals',
  'category', 'industry', 'address', 'address_city', 'address_state', 'address_zip',
  'address_country', 'geographic_states', 'services', 'linkedin_url', 'fireflies_url',
  'internal_company_name', 'full_time_employees', 'number_of_locations',
  'google_review_count', 'google_rating',
];

interface MergeResult {
  id: string;
  fieldsUpdated: boolean;
  deal_source: string | null;
  company_name: string;
}

/**
 * When a deal already exists (duplicate website), find the existing listing
 * and fill in any null/empty fields with new CSV data.
 */
async function tryMergeExistingListing(
  newData: Record<string, unknown>,
  mergeableFields: string[],
): Promise<MergeResult | null> {
  try {
    const website = newData.website as string | undefined;
    const title = newData.title as string | undefined;

    let existingListing: Record<string, unknown> | null = null;

    if (website) {
      const { data: rpcData } = await supabase
        .rpc('find_listing_by_normalized_domain', { target_domain: website })
        .limit(1)
        .maybeSingle();
      existingListing = rpcData as Record<string, unknown> | null;

      if (!existingListing) {
        const { data } = await supabase
          .from('listings')
          .select('*')
          .eq('website', website)
          .limit(1)
          .maybeSingle();
        existingListing = data as Record<string, unknown> | null;
      }
    }

    if (!existingListing && title) {
      const { data } = await supabase
        .from('listings')
        .select('*')
        .ilike('title', title)
        .limit(1)
        .maybeSingle();
      existingListing = data as Record<string, unknown> | null;
    }

    if (!existingListing) return null;

    const existingRef: MergeResult = {
      id: existingListing.id as string,
      fieldsUpdated: false,
      deal_source: (existingListing.deal_source as string) ?? null,
      company_name: (existingListing.internal_company_name as string)
        || (existingListing.title as string)
        || 'Unknown',
    };

    const updates: Record<string, unknown> = {};

    for (const field of mergeableFields) {
      const newValue = newData[field];
      const existingValue = existingListing[field];

      if (newValue === undefined || newValue === null || newValue === '') continue;
      if (field === 'category' && newValue === 'Other') continue;

      const isEmpty =
        existingValue === null
        || existingValue === undefined
        || existingValue === ''
        || (field === 'description' && existingValue === (existingListing.title || ''))
        || (field === 'category' && existingValue === 'Other')
        || (field === 'location' && existingValue === 'Unknown');

      if (isEmpty) {
        updates[field] = newValue;
      }
    }

    if (
      (updates.address_city || updates.address_state) &&
      (existingListing.location === 'Unknown' || !existingListing.location)
    ) {
      const newCity = (updates.address_city || existingListing.address_city || '') as string;
      const newState = (updates.address_state || existingListing.address_state || '') as string;
      if (newCity && newState) {
        updates.location = `${newCity}, ${newState}`;
      } else if (newState || newCity) {
        updates.location = newState || newCity;
      }
    }

    if (typeof newData.revenue === 'number' && newData.revenue > 0
        && (existingListing.revenue === 0 || existingListing.revenue === null)) {
      updates.revenue = newData.revenue;
    }
    if (typeof newData.ebitda === 'number' && newData.ebitda > 0
        && (existingListing.ebitda === 0 || existingListing.ebitda === null)) {
      updates.ebitda = newData.ebitda;
    }

    if (Object.keys(updates).length === 0) return existingRef;

    const { error: updateError } = await supabase
      .from('listings')
      .update(updates as never)
      .eq('id', existingListing.id as string);

    if (updateError) {
      console.warn('Merge update failed:', updateError.message);
      return existingRef;
    }

    existingRef.fieldsUpdated = true;
    return existingRef;
  } catch (err) {
    console.warn('Merge lookup failed:', (err as Error).message);
    return null;
  }
}

export interface HandleImportOptions {
  csvData: Record<string, string>[];
  columnMappings: ColumnMapping[];
  referralPartnerId?: string;
  dealSource?: string;
  hideFromAllDeals?: boolean;
  onProgress: (progress: number) => void;
}

export async function handleImport({
  csvData,
  columnMappings,
  referralPartnerId,
  dealSource,
  hideFromAllDeals,
  onProgress,
}: HandleImportOptions): Promise<ImportResults> {
  const results: ImportResults = { imported: 0, merged: 0, errors: [], importedIds: [], existingDeals: [] };

  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    onProgress(Math.round(((i + 1) / csvData.length) * 100));

    try {
      const { data: parsedData, errors: rowErrors } = processRow(row, columnMappings, i + 2);

      if (rowErrors.length > 0) {
        rowErrors.forEach(err => {
          results.errors.push(`Row ${err.row}: ${err.message}`);
        });
      }

      if (!parsedData) continue;

      // Skip rows without a website — can't enrich or deduplicate without one
      const rawWebsite = (parsedData as Record<string, unknown>).website;
      if (!rawWebsite || (typeof rawWebsite === 'string' && !rawWebsite.trim())) {
        results.errors.push(`Row ${i + 2}: Skipped — no website provided`);
        continue;
      }

      const city = typeof parsedData.address_city === 'string' ? parsedData.address_city : '';
      const state = typeof parsedData.address_state === 'string' ? parsedData.address_state : '';
      const computedLocation = city && state ? `${city}, ${state}` : state || city || "Unknown";

      const listingData = sanitizeListingInsert({
        ...parsedData,
        status: referralPartnerId ? 'pending_referral_review' : 'active',
        location: computedLocation,
        is_internal_deal: true,
        ...(dealSource ? { deal_source: dealSource } : {}),
        ...(hideFromAllDeals ? { pushed_to_all_deals: false } : {}),
      });

      if (typeof listingData.revenue !== 'number' || Number.isNaN(listingData.revenue)) {
        (listingData as Record<string, unknown>).revenue = 0;
      }
      if (typeof listingData.ebitda !== 'number' || Number.isNaN(listingData.ebitda)) {
        (listingData as Record<string, unknown>).ebitda = 0;
      }
      if (typeof listingData.description !== 'string') {
        (listingData as Record<string, unknown>).description = '';
      }

      if ((listingData as Record<string, unknown>).website) {
        const normalized = normalizeDomain((listingData as Record<string, unknown>).website as string);
        if (normalized) {
          (listingData as Record<string, unknown>).website = normalized;
        }
      }

      if (referralPartnerId) {
        (listingData as Record<string, unknown>).referral_partner_id = referralPartnerId;
      }

      const { data: insertedData, error: insertError } = await supabase
        .from("listings")
        .insert(listingData as never)
        .select('id')
        .single();

      if (insertError) {
        const isDuplicate = insertError.message?.includes('duplicate key')
          || insertError.message?.includes('unique constraint')
          || insertError.code === '23505';

        if (isDuplicate) {
          const mergeResult = await tryMergeExistingListing(
            listingData as Record<string, unknown>,
            MERGEABLE_FIELDS,
          );
          if (mergeResult) {
            results.existingDeals.push({
              id: mergeResult.id,
              deal_source: mergeResult.deal_source,
              company_name: mergeResult.company_name,
            });
            if (mergeResult.fieldsUpdated) {
              results.merged++;
              results.importedIds.push(mergeResult.id);
            } else {
              results.errors.push(`Row ${i + 2}: duplicate key value violates unique constraint`);
            }
          } else {
            results.errors.push(`Row ${i + 2}: duplicate key value violates unique constraint`);
          }
        } else {
          throw insertError;
        }
      } else {
        results.imported++;
        if (insertedData?.id) {
          results.importedIds.push(insertedData.id);
        }
      }
    } catch (error) {
      results.errors.push(`Row ${i + 2}: ${(error as Error).message}`);
    }
  }

  if (results.imported > 0 || results.merged > 0) {
    const parts: string[] = [];
    if (results.imported > 0) parts.push(`${results.imported} new`);
    if (results.merged > 0) parts.push(`${results.merged} updated`);
    const pendingMsg = referralPartnerId ? ' (pending review)' : '';
    toast.success(`Successfully processed ${parts.join(', ')} deals${pendingMsg}`);
  }

  return results;
}
