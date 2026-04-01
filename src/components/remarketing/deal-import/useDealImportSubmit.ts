/**
 * useDealImportSubmit.ts
 *
 * Import and merge logic for the deal spreadsheet import workflow.
 * NOTE: Uses deal_source (single column) only — NOT deal_sources.
 * Handles row-by-row insertion, duplicate detection, merge-fill for
 * existing listings, and progress tracking.
 *
 * Extracted from DealImportDialog.tsx for maintainability.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { normalizeDomain, isGenericEmailDomain } from '@/lib/remarketing/normalizeDomain';
import {
  type ColumnMapping,
  processRow,
  sanitizeListingInsert,
} from '@/lib/deal-csv-import';

export interface DealLocation {
  /** Human-readable section name */
  label: string;
  /** URL path to the deal in the admin UI */
  href: string;
}

export interface DuplicateDetail {
  /** CSV row number (1-based display) */
  row: number;
  /** Company name from CSV */
  csvCompanyName: string;
  /** Matched existing listing title */
  existingTitle: string;
  /** Matched existing listing ID */
  existingId: string;
  /** What field triggered the match (website or name) */
  matchedBy: 'website' | 'name';
  /** Whether empty fields were merged */
  wasMerged: boolean;
  /** Where the deal currently exists in the system */
  locations: DealLocation[];
}

export interface ImportResults {
  imported: number;
  merged: number;
  errors: string[];
  importedIds: string[];
  duplicates: DuplicateDetail[];
  skippedGenericDomains: string[];
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
  listingId: string;
  existingTitle: string;
  matchedBy: 'website' | 'name';
  fieldsUpdated: boolean;
  locations: DealLocation[];
}

/**
 * Determine where an existing listing lives in the system based on its
 * deal_source, pushed_to_all_deals flag, and universe memberships.
 */
async function resolveLocations(listing: Record<string, unknown>): Promise<DealLocation[]> {
  const locations: DealLocation[] = [];
  const id = listing.id as string;
  const dealSource = listing.deal_source as string | null;
  const pushed = listing.pushed_to_all_deals as boolean | null;

  if (dealSource === 'sourceco') {
    locations.push({ label: 'SourceCo Deals', href: `/admin/remarketing/leads/sourceco/${id}` });
  } else if (dealSource === 'captarget') {
    locations.push({ label: 'CapTarget Deals', href: `/admin/remarketing/leads/captarget/${id}` });
  } else if (dealSource === 'gp_partners') {
    locations.push({ label: 'GP Partner Deals', href: `/admin/remarketing/leads/gp-partners/${id}` });
  } else if (dealSource === 'valuation') {
    locations.push({ label: 'Valuation Leads', href: `/admin/remarketing/leads/valuation` });
  }

  // All Deals (pushed)
  if (pushed) {
    locations.push({ label: 'All Deals', href: `/admin/remarketing/deals` });
  }

  // Check universe memberships
  try {
    const { data: universes } = await supabase
      .from('remarketing_universe_deals')
      .select('universe_id, remarketing_universes!inner(name)')
      .eq('listing_id', id)
      .limit(5);

    if (universes && universes.length > 0) {
      for (const u of universes) {
        const uni = u as Record<string, unknown>;
        const uniInfo = uni.remarketing_universes as Record<string, unknown> | null;
        const uniName = (uniInfo?.name as string) || 'Unknown Universe';
        locations.push({
          label: `Universe: ${uniName}`,
          href: `/admin/remarketing/universes/${uni.universe_id}`,
        });
      }
    }
  } catch {
    // Non-critical — skip universe lookup on failure
  }

  // Fallback if no specific location found
  if (locations.length === 0) {
    locations.push({ label: 'Deal Detail', href: `/admin/remarketing/deals/${id}` });
  }

  return locations;
}

/**
 * When a deal already exists (duplicate website), find the existing listing
 * and fill in any null/empty fields with new CSV data.
 *
 * Website match: searches globally (websites are unique across all sources).
 * Title match: only searches within the same deal_source to prevent
 * false-positive merges across unrelated deal pipelines.
 */
async function tryMergeExistingListing(
  newData: Record<string, unknown>,
  mergeableFields: string[],
): Promise<MergeResult | null> {
  try {
    const website = newData.website as string | undefined;
    const title = newData.title as string | undefined;
    const dealSource = newData.deal_source as string | undefined;

    // Skip placeholder websites — they're unique per row, not real duplicates
    const isPlaceholder = website && (website.endsWith('.unknown') || website.startsWith('unknown-'));

    let existingListing: Record<string, unknown> | null = null;
    let matchedBy: 'website' | 'name' = 'website';

    if (website && !isPlaceholder) {
      // Use the RPC which normalizes both sides (strips protocol, www, etc.)
      // so "https://www.example.com" matches "example.com" in the DB.
      const { data: rpcData } = await supabase
        .rpc('find_listing_by_normalized_domain', { target_domain: website })
        .limit(1)
        .maybeSingle();
      existingListing = rpcData as Record<string, unknown> | null;
    }

    // Title match: only within the same deal_source to avoid cross-pipeline false merges.
    // Also catches re-imports of the same CSV (where placeholder websites differ each time).
    if (!existingListing && title && dealSource) {
      const { data } = await supabase
        .from('listings')
        .select('*')
        .ilike('title', title)
        .eq('deal_source', dealSource)
        .limit(1)
        .maybeSingle();
      existingListing = data as Record<string, unknown> | null;
      if (existingListing) matchedBy = 'name';
    }

    if (!existingListing) return null;

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

    // Update deal_source so the deal appears in the importing pipeline
    if (dealSource && existingListing.deal_source !== dealSource) {
      updates.deal_source = dealSource;
    }

    // If the matched listing was soft-deleted, un-delete it on re-import
    const wasSoftDeleted = existingListing.deleted_at != null;
    if (wasSoftDeleted) {
      updates.deleted_at = null;
    }

    const existingId = existingListing.id as string;
    const existingTitle = (existingListing.title as string) || 'Unknown';
    const locations = await resolveLocations(existingListing);

    if (Object.keys(updates).length === 0) {
      return { listingId: existingId, existingTitle, matchedBy, fieldsUpdated: false, locations };
    }

    const { error: updateError } = await supabase
      .from('listings')
      .update(updates as never)
      .eq('id', existingId);

    if (updateError) {
      console.warn('Merge update failed:', updateError.message);
      return { listingId: existingId, existingTitle, matchedBy, fieldsUpdated: false, locations };
    }

    return { listingId: existingId, existingTitle, matchedBy, fieldsUpdated: true, locations };
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
  const results: ImportResults = {
    imported: 0,
    merged: 0,
    errors: [],
    importedIds: [],
    duplicates: [],
    skippedGenericDomains: [],
  };

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

      const rawWebsite = parsedData.website;

      // Skip rows where "website" is actually a generic email domain (gmail.com, etc.)
      if (isGenericEmailDomain(rawWebsite as string)) {
        const companyName = (parsedData.title as string) || 'Unknown';
        results.skippedGenericDomains.push(
          `${companyName} (${rawWebsite} is a personal email domain, not a company website)`
        );
        results.errors.push(
          `Row ${i + 2}: Skipped — "${rawWebsite}" is a personal email domain, not a company website`
        );
        continue;
      }

      const city = typeof parsedData.address_city === 'string' ? parsedData.address_city : '';
      const state = typeof parsedData.address_state === 'string' ? parsedData.address_state : '';
      const computedLocation = city && state ? `${city}, ${state}` : state || city || "Unknown";

      // Auto-populate internal_company_name from title for dedup on re-imports
      const parsed = parsedData as unknown as Record<string, unknown>;
      if (parsed.title && !parsed.internal_company_name) {
        parsed.internal_company_name = parsed.title;
      }

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

      // If still no website after normalization, generate a placeholder
      // so the NOT NULL constraint is satisfied and the row can be imported.
      // Include row index to guarantee uniqueness even within the same millisecond.
      if (!(listingData as Record<string, unknown>).website) {
        const companyName = ((listingData as Record<string, unknown>).title as string) || 'unknown';
        const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
        (listingData as Record<string, unknown>).website = `unknown-${slug}-${Date.now()}-r${i}.unknown`;
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
            const csvTitle = (parsedData.title as string) || 'Unknown';
            results.duplicates.push({
              row: i + 2,
              csvCompanyName: csvTitle,
              existingTitle: mergeResult.existingTitle,
              existingId: mergeResult.listingId,
              matchedBy: mergeResult.matchedBy,
              wasMerged: mergeResult.fieldsUpdated,
              locations: mergeResult.locations,
            });
            if (mergeResult.fieldsUpdated) {
              results.merged++;
            }
            results.importedIds.push(mergeResult.listingId);
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
