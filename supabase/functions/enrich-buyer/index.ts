/**
 * EDGE FUNCTION: enrich-buyer
 *
 * PURPOSE:
 *   Enriches a remarketing buyer record by scraping their platform website and
 *   PE firm website via Firecrawl, then running a multi-prompt AI extraction pipeline
 *   (Gemini) to populate business overview, customer profile, geography, and PE
 *   intelligence fields. Includes SSRF validation, concurrency locking, and
 *   field-level provenance tracking.
 *
 * TRIGGERS:
 *   HTTP POST request (from UI or process-buyer-enrichment-queue worker)
 *   Body: { buyerId, skipLock? }
 *
 * DATABASE TABLES TOUCHED:
 *   READ:  buyers, rate_limit_config
 *   WRITE: buyers, enrichment_events, ai_cost_log
 *
 * EXTERNAL APIS:
 *   Firecrawl (website scraping and sitemap mapping)
 *   Gemini (AI extraction: business overview, customer profile, geography, PE intelligence)
 *
 * LAST UPDATED: 2026-02-26
 * AUDIT REF: CTO Audit February 2026
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateUrl, ssrfErrorResponse } from '../_shared/security.ts';
import { logAICallCost } from '../_shared/cost-tracker.ts';
import { logEnrichmentEvent } from '../_shared/enrichment-events.ts';
import { type RateLimitConfig } from '../_shared/ai-providers.ts';
import { withConcurrencyTracking, reportRateLimit } from '../_shared/rate-limiter.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { type SourceType, validateFieldProvenance } from '../_shared/provenance.ts';
import { getErrorMessage } from '../_shared/enrichment/pipeline.ts';
import {
  // Configuration
  BUYER_AI_CONFIG,
  BUYER_MIN_CONTENT_LENGTH,
  BUYER_SCRAPE_TIMEOUT_MS,
  BUYER_AI_CONCURRENCY,
  // Constants
  LOCATION_PATTERNS,
  FIELD_TO_COLUMN_MAP,
  // Extraction functions
  extractBusinessOverview,
  extractCustomerProfile,
  extractGeography,
  extractPEIntelligence,
  // Validation
  validateGeography,
  // Update building
  buildBuyerUpdateObject,
  // Types
  type AIExtractionResult,
} from '../_shared/buyer-extraction.ts';

// ============================================================================
// FIRECRAWL SCRAPING
// ============================================================================

// Module-level rate limit config — set once per invocation from the main handler's supabase client
let _rateLimitConfig: RateLimitConfig | undefined;

// Content below this threshold triggers a full-page fallback scrape.
// Small business sites (restaurants, pubs, local services) often put key info
// (address, about section, business description) outside the "main content" area,
// in footers or sidebars that onlyMainContent:true strips out.
const SPARSE_CONTENT_THRESHOLD = 800;

async function scrapeWebsiteOnce(
  url: string,
  apiKey: string,
  onlyMainContent: boolean,
): Promise<{ ok: boolean; content: string; httpError?: string }> {
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = `https://${formattedUrl}`;
  }

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: formattedUrl,
      formats: ['markdown'],
      onlyMainContent,
      waitFor: 1500,
    }),
    signal: AbortSignal.timeout(BUYER_SCRAPE_TIMEOUT_MS),
  });

  if (response.status === 429 && _rateLimitConfig?.supabase) {
    await reportRateLimit(_rateLimitConfig.supabase, 'firecrawl');
  }

  if (!response.ok) {
    return { ok: false, content: '', httpError: `HTTP ${response.status}` };
  }

  const data = await response.json();
  const content = data.data?.markdown || data.markdown || '';
  return { ok: true, content };
}

async function scrapeWebsite(
  url: string,
  apiKey: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const runScrape = (onlyMainContent: boolean) => {
      const fn = () => scrapeWebsiteOnce(url, apiKey, onlyMainContent);
      return _rateLimitConfig?.supabase
        ? withConcurrencyTracking(_rateLimitConfig.supabase, 'firecrawl', fn)
        : fn();
    };

    // First attempt: onlyMainContent:true filters out nav/footer noise (preferred for PE/platform sites)
    const first = await runScrape(true);

    if (!first.ok) {
      return { success: false, error: first.httpError };
    }

    // If the main content is rich enough, we're done
    if (first.content.length >= SPARSE_CONTENT_THRESHOLD) {
      return { success: true, content: first.content };
    }

    // Sparse result — retry with full page scrape.
    // Small business sites (restaurants, pubs, local service companies) commonly put
    // their description, address, and about content in sidebars/footers that are
    // stripped by onlyMainContent:true.
    console.log(
      `[scrapeWebsite] Sparse main content (${first.content.length} chars) — retrying with full page`,
    );
    const fallback = await runScrape(false);

    const best = fallback.ok && fallback.content.length > first.content.length
      ? fallback.content
      : first.content;

    if (best.length < BUYER_MIN_CONTENT_LENGTH) {
      return { success: false, error: `Insufficient content (${best.length} chars)` };
    }

    return { success: true, content: best };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { success: false, error: `Timed out after ${BUYER_SCRAPE_TIMEOUT_MS / 1000}s` };
    }
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Scrape a location/branch page with settings optimized for location data:
 * - onlyMainContent: false — locations are often in sidebars, footers, or secondary nav
 * - waitFor: 3000ms — JS-rendered store finders need extra time for API calls and map rendering
 */
async function scrapeLocationPage(
  url: string,
  apiKey: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  const doScrape = async () => {
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown'],
        onlyMainContent: false,
        waitFor: 3000,
      }),
      signal: AbortSignal.timeout(BUYER_SCRAPE_TIMEOUT_MS),
    });

    if (response.status === 429 && _rateLimitConfig?.supabase) {
      await reportRateLimit(_rateLimitConfig.supabase, 'firecrawl');
    }

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';

    if (!content || content.length < BUYER_MIN_CONTENT_LENGTH) {
      return { success: false, error: `Insufficient content (${content.length} chars)` };
    }

    return { success: true, content };
  };

  try {
    if (_rateLimitConfig?.supabase) {
      return await withConcurrencyTracking(_rateLimitConfig.supabase, 'firecrawl', doScrape);
    }
    return await doScrape();
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { success: false, error: `Timed out after ${BUYER_SCRAPE_TIMEOUT_MS / 1000}s` };
    }
    return { success: false, error: getErrorMessage(error) };
  }
}

async function firecrawlMap(url: string, apiKey: string, limit = 100): Promise<string[]> {
  const doMap = async () => {
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const response = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        limit,
        includeSubdomains: false,
      }),
      signal: AbortSignal.timeout(BUYER_SCRAPE_TIMEOUT_MS),
    });

    if (response.status === 429 && _rateLimitConfig?.supabase) {
      await reportRateLimit(_rateLimitConfig.supabase, 'firecrawl');
    }

    const data = await response.json();
    if (!response.ok || !data.success) {
      return [];
    }

    return data.links || [];
  };

  try {
    if (_rateLimitConfig?.supabase) {
      return await withConcurrencyTracking(_rateLimitConfig.supabase, 'firecrawl', doMap);
    }
    return await doMap();
  } catch (error) {
    console.error('Firecrawl map error:', error);
    return [];
  }
}

// ============================================================================
// MAIN HANDLER (ORCHESTRATOR)
// ============================================================================

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    console.log('[enrich-buyer] request received');

    // ── Auth guard: require valid JWT + admin role, OR internal service call ──
    const authHeader = req.headers.get('Authorization') || '';
    const callerToken = authHeader.replace('Bearer ', '').trim();
    if (!callerToken) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ success: false, error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Allow internal service-to-service calls (e.g., from process-buyer-enrichment-queue)
    const isInternalCall = callerToken === supabaseServiceKey;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    if (!isInternalCall) {
      const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${callerToken}` } },
      });
      const {
        data: { user: callerUser },
        error: callerError,
      } = await callerClient.auth.getUser();
      if (callerError || !callerUser) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { user_id: callerUser.id });
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden: admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }
    // ── End auth guard ──

    const { buyerId, skipLock } = await req.json();

    if (!buyerId) {
      return new Response(JSON.stringify({ success: false, error: 'buyerId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!firecrawlApiKey || !geminiApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Server configuration error - missing API keys (FIRECRAWL_API_KEY, GEMINI_API_KEY)',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = supabaseAdmin;
    _rateLimitConfig = { supabase };

    // Fetch buyer
    const { data: buyer, error: buyerError } = await supabase
      .from('buyers')
      .select('*')
      .eq('id', buyerId)
      .single();

    if (buyerError || !buyer) {
      return new Response(JSON.stringify({ success: false, error: 'Buyer not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle multiple comma-separated URLs — take the first one
    let platformWebsite = buyer.platform_website || buyer.company_website;
    let peFirmWebsite = buyer.pe_firm_website;
    if (platformWebsite?.includes(',')) {
      platformWebsite =
        platformWebsite
          .split(',')
          .map((u: string) => u.trim())
          .filter(Boolean)[0] || null;
      console.log(`Multiple platform URLs detected, using first: "${platformWebsite}"`);
    }
    if (peFirmWebsite?.includes(',')) {
      peFirmWebsite =
        peFirmWebsite
          .split(',')
          .map((u: string) => u.trim())
          .filter(Boolean)[0] || null;
      console.log(`Multiple PE firm URLs detected, using first: "${peFirmWebsite}"`);
    }

    if (!platformWebsite && !peFirmWebsite) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No website URLs provided. Add platform_website or pe_firm_website first.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // SSRF validation
    if (platformWebsite) {
      const validation = validateUrl(platformWebsite);
      if (!validation.valid) {
        return ssrfErrorResponse(`Platform website: ${validation.reason}`, corsHeaders);
      }
    }
    if (peFirmWebsite) {
      const validation = validateUrl(peFirmWebsite);
      if (!validation.valid) {
        return ssrfErrorResponse(`PE firm website: ${validation.reason}`, corsHeaders);
      }
    }

    // ENRICHMENT LOCK: Prevent concurrent enrichments using atomic compare-and-set
    // Skip lock when called from queue worker (queue already manages concurrency via status)
    const now = new Date().toISOString();
    if (!skipLock) {
      const ENRICHMENT_LOCK_SECONDS = 15;
      const lockCutoff = new Date(Date.now() - ENRICHMENT_LOCK_SECONDS * 1000).toISOString();

      // Atomic compare-and-set: only update if not recently locked
      // This prevents race conditions where two concurrent requests both read the old timestamp
      const { data: lockResult, error: lockError } = await supabase
        .from('buyers')
        .update({ data_last_updated: now })
        .eq('id', buyerId)
        .or(`data_last_updated.is.null,data_last_updated.lt.${lockCutoff}`)
        .select('id')
        .maybeSingle();

      if (lockError) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to acquire enrichment lock' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (!lockResult) {
        // Lock was held by another request
        return new Response(
          JSON.stringify({
            success: false,
            error: `Enrichment already in progress for this buyer. Please wait ${ENRICHMENT_LOCK_SECONDS} seconds and try again.`,
            statusCode: 429,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    } else {
      // Queue-based call: just update timestamp without lock check
      await supabase.from('buyers').update({ data_last_updated: now }).eq('id', buyerId);
    }

    console.log(
      `Starting 4-prompt enrichment for buyer: ${buyer.company_name || buyer.pe_firm_name || buyerId}`,
    );
    console.log(`Platform website: ${platformWebsite || 'none'}`);
    console.log(`PE firm website: ${peFirmWebsite || 'none'}`);

    const existingSources = Array.isArray(buyer.extraction_sources) ? buyer.extraction_sources : [];
    const hasTranscriptSource = existingSources.some(
      (src: { type?: string; source?: string }) =>
        src.type === 'transcript' || src.type === 'buyer_transcript' || src.source === 'transcript',
    );

    const warnings: string[] = [];
    const sources: { platform?: string; pe_firm?: string } = {};
    let platformContent = '';
    let peContent = '';

    // ========================================================================
    // SCRAPE WEBSITES IN PARALLEL
    // ========================================================================

    const scrapePromises: Promise<{
      type: string;
      result: { success: boolean; content?: string; error?: string };
    }>[] = [];

    if (platformWebsite) {
      scrapePromises.push(
        scrapeWebsite(platformWebsite, firecrawlApiKey).then((result) => ({
          type: 'platform',
          result,
        })),
      );
    }
    if (peFirmWebsite && peFirmWebsite !== platformWebsite) {
      scrapePromises.push(
        scrapeWebsite(peFirmWebsite, firecrawlApiKey).then((result) => ({
          type: 'peFirm',
          result,
        })),
      );
    }

    const scrapeResults = await Promise.all(scrapePromises);

    // Start firecrawlMap discovery in parallel — runs alongside initial scrape result processing
    let locationPagesPromise: Promise<string | null> | null = null;

    for (const { type, result } of scrapeResults) {
      if (type === 'platform') {
        if (result.success && result.content) {
          platformContent = result.content;
          sources.platform = platformWebsite!;
          console.log(`Scraped platform website: ${platformContent.length} chars`);

          // PERF: Start location page discovery immediately (runs in parallel with non-geography Gemini prompts)
          // Scrape up to 3 location pages to capture full geographic footprint
          locationPagesPromise = firecrawlMap(platformWebsite!, firecrawlApiKey, 500)
            .then(async (links) => {
              // Find all matching location pages, prioritize more specific patterns
              const locationPages = links.filter((link) =>
                LOCATION_PATTERNS.some((p) => link.toLowerCase().includes(p)),
              );
              if (locationPages.length === 0) {
                console.log('No location pages found in sitemap');
                return null;
              }

              // Separate into index pages (parent directories) and detail pages (individual locations)
              // Index pages like /locations may have a full directory listing
              // Detail pages like /locations/lakewood-co have individual addresses
              // We need BOTH — index pages may be JS-rendered store finders with no data in HTML,
              // while detail pages have actual addresses that the AI can extract
              const indexPages: string[] = [];
              const detailPages: string[] = [];

              for (const page of locationPages) {
                const pageLower = page.toLowerCase();
                const isChildOfAnother = locationPages.some(
                  (other) =>
                    other !== page &&
                    pageLower.startsWith(other.toLowerCase()) &&
                    other.length < page.length,
                );
                if (isChildOfAnother) {
                  detailPages.push(page);
                } else {
                  indexPages.push(page);
                }
              }

              // Scrape index pages (up to 2) + detail pages (up to 8), capped at 10 total
              // This ensures we capture both comprehensive listings AND individual addresses
              const toScrape = [...indexPages.slice(0, 2), ...detailPages.slice(0, 8)].slice(0, 10);

              console.log(
                `Found ${locationPages.length} location pages (${indexPages.length} index, ${detailPages.length} detail), scraping ${toScrape.length}: ${toScrape.join(', ')}`,
              );

              const locationScrapeResults = await Promise.allSettled(
                toScrape.map((url) => scrapeLocationPage(url, firecrawlApiKey)),
              );

              const contents: string[] = [];
              for (let i = 0; i < locationScrapeResults.length; i++) {
                const settled = locationScrapeResults[i];
                if (
                  settled.status === 'fulfilled' &&
                  settled.value.success &&
                  settled.value.content
                ) {
                  console.log(
                    `Scraped location page (${settled.value.content.length} chars): ${toScrape[i]}`,
                  );
                  contents.push(settled.value.content);
                }
              }

              return contents.length > 0
                ? contents.join('\n\n--- ADDITIONAL LOCATION PAGE ---\n\n')
                : null;
            })
            .catch((err) => {
              console.warn('Location page discovery failed:', err);
              return null;
            });
        } else {
          warnings.push(`Platform website scrape failed: ${result.error}`);
        }
      } else if (type === 'peFirm') {
        if (result.success && result.content) {
          peContent = result.content;
          sources.pe_firm = peFirmWebsite!;
          console.log(`Scraped PE firm website: ${peContent.length} chars`);
        } else {
          warnings.push(`PE firm website scrape failed: ${result.error}`);
        }
      }
    }

    if (!platformContent && !peContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not scrape any website content', warnings }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ========================================================================
    // RUN EXTRACTION PROMPTS (ALL IN PARALLEL via Gemini Flash)
    // ========================================================================

    const allExtracted: Record<string, unknown> = {};
    const fieldSourceMap: Record<string, SourceType> = {};
    const evidenceRecords: unknown[] = [];
    const timestamp = new Date().toISOString();
    let promptsRun = 0;
    let promptsSuccessful = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let billingError: { code: string; message: string } | null = null;
    const provenanceViolations: string[] = [];

    // Determine source type from URL
    const getSourceType = (url: string | null | undefined): SourceType => {
      if (!url) return 'manual';
      const normalizedUrl = url
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
      const normalizedPE = peFirmWebsite
        ?.toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
      if (normalizedPE && normalizedUrl === normalizedPE) return 'pe_firm_website';
      return 'platform_website';
    };

    // Helper to process batch results with provenance tracking
    const processBatchResults = (
      results: PromiseSettledResult<{
        name: string;
        result: AIExtractionResult;
        url: string | null | undefined;
      }>[],
    ) => {
      for (const settled of results) {
        if (settled.status === 'fulfilled') {
          const { name, result, url } = settled.value;
          const sourceType = getSourceType(url);

          if (result.error?.code === 'payment_required' || result.error?.code === 'rate_limited') {
            if (!billingError) billingError = result.error;
            continue;
          }

          if (result.data) {
            // Special handling for PE Intelligence: filter out thesis fields
            let dataToMerge = result.data;
            if (name === 'pe_intelligence') {
              const { thesis_summary, strategic_priorities, ...safeData } = result.data;
              if (thesis_summary || strategic_priorities) {
                console.warn(
                  'WARNING: PE Intelligence returned thesis fields - discarding (transcript-only)',
                );
              }
              dataToMerge = safeData;
            }

            // Track source type per field and validate provenance BEFORE merging
            const acceptedFields: string[] = [];
            for (const [field, value] of Object.entries(dataToMerge)) {
              if (value === null || value === undefined) continue;

              const mappedField = FIELD_TO_COLUMN_MAP[field] || field;
              const validation = validateFieldProvenance(mappedField, sourceType);

              if (!validation.allowed) {
                console.error(`🚫 ${validation.reason}`);
                provenanceViolations.push(validation.reason!);
                continue;
              }

              allExtracted[field] = value;
              fieldSourceMap[mappedField] = sourceType;
              acceptedFields.push(field);
            }

            if (acceptedFields.length > 0) {
              promptsSuccessful++;
              if (result.usage) {
                totalInputTokens += result.usage.inputTokens || 0;
                totalOutputTokens += result.usage.outputTokens || 0;
              }
              evidenceRecords.push({
                type: 'website',
                source_type: sourceType,
                url,
                extracted_at: timestamp,
                fields_extracted: acceptedFields,
              });
            }
          }
        } else {
          console.error(`Prompt failed:`, settled.reason);
        }
      }
    };

    // Build extraction tasks as thunks so we can control concurrency
    type ExtractionResult = {
      name: string;
      result: AIExtractionResult;
      url: string | null | undefined;
    };
    const allTasks: (() => Promise<ExtractionResult>)[] = [];

    if (platformContent) {
      allTasks.push(
        () =>
          extractBusinessOverview(platformContent, geminiApiKey, _rateLimitConfig).then((r) => ({
            name: 'business',
            result: r,
            url: platformWebsite,
          })),
        // Geography extraction: await location page content and combine with homepage for full coverage
        () =>
          (async (): Promise<ExtractionResult> => {
            let geoContent = platformContent;

            // Wait for location page discovery (started earlier in parallel with homepage scraping)
            if (locationPagesPromise) {
              const locationContent = await locationPagesPromise;
              if (locationContent) {
                // IMPORTANT: Location pages go FIRST so they survive the 100k char truncation
                // in extractGeography. Homepage content is often 50-70k chars and would push
                // the most valuable location data past the cutoff.
                geoContent =
                  '--- LOCATION/BRANCH PAGES ---\n\n' +
                  locationContent +
                  '\n\n--- HOMEPAGE ---\n\n' +
                  platformContent;
                console.log(
                  `Geography extraction using combined content: ${geoContent.length} chars (location pages ${locationContent.length} + homepage ${platformContent.length})`,
                );
              } else {
                console.log('No location page content found — using homepage only for geography');
              }
            }

            const r = await extractGeography(geoContent, geminiApiKey, _rateLimitConfig);
            return { name: 'geography', result: validateGeography(r), url: platformWebsite };
          })(),
        () =>
          extractCustomerProfile(platformContent, geminiApiKey, _rateLimitConfig).then((r) => ({
            name: 'customer',
            result: r,
            url: platformWebsite,
          })),
      );
    } else if (peContent) {
      // No platform content — only extract geography from PE site
      console.log(
        'Platform website unavailable — extracting geographic_footprint/service_regions ONLY from PE firm website',
      );
      allTasks.push(() =>
        extractGeography(peContent, geminiApiKey, _rateLimitConfig).then((r) => {
          const validated = validateGeography(r);
          if (validated?.data) {
            delete validated.data.hq_city;
            delete validated.data.hq_state;
            delete validated.data.hq_country;
            delete validated.data.hq_region;
            delete validated.data.operating_locations;
            delete validated.data.service_regions;
          }
          return { name: 'geography', result: validated, url: peFirmWebsite };
        }),
      );
    }

    if (peContent) {
      allTasks.push(() =>
        extractPEIntelligence(peContent, geminiApiKey, _rateLimitConfig).then((r) => ({
          name: 'pe_intelligence',
          result: r,
          url: peFirmWebsite,
        })),
      );
    }

    if (allTasks.length > 0) {
      promptsRun += allTasks.length;

      // Execute in batches of AI_CONCURRENCY to prevent rate limit storms
      const allResults: PromiseSettledResult<ExtractionResult>[] = [];
      for (let b = 0; b < allTasks.length; b += BUYER_AI_CONCURRENCY) {
        const batch = allTasks.slice(b, b + BUYER_AI_CONCURRENCY);
        console.log(
          `Running AI batch ${Math.floor(b / BUYER_AI_CONCURRENCY) + 1}/${Math.ceil(allTasks.length / BUYER_AI_CONCURRENCY)} (${batch.length} prompts)`,
        );
        const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
        allResults.push(...batchResults);
      }

      processBatchResults(allResults);
      console.log(`All prompts complete: ${promptsSuccessful}/${promptsRun} successful`);
    }

    console.log(
      `Extraction complete: ${promptsSuccessful}/${promptsRun} prompts successful, ${Object.keys(allExtracted).length} fields extracted`,
    );

    // Handle billing errors with partial save
    if (billingError) {
      const be = billingError as unknown as { code: string; message: string };
      const fieldsExtracted = Object.keys(allExtracted).length;
      if (fieldsExtracted > 0) {
        const partialUpdate = buildBuyerUpdateObject(
          buyer,
          allExtracted,
          hasTranscriptSource,
          existingSources,
          evidenceRecords,
          fieldSourceMap,
        );
        await supabase.from('buyers').update(partialUpdate).eq('id', buyerId);
      }

      if (be.code === 'rate_limited' && fieldsExtracted > 0) {
        console.log(
          `Partial enrichment saved despite rate limit: ${fieldsExtracted} fields for buyer ${buyerId}`,
        );
        return new Response(
          JSON.stringify({
            success: true,
            fieldsUpdated: fieldsExtracted,
            sources,
            warnings: [
              ...warnings,
              `Partial enrichment: ${promptsSuccessful}/${promptsRun} prompts completed before rate limit. Data was saved.`,
            ],
            extractionDetails: {
              promptsRun,
              promptsSuccessful,
              platformScraped: !!platformContent,
              peFirmScraped: !!peContent,
              rateLimited: true,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: be.message,
          error_code: be.code,
          fieldsUpdated: fieldsExtracted,
          recoverable: be.code === 'rate_limited',
        }),
        {
          status: be.code === 'payment_required' ? 402 : 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // ========================================================================
    // SAVE TO DATABASE
    // ========================================================================

    const updateData = buildBuyerUpdateObject(
      buyer,
      allExtracted,
      hasTranscriptSource,
      existingSources,
      evidenceRecords,
      fieldSourceMap,
    );

    const { error: updateError } = await supabase
      .from('buyers')
      .update(updateData)
      .eq('id', buyerId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to save enrichment',
          details: updateError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const fieldsUpdated = Object.keys(updateData).length - 2; // Exclude metadata fields
    console.log(`Successfully enriched buyer ${buyerId}: ${fieldsUpdated} fields updated`);

    // After enrichment, if pe_firm_name is set and parent_pe_firm_id is NULL,
    // enqueue for backfill PE firm linking (trigger also handles this, but explicit is safer)
    const enrichedPeFirmName = (updateData as Record<string, unknown>).pe_firm_name || buyer.pe_firm_name;
    if (
      enrichedPeFirmName &&
      buyer.buyer_type === 'corporate' &&
      !buyer.parent_pe_firm_id
    ) {
      supabase
        .from('pe_link_queue')
        .upsert(
          {
            buyer_id: buyerId,
            pe_firm_name_raw: String(enrichedPeFirmName),
            queued_at: new Date().toISOString(),
            status: 'pending',
          },
          { onConflict: 'buyer_id' },
        )
        .then(({ error: queueError }) => {
          if (queueError) console.warn('[enrich-buyer] pe_link_queue upsert failed:', queueError);
          else console.log(`[enrich-buyer] Enqueued ${buyerId} for PE firm linking`);
        });
    }

    // Observability: log enrichment outcome (non-blocking)
    logEnrichmentEvent(supabase, {
      entityType: 'buyer',
      entityId: buyerId,
      provider: 'gemini',
      functionName: 'enrich-buyer',
      status: 'success',
      fieldsUpdated,
    });

    // Cost tracking: log aggregate AI usage (non-blocking)
    logAICallCost(
      supabase,
      'enrich-buyer',
      'gemini',
      BUYER_AI_CONFIG.model,
      {
        inputTokens: totalInputTokens > 0 ? totalInputTokens : promptsRun * 12000,
        outputTokens: totalOutputTokens > 0 ? totalOutputTokens : promptsSuccessful * 800,
      },
      undefined,
      { buyerId, promptsRun, promptsSuccessful },
    ).catch((err: unknown) => {
      console.warn('[enrich-buyer] Cost tracking failed:', err);
    });

    // Log provenance violations as prominent warnings
    if (provenanceViolations.length > 0) {
      console.error(
        `⚠️ PROVENANCE REPORT: ${provenanceViolations.length} violation(s) blocked during enrichment of buyer ${buyerId}:`,
      );
      for (const v of provenanceViolations) {
        console.error(`  → ${v}`);
      }
      warnings.push(...provenanceViolations.map((v) => `[BLOCKED] ${v}`));
    }

    return new Response(
      JSON.stringify({
        success: true,
        fieldsUpdated,
        sources,
        warnings: warnings.length > 0 ? warnings : undefined,
        provenanceViolations: provenanceViolations.length > 0 ? provenanceViolations : undefined,
        extractionDetails: {
          promptsRun,
          promptsSuccessful,
          platformScraped: !!platformContent,
          peFirmScraped: !!peContent,
          provenanceViolationsBlocked: provenanceViolations.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Enrichment error:', error);
    const errorMsg = getErrorMessage(error);

    // Observability: log enrichment failure (non-blocking)
    try {
      const sbUrl = Deno.env.get('SUPABASE_URL');
      const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (sbUrl && sbKey) {
        const errSupabase = createClient(sbUrl, sbKey);
        const status =
          errorMsg.includes('429') || errorMsg.includes('rate')
            ? 'rate_limited'
            : errorMsg.includes('timeout') || errorMsg.includes('abort')
              ? 'timeout'
              : 'failure';
        logEnrichmentEvent(errSupabase, {
          entityType: 'buyer',
          entityId: 'unknown',
          provider: 'gemini',
          functionName: 'enrich-buyer',
          status,
          errorMessage: errorMsg,
        });
      }
    } catch {
      /* swallow */
    }

    return new Response(JSON.stringify({ success: false, error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
