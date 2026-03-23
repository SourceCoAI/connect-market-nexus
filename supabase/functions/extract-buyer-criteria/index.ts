import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { GEMINI_API_URL, getGeminiHeaders, fetchWithAutoRetry } from '../_shared/ai-providers.ts';
import { normalizeState } from '../_shared/criteria-validation.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

// Gemini API configuration
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const DEFAULT_MODEL = 'gemini-2.0-flash';
const EXTRACTION_TIMEOUT_MS = 120000;
const MAX_RETRIES = 3;

interface ExtractionRequest {
  universe_id: string;
  guide_content: string;
  source_name: string;
  industry_name?: string;
}

interface ExtractedBuyer {
  buyer_identity?: {
    name?: string;
    type?: string;
    website?: string;
    parent_company?: string;
  };
  size_criteria?: {
    revenue_min?: number;
    revenue_max?: number;
    ebitda_min?: number;
    ebitda_max?: number;
    location_range?: string;
    confidence?: number;
    source?: string;
  };
  service_criteria?: {
    target_services?: string[];
    service_exclusions?: string[];
    service_notes?: string;
    confidence?: number;
  };
  geography_criteria?: {
    target_regions?: string[];
    target_states?: string[];
    geographic_exclusions?: string[];
    geographic_flexibility?: string;
    confidence?: number;
    source?: string;
  };
  buyer_profile?: {
    typical_size_range?: string;
    geographic_focus?: string;
    service_preferences?: string[];
    strategic_rationale?: string;
    typical_structure?: string;
    growth_strategies?: string[];
  };
  deal_history?: {
    company_name: string;
    location?: string;
    approximate_size?: string;
    year?: number;
    services?: string[];
  }[];
}

interface ExtractionResult {
  buyers: ExtractedBuyer[];
  overall_confidence: number;
}

/**
 * Extract buyer fit criteria from AI-generated M&A guide
 * SOURCE PRIORITY: 60 (Document — lower than Transcript at 100)
 *
 * Guide data fills in gaps where no transcript data exists.
 * It provides a useful baseline but should be treated as research-quality,
 * not primary-source quality.
 */
async function extractCriteriaFromGuide(
  guideContent: string,
  industryName: string,
): Promise<ExtractionResult> {
  console.log('[EXTRACTION_START] Beginning criteria extraction');
  console.log(
    `[GUIDE_LENGTH] ${guideContent.length} characters, ~${Math.round(guideContent.split(/\s+/).length)} words`,
  );

  const systemPrompt = `You are an expert M&A advisor specializing in buyer universe analysis. You are extracting structured buyer fit criteria from a comprehensive industry M&A guide. These guides are written by SourceCo's team and contain detailed buyer profiles, market maps, and acquisition pattern analysis.

IMPORTANT CONTEXT ABOUT SOURCE PRIORITY:
- Data extracted from guides has priority 60 (on a 0-100 scale).
- If a buyer's criteria have already been extracted from a direct call transcript (priority 100), the transcript data takes precedence and CANNOT be overwritten by guide data.
- Guide data fills in gaps where no transcript data exists. It provides a useful baseline but should be treated as research-quality, not primary-source quality.

RULES:
1. DISTINGUISH BETWEEN STATED AND INFERRED: If the guide says "Apex Capital targets $5-15M revenue companies," that's stated criteria with confidence 85-90. If the guide says "Apex has done 3 deals in the Southeast" and you infer they focus on the Southeast, that's inferred with confidence 60-70.

2. BUYER TYPE MATTERS: Distinguish between:
   - PE firms (financial buyers with a fund thesis)
   - Platform companies (PE-backed operating companies doing add-ons)
   - Strategic acquirers (operating companies buying competitors/adjacencies)
   - Family offices (typically longer hold, more flexible criteria)
   - Search funds (typically first-time buyers with specific criteria)
   Each type has different matching implications.

3. EXTRACT PATTERNS, NOT JUST STATEMENTS: If the guide profiles 5 deals a buyer has done and all are in the $3-8M revenue range, that's a pattern worth extracting even if the guide doesn't state "they target $3-8M."

4. SERVICE SPECIFICITY: M&A guides often use broad industry terms. Break these down: "building services" should become specific sub-services if the guide provides enough context (HVAC, plumbing, electrical, etc.).

5. NUMBERS AS RAW INTEGERS: All dollar amounts must be stored as raw numbers. "$7.5M" = 7500000. "about two million" = 2000000.

6. STATE CODES: Always 2-letter uppercase. "IN" not "Indiana."`;

  const userPrompt = `Analyze the following ${industryName} M&A industry guide and extract buyer fit criteria for ALL buyers profiled in the document.

For EACH buyer, extract:

### buyer_identity
Name, type (private_equity|corporate|family_office|independent_sponsor|search_fund|individual_buyer), website if mentioned, parent_company if applicable.

### size_criteria
Extract revenue_min, revenue_max, ebitda_min, ebitda_max, location_range, confidence (0-100), and source ("stated"|"inferred_from_deals"|"inferred_from_context"). If a sweet spot is mentioned, convert to a ±20% min/max range.

Rules:
- "Targets $5-15M revenue" → stated, confidence 85-90.
- Guide profiles 4 deals all between $3-8M → inferred_from_deals, confidence 65-75.
- Guide says "lower-middle-market focus" with no numbers → inferred_from_context, confidence 50-60. Set revenue_min = 5000000, revenue_max = 50000000.
- Always convert to raw numbers.

### service_criteria
Extract target_services (array, be specific — break "restoration" into component services), service_exclusions (array), service_notes, confidence (0-100).

### geography_criteria
Extract target_regions (standard US regions), target_states (2-letter codes, map all deal locations to states), geographic_exclusions, geographic_flexibility ("strict"|"flexible"|"national"), confidence (0-100), source ("stated"|"inferred_from_deals"|"inferred_from_context").

### buyer_profile
Extract typical_size_range, geographic_focus, service_preferences (array), strategic_rationale, typical_structure, growth_strategies (array).

### deal_history
Extract every deal mentioned for this buyer: company_name, location, approximate_size, year, services (array). This validates criteria through pattern analysis.

---

Return an array of buyer objects, one per buyer profiled in the document.

DOCUMENT:
${guideContent.slice(0, 50000)}`;

  const tools = [
    {
      name: 'extract_buyer_criteria',
      description: 'Extract structured buyer fit criteria from M&A guide for all profiled buyers',
      input_schema: {
        type: 'object',
        properties: {
          buyers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                buyer_identity: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Buyer/firm name' },
                    type: {
                      type: 'string',
                      enum: [
                        'private_equity',
                        'corporate',
                        'family_office',
                        'independent_sponsor',
                        'search_fund',
                        'individual_buyer',
                      ],
                      description: 'Buyer type classification',
                    },
                    website: { type: 'string', description: 'Website URL if mentioned' },
                    parent_company: {
                      type: 'string',
                      description: 'Parent PE firm for platform companies',
                    },
                  },
                  required: ['name', 'type'],
                },
                size_criteria: {
                  type: 'object',
                  properties: {
                    revenue_min: {
                      type: 'number',
                      description: 'Min target revenue in raw dollars',
                    },
                    revenue_max: {
                      type: 'number',
                      description: 'Max target revenue in raw dollars',
                    },
                    ebitda_min: { type: 'number', description: 'Min target EBITDA in raw dollars' },
                    ebitda_max: { type: 'number', description: 'Max target EBITDA in raw dollars' },
                    location_range: {
                      type: 'string',
                      description: 'Number of locations range if mentioned',
                    },
                    confidence: { type: 'number', description: 'Confidence score 0-100' },
                    source: {
                      type: 'string',
                      enum: ['stated', 'inferred_from_deals', 'inferred_from_context'],
                      description: 'How criteria were determined',
                    },
                  },
                  required: ['confidence'],
                },
                service_criteria: {
                  type: 'object',
                  properties: {
                    target_services: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Specific services they target. Break broad terms into sub-services.',
                    },
                    service_exclusions: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Services they avoid',
                    },
                    service_notes: {
                      type: 'string',
                      description: 'Context about service preferences',
                    },
                    confidence: { type: 'number', description: 'Confidence 0-100' },
                  },
                  required: ['target_services', 'confidence'],
                },
                geography_criteria: {
                  type: 'object',
                  properties: {
                    target_regions: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Standard US regions',
                    },
                    target_states: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '2-letter state codes. Map all deal locations to states.',
                    },
                    geographic_exclusions: { type: 'array', items: { type: 'string' } },
                    geographic_flexibility: {
                      type: 'string',
                      enum: ['strict', 'flexible', 'national'],
                    },
                    confidence: { type: 'number' },
                    source: {
                      type: 'string',
                      enum: ['stated', 'inferred_from_deals', 'inferred_from_context'],
                    },
                  },
                  required: ['confidence'],
                },
                buyer_profile: {
                  type: 'object',
                  properties: {
                    typical_size_range: { type: 'string' },
                    geographic_focus: { type: 'string' },
                    service_preferences: { type: 'array', items: { type: 'string' } },
                    strategic_rationale: {
                      type: 'string',
                      description: 'Why they acquire in this space',
                    },
                    typical_structure: {
                      type: 'string',
                      description: 'How they usually structure deals',
                    },
                    growth_strategies: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'How they grow portfolio companies post-acquisition',
                    },
                  },
                },
                deal_history: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      company_name: { type: 'string' },
                      location: { type: 'string' },
                      approximate_size: { type: 'string' },
                      year: { type: 'number' },
                      services: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['company_name'],
                  },
                  description: 'All deals mentioned in the guide for this buyer',
                },
              },
              required: ['buyer_identity', 'size_criteria', 'service_criteria'],
            },
            description: 'Array of buyer profiles extracted from the guide',
          },
          overall_confidence: {
            type: 'number',
            description: 'Overall extraction confidence 0-100 for the entire guide',
          },
        },
        required: ['buyers', 'overall_confidence'],
      },
    },
  ];

  const startTime = Date.now();

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Convert tools to OpenAI format for Gemini
  const openAITools = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  // Use shared fetchWithAutoRetry for retry on 429/5xx/timeout
  const response = await fetchWithAutoRetry(
    GEMINI_API_URL,
    {
      method: 'POST',
      headers: getGeminiHeaders(GEMINI_API_KEY),
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: openAITools,
        tool_choice: { type: 'function', function: { name: 'extract_buyer_criteria' } },
        temperature: 0,
      }),
      signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
    },
    { maxRetries: MAX_RETRIES, baseDelayMs: 2000, callerName: 'extract-buyer-criteria' },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 300)}`);
  }

  const result = await response.json();
  const duration = Date.now() - startTime;

  console.log(`[EXTRACTION_COMPLETE] ${duration}ms`);
  console.log(
    `[USAGE] Input: ${result.usage?.prompt_tokens}, Output: ${result.usage?.completion_tokens}`,
  );

  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error('No tool call found in Gemini response');
  }

  const parsed =
    typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

  return parsed;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const {
      universe_id,
      guide_content,
      source_name,
      industry_name = 'Unknown Industry',
    }: ExtractionRequest = await req.json();

    if (!universe_id || !guide_content) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: universe_id, guide_content',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    console.log(
      `[REQUEST] Universe: ${universe_id}, Source: ${source_name}, Industry: ${industry_name}`,
    );

    // Create extraction source record
    const { data: sourceRecord, error: sourceError } = await supabase
      .from('criteria_extraction_sources')
      .insert({
        universe_id,
        source_type: 'ai_guide',
        source_name,
        source_metadata: {
          industry_name,
          content_length: guide_content.length,
          word_count: guide_content.split(/\s+/).length,
        },
        extraction_status: 'processing',
        extraction_started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sourceError) {
      throw new Error(`Failed to create source record: ${sourceError.message}`);
    }

    console.log(`[SOURCE_CREATED] ID: ${sourceRecord.id}`);

    try {
      const extractionResult = await extractCriteriaFromGuide(guide_content, industry_name);

      const buyers = extractionResult.buyers || [];
      const overallConfidence = extractionResult.overall_confidence || 0;

      // Update source record with extraction results
      const { error: updateError } = await supabase
        .from('criteria_extraction_sources')
        .update({
          extraction_status: 'completed',
          extraction_completed_at: new Date().toISOString(),
          extracted_data: extractionResult,
          confidence_scores: {
            overall: overallConfidence,
            buyer_count: buyers.length,
            avg_size_confidence:
              buyers.length > 0
                ? Math.round(
                    buyers.reduce(
                      (sum: number, b: ExtractedBuyer) => sum + (b.size_criteria?.confidence || 0),
                      0,
                    ) / buyers.length,
                  )
                : 0,
            avg_service_confidence:
              buyers.length > 0
                ? Math.round(
                    buyers.reduce(
                      (sum: number, b: ExtractedBuyer) =>
                        sum + (b.service_criteria?.confidence || 0),
                      0,
                    ) / buyers.length,
                  )
                : 0,
            avg_geography_confidence:
              buyers.length > 0
                ? Math.round(
                    buyers.reduce(
                      (sum: number, b: ExtractedBuyer) =>
                        sum + (b.geography_criteria?.confidence || 0),
                      0,
                    ) / buyers.length,
                  )
                : 0,
          },
        })
        .eq('id', sourceRecord.id);

      if (updateError) {
        throw new Error(`Failed to update source record: ${updateError.message}`);
      }

      // Apply extracted criteria to the universe
      await applyToUniverse(supabase, universe_id, buyers);

      console.log(
        `[SUCCESS] Extracted ${buyers.length} buyers with ${overallConfidence}% confidence`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          source_id: sourceRecord.id,
          buyer_count: buyers.length,
          extracted_data: extractionResult,
          confidence: overallConfidence,
          message: `Extracted criteria for ${buyers.length} buyers from M&A guide`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    } catch (extractionError: unknown) {
      await supabase
        .from('criteria_extraction_sources')
        .update({
          extraction_status: 'failed',
          extraction_error:
            extractionError instanceof Error ? extractionError.message : String(extractionError),
          extraction_completed_at: new Date().toISOString(),
        })
        .eq('id', sourceRecord.id);

      throw extractionError;
    }
  } catch (error: unknown) {
    console.error('[ERROR]', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error)?.message ?? String(error),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

async function applyToUniverse(
  supabase: ReturnType<typeof createClient>,
  universeId: string,
  buyers: ExtractedBuyer[],
) {
  if (!buyers || buyers.length === 0) return;

  // Source priority enforcement: check if transcript-sourced criteria already exist
  // Transcript priority = 100, Guide priority = 60 — guide data should NOT overwrite transcript data
  const { data: existingSources } = await supabase
    .from('criteria_extraction_sources')
    .select('source_type, extraction_status, extracted_data')
    .eq('universe_id', universeId)
    .eq('extraction_status', 'completed')
    .in('source_type', ['transcript', 'buyer_transcript']);

  const hasTranscriptData = existingSources && existingSources.length > 0;
  if (hasTranscriptData) {
    console.log(
      `[SOURCE_PRIORITY] Universe ${universeId} has ${existingSources.length} transcript source(s) — guide data will only fill empty fields`,
    );
  }

  // Aggregate criteria across all extracted buyers
  const allServices = new Set<string>();
  const allRegions = new Set<string>();
  const allStates = new Set<string>();
  const allExclusions = new Set<string>();

  for (const buyer of buyers) {
    if (buyer.service_criteria?.target_services) {
      buyer.service_criteria.target_services.forEach((s: string) => allServices.add(s));
    }
    if (buyer.geography_criteria?.target_regions) {
      buyer.geography_criteria.target_regions.forEach((r: string) => allRegions.add(r));
    }
    if (buyer.geography_criteria?.target_states) {
      buyer.geography_criteria.target_states.forEach((s: string) => {
        const normalized = normalizeState(s);
        if (normalized) allStates.add(normalized);
      });
    }
    if (buyer.geography_criteria?.geographic_exclusions) {
      buyer.geography_criteria.geographic_exclusions.forEach((e: string) => allExclusions.add(e));
    }
  }

  // Build size criteria from all buyers using percentile-based aggregation
  // Prevents outlier buyers from creating meaninglessly wide ranges
  const revenueMinVals = buyers
    .map((b) => b.size_criteria?.revenue_min)
    .filter(Boolean)
    .sort((a: number, b: number) => a - b);
  const revenueMaxVals = buyers
    .map((b) => b.size_criteria?.revenue_max)
    .filter(Boolean)
    .sort((a: number, b: number) => a - b);
  const ebitdaMinVals = buyers
    .map((b) => b.size_criteria?.ebitda_min)
    .filter(Boolean)
    .sort((a: number, b: number) => a - b);
  const ebitdaMaxVals = buyers
    .map((b) => b.size_criteria?.ebitda_max)
    .filter(Boolean)
    .sort((a: number, b: number) => a - b);

  // Percentile helper: 25th for mins (conservative lower bound), 75th for maxes (conservative upper bound)
  const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return undefined;
    if (arr.length === 1) return arr[0];
    const idx = Math.max(0, Math.ceil(arr.length * p) - 1);
    return arr[idx];
  };

  const universeUpdate: Record<string, unknown> = {};

  if (revenueMinVals.length > 0 || revenueMaxVals.length > 0) {
    const sizeCriteria: Record<string, number | undefined> = {
      min_revenue: percentile(revenueMinVals, 0.25),
      max_revenue: percentile(revenueMaxVals, 0.75),
      min_ebitda: percentile(ebitdaMinVals, 0.25),
      max_ebitda: percentile(ebitdaMaxVals, 0.75),
    };
    Object.keys(sizeCriteria).forEach((key) => {
      if (sizeCriteria[key] === undefined) delete sizeCriteria[key];
    });
    universeUpdate.size_criteria = sizeCriteria;
  }

  if (allStates.size > 0 || allRegions.size > 0) {
    universeUpdate.geography_criteria = {
      target_states: Array.from(allStates),
      target_regions: Array.from(allRegions),
      exclude_states: Array.from(allExclusions),
    };
  }

  if (allServices.size > 0) {
    universeUpdate.service_criteria = {
      required_services: Array.from(allServices),
    };
  }

  const buyerTypes = new Set(buyers.map((b) => b.buyer_identity?.type).filter(Boolean));
  if (buyerTypes.size > 0) {
    universeUpdate.buyer_types_criteria = {
      include_pe_firms: buyerTypes.has('private_equity'),
      include_platforms: buyerTypes.has('corporate'),
      include_strategic: buyerTypes.has('corporate'),
      include_family_office: buyerTypes.has('family_office'),
      include_independent_sponsors: buyerTypes.has('independent_sponsor'),
      include_search_funds: buyerTypes.has('search_fund'),
    };
  }

  // Build target_buyer_types array from extracted buyer profiles
  // This populates the TargetBuyerTypesPanel in the UI
  const targetBuyerTypes = buyers
    .map((buyer: ExtractedBuyer, index: number) => ({
      id: buyer.buyer_identity?.name
        ? buyer.buyer_identity.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '')
        : `buyer_${index + 1}`,
      rank: index + 1,
      name: buyer.buyer_identity?.name || `Buyer ${index + 1}`,
      description:
        buyer.buyer_profile?.strategic_rationale ||
        buyer.buyer_profile?.geographic_focus ||
        `${buyer.buyer_identity?.type || 'Unknown'} buyer targeting ${buyer.service_criteria?.target_services?.slice(0, 3).join(', ') || 'various services'}`,
      locations_min: buyer.size_criteria?.location_range
        ? parseInt(String(buyer.size_criteria.location_range).split('-')[0]) || undefined
        : undefined,
      locations_max: buyer.size_criteria?.location_range
        ? parseInt(String(buyer.size_criteria.location_range).split('-').pop() ?? '') || undefined
        : undefined,
      revenue_per_location: undefined,
      deal_requirements: buyer.buyer_profile?.typical_structure || undefined,
      enabled: true,
    }))
    .filter((t: { name?: string }) => t.name);

  if (targetBuyerTypes.length > 0) {
    universeUpdate.target_buyer_types = targetBuyerTypes;
  }

  if (Object.keys(universeUpdate).length > 0) {
    // Source priority: if transcript data exists, only fill empty/null fields
    if (hasTranscriptData) {
      const { data: currentUniverse } = await supabase
        .from('buyer_universes')
        .select('size_criteria, geography_criteria, service_criteria, buyer_types_criteria')
        .eq('id', universeId)
        .single();

      if (currentUniverse) {
        const fieldsSkipped: string[] = [];
        for (const key of Object.keys(universeUpdate)) {
          if (key === 'target_buyer_types') continue; // Always merge buyer types
          const existing = currentUniverse[key];
          if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) {
            fieldsSkipped.push(key);
            delete universeUpdate[key];
          }
        }
        if (fieldsSkipped.length > 0) {
          console.log(
            `[SOURCE_PRIORITY] Skipped overwriting ${fieldsSkipped.join(', ')} — transcript data takes precedence`,
          );
        }
      }
    }

    if (Object.keys(universeUpdate).length === 0) {
      console.log('[SOURCE_PRIORITY] No fields to update after priority filtering');
      return;
    }

    const { error } = await supabase
      .from('buyer_universes')
      .update(universeUpdate)
      .eq('id', universeId);

    if (error) {
      console.error('[UNIVERSE_UPDATE_ERROR]', error);
    } else {
      console.log(
        `[UNIVERSE_UPDATED] Applied ${Object.keys(universeUpdate).length} criteria sections (${targetBuyerTypes.length} buyer types) from ${buyers.length} buyers`,
      );
    }
  }
}
