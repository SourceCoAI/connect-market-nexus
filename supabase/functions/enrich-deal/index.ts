/**
 * EDGE FUNCTION: enrich-deal
 *
 * PURPOSE:
 *   Enriches a deal (listing) with data extracted from multiple sources:
 *   transcripts (AI-powered extraction via Gemini), website scraping (via Firecrawl),
 *   LinkedIn profiles, Google reviews, and deal notes analysis. Uses a source-priority
 *   system to merge data without overwriting higher-confidence sources.
 *
 * TRIGGERS:
 *   HTTP POST request (from UI or process-enrichment-queue worker)
 *   Body: { dealId, forceReExtract?, skipExternalEnrichment? }
 *
 * DATABASE TABLES TOUCHED:
 *   READ:  listings, deal_transcripts
 *   WRITE: listings, deal_transcripts, enrichment_events, ai_cost_log
 *
 * EXTERNAL APIS:
 *   Gemini (AI extraction from transcripts and website content)
 *   Firecrawl (website scraping)
 *   LinkedIn enrichment (via sub-module)
 *   Google Reviews enrichment (via sub-module)
 *
 * LAST UPDATED: 2026-02-26
 * AUDIT REF: CTO Audit February 2026
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeStates, mergeStates } from "../_shared/geography.ts";
import { buildPriorityUpdates, updateExtractionSources } from "../_shared/source-priority.ts";
import { GEMINI_API_URL, getGeminiHeaders, DEFAULT_GEMINI_MODEL } from "../_shared/ai-providers.ts";
import { checkProviderAvailability, reportRateLimit } from "../_shared/rate-limiter.ts";
import { logAICallCost } from "../_shared/cost-tracker.ts";
import { logEnrichmentEvent } from "../_shared/enrichment-events.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import {
  // Configuration
  DEAL_AI_TIMEOUT_MS,
  DEAL_MIN_CONTENT_LENGTH,
  DEAL_AI_RETRY_CONFIG,
  // Prompts
  DEAL_SYSTEM_PROMPT,
  buildDealUserPrompt,
  DEAL_TOOL_SCHEMA,
  // Validators
  validateDealExtraction,
  isPlaceholder,
} from "../_shared/deal-extraction.ts";
// Shared enrichment pipeline utilities
import { getErrorMessage } from "../_shared/enrichment/pipeline.ts";
// Sub-modules extracted from this file
import { applyExistingTranscriptData, processNewTranscripts } from "./transcript-processor.ts";
import { resolveWebsiteUrl, validateWebsiteUrl, scrapeWebsite } from "./website-scraper.ts";
import { enrichLinkedIn, enrichGoogleReviews } from "./external-enrichment.ts";

// Financial confidence levels per spec
interface DealTranscriptRow {
  id: string;
  title: string | null;
  transcript_text: string | null;
  processed_at: string | null;
  extracted_data: Record<string, unknown> | null;
  applied_to_deal: boolean;
  source: string | null;
  fireflies_transcript_id: string | null;
  transcript_url: string | null;
}

type FinancialConfidence = 'high' | 'medium' | 'low';

interface ExtractedFinancial {
  value?: number;
  confidence: FinancialConfidence;
  is_inferred?: boolean;
  source_quote?: string;
  inference_method?: string;
}

/**
 * Lightweight AI call to infer industry from deal metadata when website scraping is unavailable.
 */
async function inferIndustryFromContext(
  deal: Record<string, unknown>,
  geminiApiKey: string,
  supabase: ReturnType<typeof createClient>,
  dealId: string,
): Promise<string | null> {
  if (!geminiApiKey) return null;
  if (deal.industry) return deal.industry as string;

  const context = [
    deal.title && `Company: ${deal.title}`,
    deal.internal_company_name && `Internal Name: ${deal.internal_company_name}`,
    deal.executive_summary && `Summary: ${String(deal.executive_summary).substring(0, 300)}`,
    deal.services && `Services: ${String(deal.services).substring(0, 200)}`,
    deal.category && `Category: ${deal.category}`,
    deal.description && `Description: ${String(deal.description).substring(0, 200)}`,
  ].filter(Boolean).join('\n');

  if (!context || context.length < 10) return null;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: getGeminiHeaders(geminiApiKey),
      body: JSON.stringify({
        model: DEFAULT_GEMINI_MODEL,
        messages: [
          { role: 'system', content: 'You classify businesses into concise industry labels. Return ONLY the industry label, nothing else. Be specific but concise (2-4 words). Examples: "HVAC Services", "Commercial Plumbing", "IT Managed Services", "Environmental Remediation", "Healthcare Staffing".' },
          { role: 'user', content: `Classify this business:\n${context}` },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const industry = data.choices?.[0]?.message?.content?.trim();
    if (industry && industry.length > 1 && industry.length < 60) {
      const { error: industryError } = await supabase.from('listings').update({ industry }).eq('id', dealId);
      if (industryError) {
        console.error(`[inferIndustry] Failed to set industry for deal ${dealId}:`, industryError);
      } else {
        console.log(`[inferIndustry] Set industry="${industry}" for deal ${dealId}`);
      }
      return industry;
    }
  } catch (err) {
    console.warn('[inferIndustry] Failed (non-blocking):', err);
  }
  return null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseAnonKey) {
      console.error('SUPABASE_ANON_KEY is not set — internal function calls will fail');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: SUPABASE_ANON_KEY not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { dealId, forceReExtract = false, skipExternalEnrichment = false } = await req.json();

    if (!dealId) {
      return new Response(
        JSON.stringify({ error: 'Missing dealId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!geminiApiKey) {
      console.error('[enrich-deal] GEMINI_API_KEY is not set — transcript extraction will fail');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'GEMINI_API_KEY is not configured. Please add it to Supabase Edge Function secrets.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // FETCH DEAL
    // ========================================================================
    const { data: deal, error: dealError } = await supabase
      .from('listings')
      .select('*, extraction_sources')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return new Response(
        JSON.stringify({ error: 'Deal not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 0: TRANSCRIPT PROCESSING (highest priority source)
    // ========================================================================
    const { data: allTranscripts, error: transcriptsError } = await supabase
      .from('deal_transcripts')
      .select('id, title, transcript_text, processed_at, extracted_data, applied_to_deal, source, fireflies_transcript_id, transcript_url')
      .eq('listing_id', dealId)
      .order('created_at', { ascending: false });

    let transcriptsProcessed = 0;
    let transcriptsAppliedFromExisting = 0;
    const transcriptErrors: string[] = [];
    const transcriptFieldNames: string[] = [];

    const transcriptReport: {
      totalTranscripts: number;
      processable: number;
      skipped: number;
      processed: number;
      appliedFromExisting: number;
      appliedFromExistingTranscripts: number;
      errors: string[];
      processedThisRun?: number;
    } = {
      totalTranscripts: allTranscripts?.length || 0,
      processable: 0,
      skipped: 0,
      processed: 0,
      appliedFromExisting: 0,
      appliedFromExistingTranscripts: 0,
      errors: [],
    };

    if (!transcriptsError && allTranscripts?.length) {
      const sample = allTranscripts.slice(0, 5).map((t: DealTranscriptRow) => ({
        id: t.id,
        processed_at: t.processed_at,
        text_len: t.transcript_text ? t.transcript_text.length : 0,
        has_extracted: !!t.extracted_data,
        applied_to_deal: t.applied_to_deal,
      }));
      console.log(`[Transcripts] fetched=${allTranscripts.length}`, sample);
    }

    // 0A) Apply existing extracted_data from previously-processed transcripts
    if (!transcriptsError && allTranscripts && allTranscripts.length > 0) {
      const transcriptsWithExtracted = allTranscripts.filter((t: DealTranscriptRow) => t.extracted_data && typeof t.extracted_data === 'object');

      if (transcriptsWithExtracted.length > 0) {
        const existingResult = await applyExistingTranscriptData(
          supabase, deal, dealId, transcriptsWithExtracted, forceReExtract,
        );
        transcriptReport.appliedFromExisting = existingResult.appliedFieldCount;
        transcriptReport.appliedFromExistingTranscripts = existingResult.appliedTranscriptCount;
        transcriptFieldNames.push(...existingResult.fieldNames);
        transcriptsAppliedFromExisting = existingResult.appliedTranscriptCount;
      }
    }

    // 0B) Process transcripts that need AI extraction
    let needsExtraction: typeof allTranscripts = [];

    if (!transcriptsError && allTranscripts && allTranscripts.length > 0) {
      if (forceReExtract) {
        console.log(`[Transcripts] forceReExtract=true: Re-processing ALL ${allTranscripts.length} transcripts with new prompts`);
        needsExtraction = allTranscripts;

        const allTranscriptIds = allTranscripts.map((t: DealTranscriptRow) => t.id);
        if (allTranscriptIds.length > 0) {
          console.log(`[Transcripts] Clearing extracted_data for ${allTranscriptIds.length} transcripts`);
          const { error: clearError } = await supabase
            .from('deal_transcripts')
            .update({ processed_at: null, extracted_data: null, applied_to_deal: false })
            .in('id', allTranscriptIds);
          if (clearError) {
            console.error(`[Transcripts] Failed to clear extracted_data:`, clearError);
          }
        }
      } else {
        needsExtraction = allTranscripts.filter((t: DealTranscriptRow) => {
          const hasExtracted = t.extracted_data && typeof t.extracted_data === 'object' && Object.keys(t.extracted_data).length > 0;
          if (hasExtracted) return false;
          return true;
        });
      }
    }

    console.log(`[Transcripts] Total: ${allTranscripts?.length || 0}, Need extraction: ${needsExtraction.length}, Already extracted: ${(allTranscripts?.length || 0) - needsExtraction.length}, forceReExtract: ${forceReExtract}`);

    if (needsExtraction.length > 0) {
      const newResult = await processNewTranscripts(
        supabase, deal, needsExtraction, supabaseUrl, supabaseServiceKey, supabaseAnonKey!,
      );
      transcriptsProcessed = newResult.processed;
      transcriptErrors.push(...newResult.errors);
      transcriptReport.processable = newResult.processable;
      transcriptReport.skipped = newResult.skipped;

      // Capture field names from newly processed transcripts (Bug fix: Step 0B was not
      // reporting field names back to the orchestrator, causing "no new fields" even when
      // extract-deal-transcript applied data to the deal)
      if (newResult.fieldNames?.length > 0) {
        transcriptFieldNames.push(...newResult.fieldNames);
      }

      transcriptReport.processed = transcriptsProcessed + (transcriptReport.appliedFromExistingTranscripts || 0);
      transcriptReport.processedThisRun = transcriptsProcessed;
      transcriptReport.errors = transcriptErrors;
    } else {
      transcriptReport.processed = transcriptReport.appliedFromExistingTranscripts || 0;
      transcriptReport.processedThisRun = 0;
    }

    // Re-fetch deal after transcript processing
    if (transcriptReport.appliedFromExisting > 0 || transcriptsProcessed > 0) {
      const { data: refreshedDeal } = await supabase
        .from('listings')
        .select('*, extraction_sources')
        .eq('id', dealId)
        .single();

      if (refreshedDeal) {
        Object.assign(deal, refreshedDeal);
      }
    }

    // Guardrail: warn if transcripts exist but nothing was extracted
    if (
      transcriptReport.totalTranscripts > 0 &&
      transcriptsProcessed === 0 &&
      transcriptReport.appliedFromExisting === 0
    ) {
      const allHaveExtracted = allTranscripts?.every(
        (t: DealTranscriptRow) => t.extracted_data && typeof t.extracted_data === 'object' && Object.keys(t.extracted_data as Record<string, unknown>).length > 0
      );

      if (allHaveExtracted) {
        console.log('[Transcripts] All transcripts already have extracted_data from prior runs. Continuing to website scraping.');
      } else {
        const reason = needsExtraction.length === 0
          ? 'All transcripts marked as processed but none have extracted_data.'
          : transcriptErrors.length > 0
            ? `All ${transcriptReport.processable} transcript extractions failed: ${transcriptErrors.slice(0, 3).join('; ')}`
            : 'No transcripts had sufficient text content (>= 100 chars)';
        console.warn(`[Transcripts] GUARDRAIL (non-fatal): ${reason}. Falling back to website-only enrichment.`);
      }
    }

    // ========================================================================
    // STEP 0.5: NOTES ANALYSIS (medium priority — between transcripts and website)
    // ========================================================================
    const notesContent = [
      deal.general_notes,
      deal.owner_notes,
      deal.internal_notes,
    ].filter(Boolean).join('\n\n');

    let notesFieldsUpdated: string[] = [];
    if (notesContent.length >= 20) {
      console.log(`[Notes] Analyzing deal notes (${notesContent.length} chars)...`);
      try {
        const notesResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-deal-notes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ dealId, notesText: notesContent }),
          signal: AbortSignal.timeout(120000), // 2 min timeout for notes analysis
        });

        if (notesResponse.ok) {
          const notesResult = await notesResponse.json();
          notesFieldsUpdated = notesResult.fieldsUpdated || [];
          console.log(`[Notes] Analysis complete: ${notesFieldsUpdated.length} fields updated:`, notesFieldsUpdated);
        } else {
          const errText = await notesResponse.text().catch(() => `HTTP ${notesResponse.status}`);
          console.warn(`[Notes] Analysis failed (non-fatal): ${notesResponse.status} - ${errText.substring(0, 200)}`);
        }
      } catch (notesErr) {
        console.warn('[Notes] Analysis error (non-fatal):', getErrorMessage(notesErr));
      }

      // Re-fetch deal after notes analysis to get updated extraction_sources
      // This ensures website enrichment has the latest priority data
      const { data: refreshedDeal, error: refreshErr } = await supabase
        .from('listings')
        .select('*, extraction_sources')
        .eq('id', dealId)
        .single();

      if (!refreshErr && refreshedDeal) {
        Object.assign(deal, refreshedDeal);
      }
    } else {
      console.log('[Notes] No notes content to analyze (skipping)');
    }

    // ========================================================================
    // STEP 1: WEBSITE SCRAPING
    // ========================================================================
    const lockVersion = deal.enriched_at;

    // Resolve website URL using shared helper
    let websiteUrl = resolveWebsiteUrl(deal);

    if (!websiteUrl) {
      await inferIndustryFromContext(deal, geminiApiKey!, supabase, dealId);
      const transcriptFieldsApplied = transcriptReport.appliedFromExisting + transcriptsProcessed;
      const allNonWebFields = [...new Set([...transcriptFieldNames, ...notesFieldsUpdated])];
      if (transcriptFieldsApplied > 0 || notesFieldsUpdated.length > 0) {
        const { error: markEnrichedErr } = await supabase.from('listings').update({ enriched_at: new Date().toISOString() }).eq('id', dealId);
        if (markEnrichedErr) console.error(`[enrich-deal] Failed to mark deal ${dealId} as enriched:`, markEnrichedErr);
        const parts = [];
        if (transcriptFieldsApplied > 0) parts.push(`${transcriptReport.appliedFromExisting} from transcripts`);
        if (notesFieldsUpdated.length > 0) parts.push(`${notesFieldsUpdated.length} from notes`);
        return new Response(
          JSON.stringify({
            success: true,
            message: `Enrichment completed (${parts.join(', ')}). Website scraping skipped: no website URL found.`,
            fieldsUpdated: allNonWebFields,
            transcriptReport,
            notesFieldsUpdated,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { error: markEnrichedErr2 } = await supabase.from('listings').update({ enriched_at: new Date().toISOString() }).eq('id', dealId);
      if (markEnrichedErr2) console.error(`[enrich-deal] Failed to mark deal ${dealId} as enriched:`, markEnrichedErr2);
      return new Response(
        JSON.stringify({ success: true, message: 'No website URL found. Deal marked as enriched with limited data.', fieldsUpdated: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SSRF validation using shared helper
    const urlValidation = validateWebsiteUrl(websiteUrl);
    if (!urlValidation.valid) {
      const transcriptFieldsApplied = transcriptReport.appliedFromExisting + transcriptsProcessed;
      if (transcriptFieldsApplied > 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Transcript enrichment completed (${transcriptReport.appliedFromExisting} fields applied, ${transcriptsProcessed} processed). Website scraping skipped: invalid URL.`,
            fieldsUpdated: transcriptFieldNames,
            transcriptReport,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: `Invalid URL: ${websiteUrl} (${urlValidation.reason || 'blocked by security policy'})` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    websiteUrl = urlValidation.normalizedUrl || websiteUrl;

    console.log(`Enriching deal ${dealId} from website: ${websiteUrl}`);

    if (!firecrawlApiKey) {
      const transcriptFieldsApplied = transcriptReport.appliedFromExisting + transcriptsProcessed;
      if (transcriptFieldsApplied > 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Transcript enrichment completed (${transcriptReport.appliedFromExisting} fields applied). Website scraping skipped: Firecrawl not configured.`,
            fieldsUpdated: transcriptFieldNames,
            transcriptReport,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured. Please enable the Firecrawl connector.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse URL
    try {
      new URL(websiteUrl);
    } catch (urlErr) {
      console.error(`Invalid URL "${websiteUrl}":`, urlErr);
      const transcriptFieldsApplied = transcriptReport.appliedFromExisting + transcriptsProcessed;
      if (transcriptFieldsApplied > 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Transcript enrichment completed (${transcriptReport.appliedFromExisting} fields applied). Website scraping skipped: malformed URL "${websiteUrl}".`,
            fieldsUpdated: transcriptFieldNames,
            transcriptReport,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Invalid website URL: "${websiteUrl}". Please fix the URL on this deal.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scrape website using shared helper
    const { scrapedPages, successfulScrapes, websiteContent } = await scrapeWebsite(websiteUrl, firecrawlApiKey!);

    if (!scrapedPages[0]?.success) {
      console.warn('Failed to scrape homepage — marking as enriched with limited data');
      await inferIndustryFromContext(deal, geminiApiKey!, supabase, dealId);
      const { error: markEnrichedErr3 } = await supabase
        .from('listings')
        .update({ enriched_at: new Date().toISOString() })
        .eq('id', dealId);
      if (markEnrichedErr3) console.error(`[enrich-deal] Failed to mark deal ${dealId} as enriched:`, markEnrichedErr3);
      const transcriptFieldsApplied = transcriptReport.appliedFromExisting + transcriptsProcessed;
      const nonWebFields = [...new Set([...transcriptFieldNames, ...notesFieldsUpdated])];
      return new Response(
        JSON.stringify({
          success: true,
          message: (transcriptFieldsApplied > 0 || notesFieldsUpdated.length > 0)
            ? `Enrichment completed (${transcriptFieldsApplied} from transcripts, ${notesFieldsUpdated.length} from notes). Website scraping failed: could not reach homepage.`
            : 'Website could not be scraped (site may be down or blocking). Deal marked as enriched with limited data.',
          fieldsUpdated: nonWebFields,
          transcriptReport,
          notesFieldsUpdated,
          warning: 'website_scrape_failed',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scrapedPagesSummary = scrapedPages.map(p => ({
      url: p.url,
      success: p.success,
      chars: p.content.length
    }));

    if (!websiteContent || websiteContent.length < DEAL_MIN_CONTENT_LENGTH) {
      console.log(`Insufficient website content scraped: ${websiteContent.length} chars (need ${DEAL_MIN_CONTENT_LENGTH}+)`);
      const transcriptFieldsApplied = transcriptReport.appliedFromExisting + transcriptsProcessed;
      if (transcriptFieldsApplied > 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Transcript enrichment completed (${transcriptReport.appliedFromExisting} fields applied). Website scraping skipped: insufficient content (${websiteContent.length} chars).`,
            fieldsUpdated: transcriptFieldNames,
            transcriptReport,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: `Could not extract sufficient content from website (${websiteContent.length} chars, need ${DEAL_MIN_CONTENT_LENGTH}+)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Scraped ${websiteContent.length} characters from website`);

    if (!geminiApiKey) {
      console.log('No AI key configured, using basic extraction');
      const updates: Record<string, unknown> = {
        enriched_at: new Date().toISOString(),
      };
      if (!deal.executive_summary && websiteContent.length > 200) {
        updates.executive_summary = websiteContent.substring(0, 500).trim() + '...';
      }

      const { error: updateError } = await supabase
        .from('listings')
        .update(updates)
        .eq('id', dealId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Basic enrichment completed (AI not configured)',
          fieldsUpdated: Object.keys(updates).filter(k => k !== 'enriched_at'),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 2: AI EXTRACTION
    // ========================================================================
    console.log('Extracting deal intelligence with AI...');

    const userPrompt = buildDealUserPrompt(deal.title, websiteContent);

    const MAX_AI_RETRIES = DEAL_AI_RETRY_CONFIG.maxRetries;
    const AI_RETRY_DELAYS = DEAL_AI_RETRY_CONFIG.delays;

    let aiResponse: Response | null = null;
    let lastAiError = '';

    for (let attempt = 0; attempt < MAX_AI_RETRIES; attempt++) {
      try {
        const availability = await checkProviderAvailability(supabase, 'gemini');
        if (!availability.ok && availability.retryAfterMs) {
          const waitMs = Math.min(availability.retryAfterMs, 30000);
          console.log(`[enrich-deal] Gemini in cooldown, waiting ${waitMs}ms before attempt ${attempt + 1}`);
          await new Promise(r => setTimeout(r, waitMs));
        }

        aiResponse = await fetch(GEMINI_API_URL, {
          method: 'POST',
          headers: getGeminiHeaders(geminiApiKey),
          body: JSON.stringify({
            model: DEFAULT_GEMINI_MODEL,
            messages: [
              { role: 'system', content: DEAL_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt }
            ],
            tools: [DEAL_TOOL_SCHEMA],
            tool_choice: { type: 'function', function: { name: 'extract_deal_intelligence' } }
          }),
          signal: AbortSignal.timeout(DEAL_AI_TIMEOUT_MS),
        });

        if (aiResponse.status === 429) {
          const retryAfterHeader = aiResponse.headers.get('Retry-After');
          let retryAfterSeconds: number | undefined;
          if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsed)) retryAfterSeconds = parsed;
          }
          await reportRateLimit(supabase, 'gemini', retryAfterSeconds).catch((err: unknown) => { console.warn('[enrich-deal] Rate limit report failed:', err); });

          const waitMs = retryAfterSeconds ? retryAfterSeconds * 1000 : AI_RETRY_DELAYS[attempt];
          const jitter = Math.random() * 1000;
          console.log(`AI rate limited (429), waiting ${Math.round(waitMs + jitter)}ms (attempt ${attempt + 1}/${MAX_AI_RETRIES})`);
          await new Promise(r => setTimeout(r, waitMs + jitter));
          continue;
        }

        if (aiResponse.ok) break;

        if (aiResponse.status >= 500 || aiResponse.status === 529) {
          lastAiError = await aiResponse.text().catch(() => `HTTP ${aiResponse!.status}`);
          if (attempt < MAX_AI_RETRIES - 1) {
            const waitMs = AI_RETRY_DELAYS[attempt];
            console.warn(`AI server error (${aiResponse.status}), retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_AI_RETRIES})`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          console.error(`AI server error (${aiResponse.status}) after ${MAX_AI_RETRIES} attempts:`, lastAiError);
          break;
        }

        lastAiError = await aiResponse.text();
        console.error(`AI non-retryable error (${aiResponse.status}):`, lastAiError);
        break;

      } catch (err) {
        lastAiError = getErrorMessage(err);
        console.error(`AI call exception (attempt ${attempt + 1}):`, lastAiError);
        if (attempt < MAX_AI_RETRIES - 1) {
          await new Promise(r => setTimeout(r, AI_RETRY_DELAYS[attempt]));
        }
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      const errorDetail = lastAiError || 'No response from AI provider';
      console.error('AI extraction failed after retries:', errorDetail);
      return new Response(
        JSON.stringify({
          success: false,
          error: `AI extraction failed: ${errorDetail.substring(0, 300)}`,
          retries: MAX_AI_RETRIES,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response:', JSON.stringify(aiData, null, 2));

    // Cost tracking (non-blocking)
    const geminiUsage = aiData.usage;
    if (geminiUsage) {
      logAICallCost(supabase, 'enrich-deal', 'gemini', DEFAULT_GEMINI_MODEL,
        { inputTokens: geminiUsage.prompt_tokens || 0, outputTokens: geminiUsage.completion_tokens || 0 },
        undefined, { dealId }
      ).catch((err: unknown) => { console.warn('[enrich-deal] Cost tracking failed:', err); });
    }

    // Parse tool call results
    let extracted: Record<string, unknown> = {};
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error('Failed to parse tool arguments:', e);
      }
    }

    console.log('Extracted data:', extracted);

    // ========================================================================
    // STEP 3: VALIDATE + CLEAN EXTRACTED DATA
    // ========================================================================

    // Run all validators (strips financials, cleans addresses, validates LinkedIn, etc.)
    validateDealExtraction(extracted, websiteContent);

    // Protect manually-set internal_company_name from AI overwrite
    if (deal.internal_company_name && extracted.internal_company_name) {
      console.log(`[Enrichment] Preserving existing internal_company_name "${deal.internal_company_name}" (AI suggested: "${extracted.internal_company_name}")`);
      delete extracted.internal_company_name;
    }

    // Normalize geographic_states using shared module
    if (extracted.geographic_states) {
      extracted.geographic_states = normalizeStates(extracted.geographic_states as string[]);
    }

    // ========================================================================
    // STEP 4: EXTERNAL ENRICHMENT (LinkedIn + Google Reviews)
    // ========================================================================
    if (!skipExternalEnrichment) {
      await enrichLinkedIn(supabaseUrl, supabaseAnonKey!, supabaseServiceKey, dealId, extracted, deal, websiteUrl);
      await enrichGoogleReviews(supabaseUrl, supabaseAnonKey!, supabaseServiceKey, dealId, extracted, deal);
    } else {
      console.log('[enrich-deal] Skipping LinkedIn/Google (handled by pipeline)');
    }

    // ========================================================================
    // STEP 5: WRITE TO DATABASE
    // ========================================================================
    const { updates, sourceUpdates } = buildPriorityUpdates(
      deal,
      deal.extraction_sources,
      extracted,
      'website',
      undefined,       // no transcriptId for website source
      isPlaceholder    // treat "Not discussed on this call." etc. as empty
    );

    const finalUpdates: Record<string, unknown> = {
      ...updates,
      enriched_at: new Date().toISOString(),
      extraction_sources: updateExtractionSources(deal.extraction_sources, sourceUpdates),
    };

    if (updates.geographic_states && deal.geographic_states?.length > 0) {
      finalUpdates.geographic_states = mergeStates(
        deal.geographic_states,
        updates.geographic_states as string[]
      );
    }

    let updateQuery = supabase
      .from('listings')
      .update(finalUpdates)
      .eq('id', dealId);

    if (lockVersion) {
      updateQuery = updateQuery.eq('enriched_at', lockVersion);
    } else {
      updateQuery = updateQuery.is('enriched_at', null);
    }

    const { data: updateResult, error: updateError } = await updateQuery.select('id');

    if (updateError) {
      console.error('Error updating listing:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: getErrorMessage(updateError),
          error_code: (updateError as { code?: string })?.code,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!updateResult || updateResult.length === 0) {
      console.warn(`Optimistic lock conflict for deal ${dealId} - record was modified by another process`);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Deal was already enriched by another process (concurrent modification).',
          fieldsUpdated: [],
          error_code: 'concurrent_modification',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const websiteFieldsUpdated = Object.keys(updates);

    // Fallback industry inference
    if (!updates.industry && !deal.industry) {
      try {
        const inferred = await inferIndustryFromContext(
          { ...deal, ...updates },
          geminiApiKey!,
          supabase,
          dealId
        );
        if (inferred) {
          websiteFieldsUpdated.push('industry');
          console.log(`[enrich-deal] Industry inferred as fallback: "${inferred}"`);
        }
      } catch (err) {
        console.warn('[enrich-deal] Industry inference fallback failed (non-blocking):', err);
      }
    }

    const allFieldsUpdated = [...new Set([...transcriptFieldNames, ...notesFieldsUpdated, ...websiteFieldsUpdated])];
    const sourceParts = [];
    if (transcriptFieldNames.length > 0) sourceParts.push(`${transcriptFieldNames.length} from transcripts`);
    if (notesFieldsUpdated.length > 0) sourceParts.push(`${notesFieldsUpdated.length} from notes`);
    sourceParts.push(`${websiteFieldsUpdated.length} from website`);
    console.log(`Updated ${allFieldsUpdated.length} fields (${sourceParts.join(', ')}):`, allFieldsUpdated);

    // Observability: log enrichment outcome (non-blocking)
    logEnrichmentEvent(supabase, {
      entityType: 'deal', entityId: dealId, provider: 'gemini',
      functionName: 'enrich-deal', status: 'success',
      fieldsUpdated: allFieldsUpdated.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully enriched deal with ${allFieldsUpdated.length} fields (${sourceParts.join(', ')})`,
        fieldsUpdated: allFieldsUpdated,
        extracted,
        scrapeReport: {
          totalPagesAttempted: scrapedPages.length,
          successfulPages: successfulScrapes.length,
          totalCharactersScraped: websiteContent.length,
          pages: scrapedPagesSummary,
        },
        transcriptReport,
        notesFieldsUpdated,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enrich-deal:', error);
    const message = getErrorMessage(error);

    // Observability: log enrichment failure (non-blocking)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseServiceKey) {
        const errorSupabase = createClient(supabaseUrl, supabaseServiceKey);
        const status = message.includes('429') || message.includes('rate') ? 'rate_limited'
          : message.includes('timeout') || message.includes('abort') ? 'timeout'
          : 'failure';
        logEnrichmentEvent(errorSupabase, {
          entityType: 'deal', entityId: 'unknown', provider: 'gemini',
          functionName: 'enrich-deal', status, errorMessage: message,
        });
      }
    } catch { /* swallow — don't let logging break the error response */ }

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
