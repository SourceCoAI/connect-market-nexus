/**
 * ListingPipelineTest: In-platform diagnostic for the full listing creation pipeline.
 *
 * Runs live checks against the database to verify every step of:
 *   Deal → Push to Queue → Create Listing → Publish
 *
 * Can target a specific deal ID or pick a random queued deal.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Play,
  RotateCcw,
  Store,
} from 'lucide-react';

// ─── Types ───

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'pending' | 'running';
  detail: string;
  data?: Record<string, unknown>;
}

interface PipelineReport {
  dealId: string;
  dealTitle: string;
  checks: CheckResult[];
  ranAt: string;
}

// ─── Check Functions ───

async function runPipelineChecks(dealId: string): Promise<PipelineReport> {
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
    return {
      dealId,
      dealTitle: 'Unknown',
      checks,
      ranAt: new Date().toISOString(),
    };
  }

  checks.push({
    name: 'Deal exists',
    status: 'pass',
    detail: `${deal.internal_company_name || deal.title || dealId}`,
  });

  // 2. Push-to-marketplace gate checks
  const gateFields: Array<{
    label: string;
    check: () => boolean;
  }> = [
    { label: 'Revenue', check: () => typeof deal.revenue === 'number' && deal.revenue > 0 },
    { label: 'EBITDA', check: () => deal.ebitda != null },
    {
      label: 'Location / Geography',
      check: () => !!(deal.address_state || deal.location),
    },
    {
      label: 'Category / Industry',
      check: () => !!(deal.category || deal.industry),
    },
    {
      label: 'Executive Summary',
      check: () => !!deal.executive_summary,
    },
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

    // 7. Listing quality checks (matches publish-listing validation)
    const qualityIssues: string[] = [];
    if (!existingListing.title || existingListing.title.trim().length < 5)
      qualityIssues.push('Title < 5 chars');
    if (!existingListing.image_url) qualityIssues.push('No image');

    // Fetch full listing data for deeper checks
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

    // 8. Memo PDFs for the created listing (checks source deal docs)
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

// ─── Component ───

export default function ListingPipelineTest() {
  const [dealId, setDealId] = useState('');
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Fetch a few queued deals for quick-pick
  const { data: queuedDeals } = useQuery({
    queryKey: ['pipeline-test-queued-deals'],
    queryFn: async () => {
      const { data } = await supabase
        .from('listings')
        .select('id, internal_company_name, title, pushed_to_marketplace_at')
        .eq('pushed_to_marketplace', true)
        .eq('remarketing_status', 'active')
        .order('pushed_to_marketplace_at', { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const runTest = async (targetDealId?: string) => {
    const id = targetDealId || dealId.trim();
    if (!id) return;
    setIsRunning(true);
    setReport(null);
    try {
      const result = await runPipelineChecks(id);
      setReport(result);
    } finally {
      setIsRunning(false);
    }
  };

  const passCount = report?.checks.filter((c) => c.status === 'pass').length || 0;
  const failCount = report?.checks.filter((c) => c.status === 'fail').length || 0;
  const warnCount = report?.checks.filter((c) => c.status === 'warn').length || 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Store className="h-5 w-5" />
            Listing Pipeline Diagnostic
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Tests the full pipeline: deal data &rarr; push gate &rarr; memo PDFs &rarr; listing
            creation &rarr; quality validation &rarr; publishing readiness.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Manual deal ID input */}
          <div className="flex gap-2">
            <Input
              placeholder="Paste a deal ID..."
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              className="max-w-md font-mono text-sm"
            />
            <Button onClick={() => runTest()} disabled={isRunning || !dealId.trim()}>
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Test
            </Button>
          </div>

          {/* Quick-pick from queued deals */}
          {queuedDeals && queuedDeals.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Quick pick from marketplace queue
              </p>
              <div className="flex flex-wrap gap-2">
                {queuedDeals.map(
                  (d: {
                    id: string;
                    internal_company_name: string | null;
                    title: string | null;
                  }) => (
                    <Button
                      key={d.id}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={isRunning}
                      onClick={() => {
                        setDealId(d.id);
                        runTest(d.id);
                      }}
                    >
                      {d.internal_company_name || d.title || d.id.slice(0, 8)}
                    </Button>
                  ),
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {report && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Results: {report.dealTitle}</CardTitle>
              <div className="flex items-center gap-2">
                {failCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    {failCount} failed
                  </Badge>
                )}
                {warnCount > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-700 border-amber-200 gap-1"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {warnCount} warnings
                  </Badge>
                )}
                {passCount > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-green-50 text-green-700 border-green-200 gap-1"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {passCount} passed
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => runTest(report.dealId)}
                  disabled={isRunning}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Re-run
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Deal ID: {report.dealId} &middot; Ran at {new Date(report.ranAt).toLocaleTimeString()}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.checks.map((check, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    check.status === 'fail'
                      ? 'bg-red-50/50 border-red-200 dark:bg-red-950/10'
                      : check.status === 'warn'
                        ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/10'
                        : check.status === 'pass'
                          ? 'bg-green-50/50 border-green-200 dark:bg-green-950/10'
                          : 'bg-muted/30'
                  }`}
                >
                  <div className="mt-0.5">
                    {check.status === 'pass' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {check.status === 'fail' && <XCircle className="h-4 w-4 text-red-600" />}
                    {check.status === 'warn' && (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    {check.status === 'running' && (
                      <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                    )}
                    {check.status === 'pending' && (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{check.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                      {check.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
