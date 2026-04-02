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
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeStates, mergeStates } from '../_shared/geography.ts';
import { buildPriorityUpdates, updateExtractionSources } from '../_shared/source-priority.ts';
import {
  GEMINI_API_URL,
  getGeminiHeaders,
  DEFAULT_GEMINI_MODEL,
  getGeminiApiKey,
} from '../_shared/ai-providers.ts';
import { checkProviderAvailability, reportRateLimit } from '../_shared/rate-limiter.ts';
import { logAICallCost } from '../_shared/cost-tracker.ts';
import { logEnrichmentEvent } from '../_shared/enrichment-events.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
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
} from '../_shared/deal-extraction.ts';
// Shared enrichment pipeline utilities
import { getErrorMessage } from '../_shared/enrichment/pipeline.ts';
import {
  isExtractableType,
  extractAndStoreDocumentText,
} from '../_shared/document-text-extractor.ts';
// Sub-modules extracted from this file
import { applyExistingTranscriptData, processNewTranscripts } from './transcript-processor.ts';
import { resolveWebsiteUrl, validateWebsiteUrl, scrapeWebsite } from './website-scraper.ts';
import { enrichLinkedIn, enrichGoogleReviews } from './external-enrichment.ts';

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
  phoneburner_call_id: string | null;
  contact_activity_id: string | null;
  recording_url: string | null;
  transcript_url: string | null;
}

type FinancialConfidence = 'high' | 'medium' | 'low';

interface _ExtractedFinancial {
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
  ]
    .filter(Boolean)
    .join('\n');

  if (!context || context.length < 10) return null;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: getGeminiHeaders(geminiApiKey),
      body: JSON.stringify({
        model: DEFAULT_GEMINI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You classify businesses into concise industry labels. Return ONLY the industry label, nothing else. Be specific but concise (2-4 words). Examples: "HVAC Services", "Commercial Plumbing", "IT Managed Services", "Environmental Remediation", "Healthcare Staffing".',
          },
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
      const { error: industryError } = await supabase
        .from('listings')
        .update({ industry })
        .eq('id', dealId);
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
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const geminiApiKey = getGeminiApiKey();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let parsedBody: Record<string, unknown>;
    try {
      parsedBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { dealId, forceReExtract = false, skipExternalEnrichment = false } = parsedBody;

    // Timeout budget: Deno edge functions have a ~150s hard limit.
    // Track a deadline so we can skip optional steps if running low.
    const FUNCTION_TIMEOUT_MS = 140_000; // 140s budget (10s safety margin)
    const functionStart = Date.now();
    const hasTimeBudget = (requiredMs: number) =>
      Date.now() - functionStart + requiredMs < FUNCTION_TIMEOUT_MS;

    if (!dealId) {
      return new Response(JSON.stringify({ error: 'Missing dealId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!geminiApiKey) {
      console.error('[enrich-deal] GEMINI_API_KEY is not set — transcript extraction will fail');
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'GEMINI_API_KEY is not configured. Please add it to Supabase Edge Function secrets.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
      return new Response(JSON.stringify({ error: 'Deal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // STEP 0: TRANSCRIPT PROCESSING (highest priority source)
    // ========================================================================
    const { data: allTranscripts, error: transcriptsError } = await supabase
      .from('deal_transcripts')
      .select(
        'id, title, transcript_text, processed_at, extracted_data, applied_to_deal, source, fireflies_transcript_id, transcript_url',
      )
      .eq('listing_id', dealId)
      .order('created_at', { ascending: false });

    let transcriptsProcessed = 0;
    let _transcriptsAppliedFromExisting = 0;
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
      const transcriptsWithExtracted = allTranscripts.filter(
        (t: DealTranscriptRow) => t.extracted_data && typeof t.extracted_data === 'object',
      );

      if (transcriptsWithExtracted.length > 0) {
        const existingResult = await applyExistingTranscriptData(
          supabase,
          deal,
          dealId,
          transcriptsWithExtracted,
          forceReExtract,
        );
        transcriptReport.appliedFromExisting = existingResult.appliedFieldCount;
        transcriptReport.appliedFromExistingTranscripts = existingResult.appliedTranscriptCount;
        transcriptFieldNames.push(...existingResult.fieldNames);
        _transcriptsAppliedFromExisting = existingResult.appliedTranscriptCount;
      }
    }

    // 0B) Process transcripts that need AI extraction
    let needsExtraction: typeof allTranscripts = [];

    if (!transcriptsError && allTranscripts && allTranscripts.length > 0) {
      if (forceReExtract) {
        console.log(
          `[Transcripts] forceReExtract=true: Re-processing ALL ${allTranscripts.length} transcripts with new prompts`,
        );
        needsExtraction = allTranscripts;

        const allTranscriptIds = allTranscripts.map((t: DealTranscriptRow) => t.id);
        if (allTranscriptIds.length > 0) {
          console.log(
            `[Transcripts] Clearing extracted_data for ${allTranscriptIds.length} transcripts`,
          );
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
          const hasExtracted =
            t.extracted_data &&
            typeof t.extracted_data === 'object' &&
            Object.keys(t.extracted_data).length > 0;
          if (hasExtracted) return false;
          return true;
        });
      }
    }

    console.log(
      `[Transcripts] Total: ${allTranscripts?.length || 0}, Need extraction: ${needsExtraction.length}, Already extracted: ${(allTranscripts?.length || 0) - needsExtraction.length}, forceReExtract: ${forceReExtract}`,
    );

    if (needsExtraction.length > 0) {
      const newResult = await processNewTranscripts(
        supabase,
        deal,
        needsExtraction,
        supabaseUrl,
        supabaseServiceKey,
        supabaseAnonKey!,
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

      transcriptReport.processed =
        transcriptsProcessed + (transcriptReport.appliedFromExistingTranscripts || 0);
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
        (t: DealTranscriptRow) =>
          t.extracted_data &&
          typeof t.extracted_data === 'object' &&
          Object.keys(t.extracted_data as Record<string, unknown>).length > 0,
      );

      if (allHaveExtracted) {
        console.log(
          '[Transcripts] All transcripts already have extracted_data from prior runs. Continuing to website scraping.',
        );
      } else {
        const reason =
          needsExtraction.length === 0
            ? 'All transcripts marked as processed but none have extracted_data.'
            : transcriptErrors.length > 0
              ? `All ${transcriptReport.processable} transcript extractions failed: ${transcriptErrors.slice(0, 3).join('; ')}`
              : 'No transcripts had sufficient text content (>= 100 chars)';
        console.warn(
          `[Transcripts] GUARDRAIL (non-fatal): ${reason}. Falling back to website-only enrichment.`,
        );
      }
    }

    // ========================================================================
    // STEP 0.5: NOTES ANALYSIS (medium priority — between transcripts and website)
    // ========================================================================
    const notesContent = [
      deal.general_notes,
      deal.owner_notes,
      deal.internal_notes,
      deal.owner_response,
      deal.captarget_call_notes,
      deal.description,
    ]
      .filter(Boolean)
      .join('\n\n');

    let notesFieldsUpdated: string[] = [];
    let notesStatus: 'analyzed' | 'skipped_empty' | 'skipped_timeout' | 'failed' = 'skipped_empty';
    let notesError: string | undefined;
    if (notesContent.length < 20) {
      notesStatus = 'skipped_empty';
      console.log('[Notes] No notes content to analyze (skipping)');
    } else if (!hasTimeBudget(65_000)) {
      notesStatus = 'skipped_timeout';
      console.log('[Notes] Skipping notes analysis — insufficient time budget remaining');
    } else {
      console.log(`[Notes] Analyzing deal notes (${notesContent.length} chars)...`);
      try {
        const notesResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-deal-notes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey!,
            Authorization: `Bearer ${supabaseServiceKey}`,
            'x-internal-secret': supabaseServiceKey,
          },
          body: JSON.stringify({ dealId, notesText: notesContent }),
          signal: AbortSignal.timeout(60000), // 60s timeout — Gemini calls can take 15-30s
        });

        if (notesResponse.ok) {
          const notesResult = await notesResponse.json();
          notesFieldsUpdated = notesResult.fieldsUpdated || [];
          notesStatus = 'analyzed';
          console.log(
            `[Notes] Analysis complete: ${notesFieldsUpdated.length} fields updated:`,
            notesFieldsUpdated,
          );
        } else {
          const errText = await notesResponse.text().catch(() => `HTTP ${notesResponse.status}`);
          notesStatus = 'failed';
          notesError = `HTTP ${notesResponse.status}: ${errText.substring(0, 100)}`;
          console.warn(
            `[Notes] Analysis failed (non-fatal): ${notesResponse.status} - ${errText.substring(0, 200)}`,
          );
        }
      } catch (notesErr) {
        notesStatus = 'failed';
        notesError = getErrorMessage(notesErr);
        console.warn('[Notes] Analysis error (non-fatal):', notesError);
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
    }

    // ========================================================================
    // STEP 0.75: DATA ROOM DOCUMENTS (high priority — due diligence material)
    // ========================================================================
    let dataRoomContent = '';
    let dataRoomDocsProcessed = 0;
    let dataRoomStatus: 'extracted' | 'skipped_empty' | 'skipped_timeout' | 'failed' =
      'skipped_empty';

    if (hasTimeBudget(70_000)) {
      // Fetch data room documents with text content
      const { data: dataRoomDocs, error: drError } = await supabase
        .from('data_room_documents')
        .select('id, file_name, file_type, storage_path, text_content, text_extracted_at')
        .eq('deal_id', dealId)
        .eq('document_category', 'data_room')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (drError) {
        console.warn('[DataRoom] Failed to fetch documents (non-fatal):', drError);
        dataRoomStatus = 'failed';
      } else if (dataRoomDocs && dataRoomDocs.length > 0) {
        console.log(`[DataRoom] Found ${dataRoomDocs.length} data room documents`);

        // Process documents that need text extraction first
        for (const doc of dataRoomDocs) {
          if (
            !doc.text_content &&
            doc.file_type &&
            isExtractableType(doc.file_type) &&
            geminiApiKey &&
            hasTimeBudget(65_000)
          ) {
            console.log(`[DataRoom] Extracting text from ${doc.file_name}...`);
            await extractAndStoreDocumentText(
              supabase,
              doc.id,
              doc.storage_path,
              doc.file_type,
              geminiApiKey,
            );
            // Re-fetch the text content after extraction
            const { data: refreshedDoc } = await supabase
              .from('data_room_documents')
              .select('text_content')
              .eq('id', doc.id)
              .single();
            if (refreshedDoc?.text_content) {
              doc.text_content = refreshedDoc.text_content;
            }
          }
        }

        // Collect text content from all documents
        const textParts: string[] = [];
        for (const doc of dataRoomDocs) {
          if (doc.text_content) {
            // Cap each document at 25K chars to stay within token limits
            const content = doc.text_content.substring(0, 25_000);
            textParts.push(`--- Document: ${doc.file_name} ---\n${content}`);
            dataRoomDocsProcessed++;
          }
        }

        if (textParts.length > 0) {
          dataRoomContent = textParts.join('\n\n');
          dataRoomStatus = 'extracted';
          console.log(
            `[DataRoom] Collected text from ${dataRoomDocsProcessed} documents (${dataRoomContent.length} chars)`,
          );
        } else {
          console.log('[DataRoom] No text content available from data room documents');
        }
      } else {
        console.log('[DataRoom] No data room documents found');
      }
    } else {
      dataRoomStatus = 'skipped_timeout';
      console.log('[DataRoom] Skipping data room extraction — insufficient time budget');
    }

    // ========================================================================
    // STEP 1: WEBSITE SCRAPING
    // ========================================================================
    const lockVersion = deal.enriched_at;

    // Track website scraping state — website may fail but data room content
    // can still power AI extraction, so we don't early-return when we have it.
    let websiteContent = '';
    let websiteUrl = resolveWebsiteUrl(deal);
    let websiteSkipReason = '';
    let scrapedPages: { url: string; success: boolean; content: string }[] = [];
    let successfulScrapes: typeof scrapedPages = [];

    if (!websiteUrl) {
      websiteSkipReason = 'no website URL found';
      console.log('[Website] No website URL found — skipping scrape');
    } else {
      const urlValidation = validateWebsiteUrl(websiteUrl);
      if (!urlValidation.valid) {
        websiteSkipReason = `invalid URL (${urlValidation.reason || 'blocked by security policy'})`;
        console.log(`[Website] ${websiteSkipReason}`);
      } else {
        websiteUrl = urlValidation.normalizedUrl || websiteUrl;

        if (!firecrawlApiKey) {
          websiteSkipReason = 'Firecrawl not configured';
          console.log('[Website] Firecrawl not configured — skipping scrape');
        } else {
          try {
            new URL(websiteUrl);
          } catch {
            websiteSkipReason = `malformed URL "${websiteUrl}"`;
            console.log(`[Website] ${websiteSkipReason}`);
          }

          if (!websiteSkipReason) {
            console.log(`Enriching deal ${dealId} from website: ${websiteUrl}`);
            const scrapeResult = await scrapeWebsite(websiteUrl, firecrawlApiKey!);
            scrapedPages = scrapeResult.scrapedPages;
            successfulScrapes = scrapeResult.successfulScrapes;
            websiteContent = scrapeResult.websiteContent;

            if (!scrapedPages[0]?.success) {
              websiteSkipReason = 'could not reach homepage';
              websiteContent = '';
              console.warn('[Website] Failed to scrape homepage');
            } else if (!websiteContent || websiteContent.length < DEAL_MIN_CONTENT_LENGTH) {
              websiteSkipReason = `insufficient content (${websiteContent.length} chars, need ${DEAL_MIN_CONTENT_LENGTH}+)`;
              websiteContent = '';
              console.log(`[Website] ${websiteSkipReason}`);
            } else {
              console.log(`[Website] Scraped ${websiteContent.length} characters`);
            }
          }
        }
      }
    }

    // Determine if we have ANY content for AI extraction
    const hasWebsiteContent = websiteContent.length > 0;
    const hasDataRoomContent = dataRoomContent.length > 0;
    const hasAnyContentForAI = hasWebsiteContent || hasDataRoomContent;

    // If no content for AI extraction and no other enrichment happened, return early
    if (!hasAnyContentForAI) {
      await inferIndustryFromContext(deal, geminiApiKey!, supabase, dealId);
      const transcriptFieldsApplied = transcriptReport.appliedFromExisting + transcriptsProcessed;
      const allNonWebFields = [...new Set([...transcriptFieldNames, ...notesFieldsUpdated])];
      const hasOtherData = transcriptFieldsApplied > 0 || notesFieldsUpdated.length > 0;

      const { error: markEnrichedErr } = await supabase
        .from('listings')
        .update({ enriched_at: new Date().toISOString() })
        .eq('id', dealId);
      if (markEnrichedErr)
        console.error(`[enrich-deal] Failed to mark deal ${dealId} as enriched:`, markEnrichedErr);

      if (hasOtherData) {
        const parts = [];
        if (transcriptFieldsApplied > 0)
          parts.push(`${transcriptReport.appliedFromExisting} from transcripts`);
        if (notesFieldsUpdated.length > 0) parts.push(`${notesFieldsUpdated.length} from notes`);
        return new Response(
          JSON.stringify({
            success: true,
            message: `Enrichment completed (${parts.join(', ')}). Website scraping skipped: ${websiteSkipReason || 'unavailable'}. No data room documents.`,
            fieldsUpdated: allNonWebFields,
            transcriptReport,
            notesFieldsUpdated,
            dataRoomReport: {
              status: dataRoomStatus,
              documentsProcessed: dataRoomDocsProcessed,
              contentLength: 0,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `No content available for AI extraction. Website: ${websiteSkipReason || 'unavailable'}. No data room documents. Deal marked as enriched with limited data.`,
          fieldsUpdated: [],
          dataRoomReport: { status: dataRoomStatus, documentsProcessed: 0, contentLength: 0 },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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
          fieldsUpdated: Object.keys(updates).filter((k) => k !== 'enriched_at'),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ========================================================================
    // STEP 2: AI EXTRACTION
    // ========================================================================
    console.log('Extracting deal intelligence with AI...');

    // Build the AI prompt based on available content sources.
    // Data room documents are authoritative (CIMs, financials, legal docs) and
    // should allow financial extraction. Website content blocks financial extraction
    // per policy. We build separate sections so the AI can distinguish.
    let userPrompt: string;
    if (hasWebsiteContent && hasDataRoomContent) {
      // Both sources available — use website prompt but add data room as separate section
      // with explicit override allowing financial extraction from data room docs
      userPrompt = buildDealUserPrompt(deal.title, websiteContent);
      userPrompt += `\n\n=== DATA ROOM DOCUMENTS (AUTHORITATIVE — higher priority than website) ===
The following text was extracted from documents uploaded to the deal data room (CIMs, financials, legal docs, etc.).
IMPORTANT: Unlike website content, you SHOULD extract financial information (revenue, EBITDA, margins, etc.) from data room documents. These are authoritative due diligence materials.

${dataRoomContent.substring(0, 50000)}`;
    } else if (hasDataRoomContent) {
      // Data room only — use a custom prompt that allows financial extraction
      userPrompt = `Analyze the following data room documents from "${deal.title || 'Unknown Company'}" and extract DEEP business intelligence. This data drives M&A buyer matching — every detail matters.

These are authoritative due diligence documents (CIMs, financials, legal docs, etc.) uploaded by an admin. Extract ALL available information including:
- Company identity, location, industry
- Financial information (revenue, EBITDA, margins, etc.) — these documents ARE authoritative for financials
- Services, operations, customer types
- Management, staffing, ownership structure
- Growth trajectory, competitive position

DEPTH REQUIREMENTS:
- Executive summary: Write 5-8 rich sentences a PE investor can scan in 60 seconds.
- Service mix: Describe the full service portfolio with context.
- Customer types: Be specific about segments.
- Key quotes: Extract up to 10 verbatim quotes.

LOCATION COUNT RULES:
- Count ALL physical locations: offices, branches, shops, stores, facilities
- Single location business = 1

Data Room Documents:
${dataRoomContent.substring(0, 50000)}

Extract all available business information using the provided tool. Be EXHAUSTIVE — capture every detail.`;
    } else {
      // Website only (original behavior)
      userPrompt = buildDealUserPrompt(deal.title, websiteContent);
    }

    const MAX_AI_RETRIES = DEAL_AI_RETRY_CONFIG.maxRetries;
    const AI_RETRY_DELAYS = DEAL_AI_RETRY_CONFIG.delays;

    let aiResponse: Response | null = null;
    let lastAiError = '';

    for (let attempt = 0; attempt < MAX_AI_RETRIES; attempt++) {
      try {
        const availability = await checkProviderAvailability(supabase, 'gemini');
        if (!availability.ok && availability.retryAfterMs) {
          const waitMs = Math.min(availability.retryAfterMs, 30000);
          console.log(
            `[enrich-deal] Gemini in cooldown, waiting ${waitMs}ms before attempt ${attempt + 1}`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
        }

        aiResponse = await fetch(GEMINI_API_URL, {
          method: 'POST',
          headers: getGeminiHeaders(geminiApiKey),
          body: JSON.stringify({
            model: DEFAULT_GEMINI_MODEL,
            messages: [
              { role: 'system', content: DEAL_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            tools: [DEAL_TOOL_SCHEMA],
            tool_choice: { type: 'function', function: { name: 'extract_deal_intelligence' } },
          }),
          signal: AbortSignal.timeout(DEAL_AI_TIMEOUT_MS),
        });

        if (aiResponse.status === 429) {
          lastAiError = `Rate limited by Gemini (429) after ${attempt + 1} attempts`;
          const retryAfterHeader = aiResponse.headers.get('Retry-After');
          let retryAfterSeconds: number | undefined;
          if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsed)) retryAfterSeconds = parsed;
          }
          await reportRateLimit(supabase, 'gemini', retryAfterSeconds).catch((err: unknown) => {
            console.warn('[enrich-deal] Rate limit report failed:', err);
          });

          const waitMs = retryAfterSeconds ? retryAfterSeconds * 1000 : AI_RETRY_DELAYS[attempt];
          const jitter = Math.random() * 1000;
          console.log(
            `AI rate limited (429), waiting ${Math.round(waitMs + jitter)}ms (attempt ${attempt + 1}/${MAX_AI_RETRIES})`,
          );
          await new Promise((r) => setTimeout(r, waitMs + jitter));
          continue;
        }

        if (aiResponse.ok) break;

        if (aiResponse.status >= 500 || aiResponse.status === 529) {
          lastAiError = await aiResponse.text().catch(() => `HTTP ${aiResponse!.status}`);
          if (attempt < MAX_AI_RETRIES - 1) {
            const waitMs = AI_RETRY_DELAYS[attempt];
            console.warn(
              `AI server error (${aiResponse.status}), retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_AI_RETRIES})`,
            );
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          console.error(
            `AI server error (${aiResponse.status}) after ${MAX_AI_RETRIES} attempts:`,
            lastAiError,
          );
          break;
        }

        lastAiError = await aiResponse.text();
        console.error(`AI non-retryable error (${aiResponse.status}):`, lastAiError);
        break;
      } catch (err) {
        lastAiError = getErrorMessage(err);
        console.error(`AI call exception (attempt ${attempt + 1}):`, lastAiError);
        // Treat timeouts as a rate-limit signal so concurrent items back off
        if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
          await reportRateLimit(supabase, 'gemini', 15).catch((rlErr: unknown) => {
            console.warn('[enrich-deal] Timeout rate limit report failed:', rlErr);
          });
        }
        if (attempt < MAX_AI_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, AI_RETRY_DELAYS[attempt]));
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
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response:', JSON.stringify(aiData, null, 2));

    // Cost tracking (non-blocking)
    const geminiUsage = aiData.usage;
    if (geminiUsage) {
      logAICallCost(
        supabase,
        'enrich-deal',
        'gemini',
        DEFAULT_GEMINI_MODEL,
        {
          inputTokens: geminiUsage.prompt_tokens || 0,
          outputTokens: geminiUsage.completion_tokens || 0,
        },
        undefined,
        { dealId },
      ).catch((err: unknown) => {
        console.warn('[enrich-deal] Cost tracking failed:', err);
      });
    }

    // Parse tool call results
    let extracted: Record<string, unknown> = {};
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      try {
        extracted = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error('Failed to parse tool arguments:', e);
        // Mark the deal with a timestamp so it doesn't appear un-enriched,
        // but don't silently proceed with empty data.
        await supabase
          .from('listings')
          .update({ enriched_at: new Date().toISOString() })
          .eq('id', dealId);
        return new Response(JSON.stringify({ error: 'AI returned invalid JSON', dealId }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('Extracted data:', extracted);

    // ========================================================================
    // STEP 3: VALIDATE + CLEAN EXTRACTED DATA
    // ========================================================================

    // Run all validators (strips financials, cleans addresses, validates LinkedIn, etc.)
    // When data room content is present, financial data is legitimate (CIMs, tax returns)
    // so skip the financial field stripping that protects against website-scraped financials.
    validateDealExtraction(extracted, websiteContent, { skipFinancialStrip: hasDataRoomContent });

    // Protect manually-set internal_company_name from AI overwrite
    if (deal.internal_company_name && extracted.internal_company_name) {
      console.log(
        `[Enrichment] Preserving existing internal_company_name "${deal.internal_company_name}" (AI suggested: "${extracted.internal_company_name}")`,
      );
      delete extracted.internal_company_name;
    }

    // Normalize geographic_states using shared module
    if (extracted.geographic_states) {
      extracted.geographic_states = normalizeStates(extracted.geographic_states as string[]);
    }

    // ========================================================================
    // STEP 4: EXTERNAL ENRICHMENT (LinkedIn + Google Reviews)
    // ========================================================================
    if (!skipExternalEnrichment && hasTimeBudget(65_000)) {
      await enrichLinkedIn(
        supabaseUrl,
        supabaseAnonKey!,
        supabaseServiceKey,
        dealId,
        extracted,
        deal,
        websiteUrl,
      );
      if (hasTimeBudget(35_000)) {
        await enrichGoogleReviews(
          supabaseUrl,
          supabaseAnonKey!,
          supabaseServiceKey,
          dealId,
          extracted,
          deal,
        );
      } else {
        console.log('[enrich-deal] Skipping Google Reviews — insufficient time budget');
      }
    } else if (skipExternalEnrichment) {
      console.log('[enrich-deal] Skipping LinkedIn/Google (handled by pipeline)');
    }

    // ========================================================================
    // STEP 5: WRITE TO DATABASE
    // ========================================================================
    // Use 'data_room' source when data room content is present (higher priority than website)
    const aiExtractionSource = hasDataRoomContent ? ('data_room' as const) : ('website' as const);
    const { updates, sourceUpdates, rejected } = buildPriorityUpdates(
      deal,
      deal.extraction_sources,
      extracted,
      aiExtractionSource,
      undefined, // no transcriptId for website/data_room source
      isPlaceholder, // treat "Not discussed on this call." etc. as empty
    );
    if (rejected.length > 0) {
      console.log(
        `[${aiExtractionSource}] ${rejected.length} fields blocked by higher-priority sources:`,
        rejected,
      );
    }

    const finalUpdates: Record<string, unknown> = {
      ...updates,
      enriched_at: new Date().toISOString(),
      extraction_sources: updateExtractionSources(deal.extraction_sources, sourceUpdates),
    };

    if (updates.geographic_states && deal.geographic_states?.length > 0) {
      finalUpdates.geographic_states = mergeStates(
        deal.geographic_states,
        updates.geographic_states as string[],
      );
    }

    let updateQuery = supabase.from('listings').update(finalUpdates).eq('id', dealId);

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
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!updateResult || updateResult.length === 0) {
      console.warn(
        `Optimistic lock conflict for deal ${dealId} - record was modified by another process`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Deal was already enriched by another process (concurrent modification).',
          fieldsUpdated: [],
          error_code: 'concurrent_modification',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
          dealId,
        );
        if (inferred) {
          websiteFieldsUpdated.push('industry');
          console.log(`[enrich-deal] Industry inferred as fallback: "${inferred}"`);
        }
      } catch (err) {
        console.warn('[enrich-deal] Industry inference fallback failed (non-blocking):', err);
      }
    }

    const allFieldsUpdated = [
      ...new Set([...transcriptFieldNames, ...notesFieldsUpdated, ...websiteFieldsUpdated]),
    ];
    const sourceParts = [];
    if (transcriptFieldNames.length > 0)
      sourceParts.push(`${transcriptFieldNames.length} from transcripts`);
    if (notesFieldsUpdated.length > 0) sourceParts.push(`${notesFieldsUpdated.length} from notes`);
    sourceParts.push(`${websiteFieldsUpdated.length} from ${aiExtractionSource}`);
    console.log(
      `Updated ${allFieldsUpdated.length} fields (${sourceParts.join(', ')}):`,
      allFieldsUpdated,
    );

    // Observability: log enrichment outcome (non-blocking)
    logEnrichmentEvent(supabase, {
      entityType: 'deal',
      entityId: dealId,
      provider: 'gemini',
      functionName: 'enrich-deal',
      status: 'success',
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
          pages: scrapedPages.map((p) => ({
            url: p.url,
            success: p.success,
            chars: p.content.length,
          })),
          websiteSkipReason: websiteSkipReason || undefined,
        },
        transcriptReport,
        notesFieldsUpdated,
        notesReport: {
          status: notesStatus,
          fieldsUpdated: notesFieldsUpdated.length,
          notesLength: notesContent.length,
          error: notesError,
        },
        dataRoomReport: {
          status: dataRoomStatus,
          documentsProcessed: dataRoomDocsProcessed,
          contentLength: dataRoomContent.length,
        },
        rejectedFields: rejected,
        rejectedFieldCount: rejected.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
        const status =
          message.includes('429') || message.includes('rate')
            ? 'rate_limited'
            : message.includes('timeout') || message.includes('abort')
              ? 'timeout'
              : 'failure';
        logEnrichmentEvent(errorSupabase, {
          entityType: 'deal',
          entityId: 'unknown',
          provider: 'gemini',
          functionName: 'enrich-deal',
          status,
          errorMessage: message,
        });
      }
    } catch {
      /* swallow — don't let logging break the error response */
    }

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
