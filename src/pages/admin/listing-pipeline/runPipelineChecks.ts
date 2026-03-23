/**
 * Shared pipeline-check logic used by both ListingPipelineTest (tab) and Run All.
 * Runs 10 sequential DB checks to verify the full listing pipeline.
 */

import { supabase } from '@/integrations/supabase/client';

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'pending' | 'running';
  detail: string;
  data?: Record<string, unknown>;
}

export interface PipelineReport {
  dealId: string;
  dealTitle: string;
  checks: CheckResult[];
  ranAt: string;
}

export async function runPipelineChecks(dealId: string): Promise<PipelineReport> {
  const checks: CheckResult[] = [];

  // 1. Fetch deal data
  const { data: deal, error: dealErr } = await supabase
    .from('listings')
    .select(
      `id, title, internal_company_name, website, revenue, ebitda,
       address_state, location, category, industry,
       executive_summary, description,
       main_contact_name, main_contact_email,
       pushed_to_marketplace, pushed_to_marketplace_at,
       source_deal_id, is_internal_deal, published_at, image_url,
       ebitda_margin, full_time_employees, service_mix, services,
       investment_thesis, custom_sections, growth_drivers,
       competitive_position, ownership_structure, seller_motivation,
       business_model, customer_geography, customer_types,
       revenue_model, end_market_description, hero_description`,
    )
    .eq('id', dealId)
    .single();

  if (dealErr || !deal) {
    checks.push({
      name: 'Deal exists',
      status: 'fail',
      detail: `Could not fetch deal: ${dealErr?.message || 'Not found'}`,
    });
    return { dealId, dealTitle: 'Unknown', checks, ranAt: new Date().toISOString() };
  }

  checks.push({
    name: 'Deal exists',
    status: 'pass',
    detail: `${deal.internal_company_name || deal.title || dealId}`,
  });

  // 2. Push-to-marketplace gate checks (must match publish-listing edge function requirements)
  const gateFields: Array<{ label: string; check: () => boolean }> = [
    { label: 'Revenue', check: () => typeof deal.revenue === 'number' && deal.revenue > 0 },
    { label: 'EBITDA', check: () => deal.ebitda != null },
    { label: 'Location / Geography', check: () => !!(deal.address_state || deal.location) },
    { label: 'Category / Industry', check: () => !!(deal.category || deal.industry) },
    { label: 'Description', check: () => !!(deal.executive_summary || deal.description) },
    { label: 'Main contact name', check: () => !!deal.main_contact_name },
    { label: 'Main contact email', check: () => !!deal.main_contact_email },
    { label: 'Hero description', check: () => !!deal.hero_description },
  ];

  const failedGates = gateFields.filter((g) => !g.check());
  checks.push({
    name: 'Push gate: deal fields (8 checks)',
    status: failedGates.length === 0 ? 'pass' : 'fail',
    detail:
      failedGates.length === 0
        ? 'All 8 required deal fields are present'
        : `Missing: ${failedGates.map((g) => g.label).join(', ')}`,
  });

  // EBITDA range advisory (not enforced by publish-listing gate)
  const ebitdaInRange = typeof deal.ebitda === 'number' && deal.ebitda >= 500000 && deal.ebitda <= 10000000;
  if (!ebitdaInRange && deal.ebitda != null) {
    checks.push({
      name: 'EBITDA range advisory',
      status: 'warn',
      detail: `EBITDA (${deal.ebitda}) is outside typical range ($500K–$10M). Publishing is still allowed.`,
    });
  }

  // 3. Memo PDFs (data_room_documents)
  const { data: memoDocs, error: memoErr } = await supabase
    .from('data_room_documents')
    .select('id, document_category, storage_path')
    .eq('deal_id', dealId)
    .in('document_category', ['full_memo', 'anonymous_teaser']);

  if (memoErr) {
    checks.push({
      name: 'Push gate: memo PDFs',
      status: 'fail',
      detail: `Error querying data_room_documents: ${memoErr.message}`,
    });
  } else {
    const hasLeadMemo = memoDocs?.some(
      (d) => d.document_category === 'full_memo' && d.storage_path,
    );
    const hasTeaser = memoDocs?.some(
      (d) => d.document_category === 'anonymous_teaser' && d.storage_path,
    );
    const missing: string[] = [];
    if (!hasLeadMemo) missing.push('Lead Memo PDF');
    if (!hasTeaser) missing.push('Teaser PDF');

    checks.push({
      name: 'Push gate: memo PDFs',
      status: missing.length === 0 ? 'pass' : 'fail',
      detail:
        missing.length === 0
          ? `Both PDFs found (${memoDocs?.length} doc(s) in data_room_documents)`
          : `Missing: ${missing.join(', ')}. Found ${memoDocs?.length || 0} doc(s).`,
    });
  }

  // 4. Pushed to marketplace?
  checks.push({
    name: 'In marketplace queue',
    status: deal.pushed_to_marketplace ? 'pass' : 'warn',
    detail: deal.pushed_to_marketplace
      ? `Pushed at ${deal.pushed_to_marketplace_at || 'unknown date'}`
      : 'Not yet pushed to marketplace queue',
  });

  // 5. Lead memo drafts (lead_memos table)
  const { data: memos } = await supabase
    .from('lead_memos')
    .select('id, memo_type, status, pdf_storage_path')
    .eq('deal_id', dealId);

  const fullMemoDraft = memos?.find((m) => m.memo_type === 'full_memo');
  const teaserDraft = memos?.find((m) => m.memo_type === 'anonymous_teaser');

  checks.push({
    name: 'Lead memo drafts (AI-generated)',
    status: fullMemoDraft && teaserDraft ? 'pass' : fullMemoDraft || teaserDraft ? 'warn' : 'warn',
    detail: [
      `Full Memo: ${fullMemoDraft ? `${fullMemoDraft.status} (pdf_storage_path: ${fullMemoDraft.pdf_storage_path || 'null'})` : 'not generated'}`,
      `Teaser: ${teaserDraft ? `${teaserDraft.status} (pdf_storage_path: ${teaserDraft.pdf_storage_path || 'null'})` : 'not generated'}`,
    ].join(' | '),
  });

  // 6. Existing marketplace listing check
  const { data: existingListing } = await supabase
    .from('listings')
    .select('id, title, is_internal_deal, published_at, image_url, source_deal_id')
    .eq('source_deal_id', dealId)
    .limit(1)
    .maybeSingle();

  if (existingListing) {
    checks.push({
      name: 'Marketplace listing exists',
      status: 'pass',
      detail: `"${existingListing.title}" (${existingListing.id})`,
    });

    // 7. Listing quality checks
    const qualityIssues: string[] = [];
    if (!existingListing.title || existingListing.title.trim().length < 5)
      qualityIssues.push('Title < 5 chars');
    if (!existingListing.image_url) qualityIssues.push('No image');

    const { data: fullListing } = await supabase
      .from('listings')
      .select('title, description, category, categories, location, revenue, ebitda, image_url')
      .eq('id', existingListing.id)
      .single();

    if (fullListing) {
      if (!fullListing.description || fullListing.description.trim().length < 50)
        qualityIssues.push('Description < 50 chars');
      if (!fullListing.category && (!fullListing.categories || fullListing.categories.length === 0))
        qualityIssues.push('No category');
      if (!fullListing.location) qualityIssues.push('No location');
      if (typeof fullListing.revenue !== 'number' || fullListing.revenue <= 0)
        qualityIssues.push('Revenue missing/zero');
      if (typeof fullListing.ebitda !== 'number') qualityIssues.push('EBITDA missing');
    }

    checks.push({
      name: 'Listing publish-ready (quality)',
      status: qualityIssues.length === 0 ? 'pass' : 'fail',
      detail:
        qualityIssues.length === 0
          ? 'All quality requirements met'
          : `Issues: ${qualityIssues.join(', ')}`,
    });

    // 8. Memo PDFs for the created listing
    const listingDealId = existingListing.source_deal_id || existingListing.id;
    const { data: listingMemoDocs } = await supabase
      .from('data_room_documents')
      .select('document_category, storage_path')
      .eq('deal_id', listingDealId)
      .in('document_category', ['full_memo', 'anonymous_teaser']);

    const listingHasLeadMemo = listingMemoDocs?.some(
      (d) => d.document_category === 'full_memo' && d.storage_path,
    );
    const listingHasTeaser = listingMemoDocs?.some(
      (d) => d.document_category === 'anonymous_teaser' && d.storage_path,
    );
    const pdfMissing: string[] = [];
    if (!listingHasLeadMemo) pdfMissing.push('Lead Memo PDF');
    if (!listingHasTeaser) pdfMissing.push('Teaser PDF');

    checks.push({
      name: 'Listing publish-ready (memo PDFs)',
      status: pdfMissing.length === 0 ? 'pass' : 'fail',
      detail:
        pdfMissing.length === 0
          ? 'Both memo PDFs found for publishing'
          : `Missing: ${pdfMissing.join(', ')}`,
    });

    // 9. Publishing status
    checks.push({
      name: 'Listing published',
      status:
        existingListing.is_internal_deal === false && existingListing.published_at
          ? 'pass'
          : 'warn',
      detail:
        existingListing.is_internal_deal === false && existingListing.published_at
          ? `Published at ${existingListing.published_at}`
          : `Internal draft (is_internal_deal=${existingListing.is_internal_deal})`,
    });

    // 10. Landing page content
    const { data: landingData } = await supabase
      .from('listings')
      .select(
        `hero_description, investment_thesis, custom_sections, services,
         growth_drivers, competitive_position, ownership_structure,
         seller_motivation, business_model, customer_geography,
         customer_types, revenue_model, end_market_description`,
      )
      .eq('id', existingListing.id)
      .single();

    if (landingData) {
      const populated = Object.entries(landingData).filter(
        ([, v]) => v !== null && v !== '' && v !== undefined,
      );
      const total = Object.keys(landingData).length;
      checks.push({
        name: 'Landing page content',
        status: populated.length >= 5 ? 'pass' : populated.length >= 2 ? 'warn' : 'fail',
        detail: `${populated.length}/${total} fields populated: ${populated.map(([k]) => k).join(', ')}`,
      });
    }
  } else {
    checks.push({
      name: 'Marketplace listing exists',
      status: 'warn',
      detail: 'No listing created from this deal yet',
    });
  }

  return {
    dealId,
    dealTitle: (deal.internal_company_name || deal.title || dealId) as string,
    checks,
    ranAt: new Date().toISOString(),
  };
}
