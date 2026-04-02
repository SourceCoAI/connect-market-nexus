import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  GEMINI_API_URL,
  getGeminiHeaders,
  DEFAULT_GEMINI_MODEL,
  getGeminiApiKey,
} from '../_shared/ai-providers.ts';
import {
  canOverwriteField,
  getFieldSource,
  createFieldSource,
  updateExtractionSources,
} from '../_shared/source-priority.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

// Gemini API configuration
const GEMINI_API_KEY = getGeminiApiKey();

interface TranscriptExtractionRequest {
  transcript_id?: string;
  universe_id?: string;
  buyer_id?: string;
  transcript_text?: string;
  participants?: string[];
  call_date?: string;
}

interface ExtractedInsights {
  buyer_criteria?: {
    size_criteria?: {
      revenue_min?: number;
      revenue_max?: number;
      ebitda_min?: number;
      ebitda_max?: number;
      employee_min?: number;
      employee_max?: number;
      location_count_min?: number;
      location_count_max?: number;
      confidence: number;
    };
    service_criteria?: {
      target_services: string[];
      service_exclusions: string[];
      service_confidence: number;
      service_notes: string;
    };
    geography_criteria?: {
      target_regions: string[];
      target_states: string[];
      geographic_exclusions: string[];
      geographic_flexibility: 'strict' | 'flexible' | 'national';
      confidence: number;
      geography_notes: string;
    };
    deal_structure?: {
      deal_types: string[];
      structure_preferences: string[];
      valuation_parameters?: string;
      preferred_characteristics: string[];
      confidence: number;
    };
  };
  buyer_profile?: {
    thesis_summary?: string;
    acquisition_timeline?: string;
  };
  overall_confidence: number;
}

/**
 * Extract buyer criteria and insights from call/meeting transcript
 * SOURCE PRIORITY: 100 (highest priority source)
 */
async function extractInsightsFromTranscript(
  transcriptText: string,
  participants: string[],
  callDate?: string,
): Promise<ExtractedInsights> {
  console.log('[EXTRACTION_START] Processing buyer transcript');
  console.log(`[PARTICIPANTS] ${participants.join(', ')}`);

  const systemPrompt = `You are an expert M&A advisor at an investment bank that matches acquisition-ready businesses with institutional buyers (PE firms, platform companies, and strategic acquirers). You are analyzing a call transcript to extract the buyer's specific acquisition criteria and investment preferences.

Your job is to understand EXACTLY what this buyer is looking for so the system can match them with relevant deal opportunities. Precision matters — a buyer looking for "$5-15M revenue HVAC companies in the Southeast" is very different from one looking for "$20-50M revenue restoration companies nationally."

CORE RULES:

1. EXTRACT WHAT THEY SAID, NOT WHAT YOU THINK THEY MEAN: If the buyer says "we like companies around $10M," extract that. Do not expand it to "$5-20M" because that seems like a reasonable range. Only extract stated ranges.

2. CONFIDENCE SCORING: Every extracted criterion gets a confidence score:
   - 90-100: Direct quote with specific criteria ("We target companies with $10-50M in revenue")
   - 70-89: Clear statement with some detail ("We generally focus on the Southeast region")
   - 50-69: Implied preference from context or indirect statement ("We've done a few deals in Texas")
   - Below 50: Vague or uncertain — include but flag as low confidence

3. DISTINGUISH HARD REQUIREMENTS FROM PREFERENCES: "We won't look at anything under $2M EBITDA" is a hard floor. "We prefer $3-5M EBITDA" is a preference. "We've done deals at $1M EBITDA" is historical context. These are different and must be tagged differently.

4. LISTEN FOR EXCLUSIONS: What the buyer says they DON'T want is as important as what they DO want. "We stay away from anything with environmental exposure" or "We don't do turnarounds" — include these in the thesis_summary.

5. SEPARATE THE PE FIRM FROM THE PLATFORM: If a PE-backed platform company is on the call, distinguish between the PE firm's criteria and the platform operator's criteria. The platform's operational priorities take precedence for matching purposes.

6. TRACK THE SPEAKER: If multiple people are on the call (e.g., a PE partner and a platform CEO), note who said what. The platform CEO saying "we need HVAC techs" has different weight than the PE partner saying "we like the HVAC space."

7. NUMBERS AS RAW INTEGERS: All dollar amounts must be stored as raw numbers with no formatting. "$7.5M" = 7500000. "about two million" = 2000000.

8. PERCENTAGES AS DECIMALS: 18% = 0.18. 5.5% = 0.055.

9. STATE CODES: Always 2-letter uppercase. "IN" not "Indiana."

10. DEAL-BREAKERS AND STRATEGIC PRIORITIES: Include deal-breakers and strategic priorities directly in the thesis_summary. The thesis should capture the full picture of what the buyer wants, why, and what they refuse to consider.`;

  const userPrompt = `Analyze the following buyer call transcript and extract their acquisition criteria, profile, and key statements.

PARTICIPANTS: ${participants.join(', ')}
${callDate ? `DATE: ${callDate}` : ''}

---

## BUYER CRITERIA

### size_criteria
Extract EVERY size parameter mentioned. Rules:
- "We target $10-50M revenue companies" → revenue_min = 10000000, revenue_max = 50000000, confidence = 95.
- "We've done deals as small as $1M EBITDA" → This is historical, NOT a minimum. Only set ebitda_min if they say "we won't go below" or "minimum is."
- "Sweet spot is around $3M EBITDA" → Set ebitda_min/ebitda_max to a ±20% range around it (e.g., 2400000 to 3600000).
- "We prefer 50+ employees" → employee_min = 50, confidence = 75.
- Hard requirements ("we won't look at," "minimum is," "must be at least") → confidence 90-100.
- Soft preferences ("we prefer," "ideally," "sweet spot") → confidence 70-89.
- Historical mentions ("we've done") → confidence 50-69. Set these as context, not requirements.

### service_criteria
Listen for:
- Explicit targets: "We're building a restoration platform" → target_services = ["fire restoration", "water restoration", "mold remediation"].
- Adjacencies: "We'd love to add roofing to our platform" → include "roofing."
- Exclusions: "We stay away from mold — too much liability" → service_exclusions = ["mold remediation"].
- Be specific: "HVAC" should become ["commercial HVAC", "residential HVAC"] if the buyer specifies which.
- If they describe an industry theme but not specific services, list the most likely constituent services AND note in service_notes that these are inferred from the theme.

### geography_criteria
Rules:
- Map regions to standard US regions: Southeast, Northeast, Mid-Atlantic, Midwest, Southwest, West, Pacific Northwest, Mountain West.
- "We focus on the Southeast" → target_regions = ["Southeast"], geographic_flexibility = "strict", confidence = 85.
- "We're national but most of our deals are in the Southeast" → target_regions = ["Southeast"], geographic_flexibility = "national", confidence = 70.
- Map every city/state mentioned: "We have operations in Dallas and Houston" → target_states includes "TX."
- "We don't want to go west of the Mississippi" → geographic_exclusions should list western states or note the boundary in geography_notes.
- If a buyer names specific MSAs like "We want top-25 MSAs," note that in geography_notes.

### deal_structure
Listen carefully for:
- "We're looking for a platform" vs "We need add-ons for our existing platform" — fundamentally different.
- Structure: "We always do majority recap with rollover equity" vs "We buy 100%."
- Valuation: "We typically pay 4-6x EBITDA" or "We won't go above 5x."
- Preferences: "We prefer recurring revenue," "We like businesses with long customer contracts," "Ideally family-owned."

---

## BUYER PROFILE

### thesis_summary (2-4 sentences)
Write a clear summary of this buyer's acquisition thesis. What are they building? Why? What does their ideal target look like? Use ONLY what was stated in the call. Do NOT supplement with generic PE language or assumed strategies. Include any deal-breakers and strategic priorities in the thesis summary itself.

### acquisition_timeline ("active"|"opportunistic"|"on_hold")
- "active": Buyer is actively looking, has capital deployed, wants to see deals now.
- "opportunistic": Buyer will look at deals but isn't in a rush.
- "on_hold": Buyer is pausing acquisitions.

---

Now analyze the transcript below and return a JSON object with all fields above.

TRANSCRIPT:
${transcriptText.slice(0, 50000)}`;

  const tools = [
    {
      name: 'extract_buyer_insights',
      description:
        'Extract comprehensive buyer acquisition criteria, profile, and key quotes from call transcript',
      input_schema: {
        type: 'object',
        properties: {
          buyer_criteria: {
            type: 'object',
            description: 'Structured acquisition criteria extracted from the call',
            properties: {
              size_criteria: {
                type: 'object',
                properties: {
                  revenue_min: {
                    type: 'number',
                    description:
                      'Minimum revenue target in raw dollars. Only set if explicit floor stated.',
                  },
                  revenue_max: {
                    type: 'number',
                    description: 'Maximum revenue target in raw dollars.',
                  },
                  ebitda_min: {
                    type: 'number',
                    description:
                      'Minimum EBITDA target in raw dollars. Only set if explicit floor stated.',
                  },
                  ebitda_max: {
                    type: 'number',
                    description: 'Maximum EBITDA target in raw dollars.',
                  },
                  employee_min: {
                    type: 'number',
                    description: 'Minimum employee count preference.',
                  },
                  employee_max: {
                    type: 'number',
                    description: 'Maximum employee count preference.',
                  },
                  location_count_min: {
                    type: 'number',
                    description: 'Minimum number of locations.',
                  },
                  location_count_max: {
                    type: 'number',
                    description: 'Maximum number of locations.',
                  },
                  confidence: {
                    type: 'number',
                    description: 'Confidence score 0-100 for size criteria extraction.',
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
                      "Specific services buyer is targeting. Be specific: 'commercial HVAC' not just 'HVAC'.",
                  },
                  service_exclusions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Services buyer explicitly avoids or excludes.',
                  },
                  service_confidence: { type: 'number', description: 'Confidence score 0-100.' },
                  service_notes: {
                    type: 'string',
                    description:
                      'Context on why they want/avoid certain services. Note if inferred from industry theme.',
                  },
                },
                required: ['target_services', 'service_confidence'],
              },
              geography_criteria: {
                type: 'object',
                properties: {
                  target_regions: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Standard US regions: Southeast, Northeast, Mid-Atlantic, Midwest, Southwest, West, Pacific Northwest, Mountain West.',
                  },
                  target_states: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      '2-letter state codes where buyer wants to acquire. Map all city mentions to states.',
                  },
                  geographic_exclusions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'States or regions buyer explicitly avoids.',
                  },
                  geographic_flexibility: {
                    type: 'string',
                    enum: ['strict', 'flexible', 'national'],
                    description: 'How strict their geographic focus is.',
                  },
                  confidence: { type: 'number', description: 'Confidence score 0-100.' },
                  geography_notes: {
                    type: 'string',
                    description:
                      'Additional geographic context, MSA preferences, boundary descriptions.',
                  },
                },
                required: ['confidence'],
              },
              deal_structure: {
                type: 'object',
                description:
                  'Deal structure preferences — stored in extracted_insights JSON only, not written to buyer record',
                properties: {
                  deal_types: {
                    type: 'array',
                    items: { type: 'string' },
                    description: "E.g., 'platform', 'add-on', 'tuck-in', 'strategic acquisition'.",
                  },
                  structure_preferences: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      "E.g., 'majority recapitalization', 'full buyout', 'earnout', 'rollover equity'.",
                  },
                  valuation_parameters: {
                    type: 'string',
                    description: 'Any multiple ranges or valuation approach mentioned.',
                  },
                  preferred_characteristics: {
                    type: 'array',
                    items: { type: 'string' },
                    description: "Nice-to-haves that aren't hard requirements.",
                  },
                  confidence: { type: 'number', description: 'Confidence score 0-100.' },
                },
                required: ['confidence'],
              },
            },
          },
          buyer_profile: {
            type: 'object',
            properties: {
              thesis_summary: {
                type: 'string',
                description:
                  "2-4 sentence summary of buyer's acquisition thesis. ONLY from what was stated in the call.",
              },
              acquisition_timeline: {
                type: 'string',
                enum: ['active', 'opportunistic', 'on_hold'],
                description: 'How actively the buyer is pursuing acquisitions.',
              },
            },
          },
          overall_confidence: {
            type: 'number',
            description: 'Overall extraction confidence 0-100.',
          },
        },
        required: ['overall_confidence'],
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

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: getGeminiHeaders(GEMINI_API_KEY),
    body: JSON.stringify({
      model: DEFAULT_GEMINI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools: openAITools,
      tool_choice: { type: 'function', function: { name: 'extract_buyer_insights' } },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
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

  return parsed as ExtractedInsights;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const {
      transcript_id,
      universe_id,
      buyer_id,
      transcript_text,
      participants = [],
      call_date,
    }: TranscriptExtractionRequest = await req.json();

    if (!transcript_text && !transcript_id) {
      throw new Error('Must provide either transcript_text or transcript_id');
    }

    console.log(
      `[REQUEST] Transcript: ${transcript_id || 'new'}, Universe: ${universe_id}, Buyer: ${buyer_id}`,
    );

    let finalTranscriptText = transcript_text;
    let transcriptRecord: Record<string, unknown> | null = null;

    // If transcript_id provided, load from database
    if (transcript_id) {
      const { data, error } = await supabase
        .from('buyer_transcripts')
        .select('*')
        .eq('id', transcript_id)
        .single();

      if (error) {
        throw new Error(`Failed to load transcript: ${error.message}`);
      }

      transcriptRecord = data;
      finalTranscriptText = data.transcript_text;

      // Update status to processing
      await supabase
        .from('buyer_transcripts')
        .update({
          extraction_status: 'processing',
          processed_at: new Date().toISOString(),
        })
        .eq('id', transcript_id);
    } else {
      // Create new transcript record
      const { data, error } = await supabase
        .from('buyer_transcripts')
        .insert({
          buyer_id,
          universe_id,
          transcript_text: finalTranscriptText,
          participants,
          call_date: call_date ? new Date(call_date).toISOString() : null,
          extraction_status: 'processing',
          processed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create transcript record: ${error.message}`);
      }

      transcriptRecord = data;
    }

    console.log(`[TRANSCRIPT_RECORD] ID: ${transcriptRecord.id}`);

    // Extract insights from transcript
    try {
      const insights = await extractInsightsFromTranscript(
        finalTranscriptText!,
        participants.length > 0 ? participants : transcriptRecord.participants || [],
        call_date || transcriptRecord.call_date,
      );

      // Update transcript record with extracted insights
      const { error: updateError } = await supabase
        .from('buyer_transcripts')
        .update({
          extraction_status: 'completed',
          extracted_insights: insights,
          processed_at: new Date().toISOString(),
        })
        .eq('id', transcriptRecord.id);

      if (updateError) {
        throw new Error(`Failed to update transcript: ${updateError.message}`);
      }

      // If buyer_id provided, update buyer record with insights
      if (buyer_id) {
        const buyerUpdates: Record<string, unknown> = {};

        // Fetch existing buyer data for source priority checks
        const { data: existingBuyer } = await supabase
          .from('buyers')
          .select('*')
          .eq('id', buyer_id)
          .single();

        const sourceUpdates: Record<string, unknown> = {};
        const rejectedFields: string[] = [];

        const safeSet = (field: string, value: unknown) => {
          if (value === null || value === undefined) return;
          if (Array.isArray(value) && value.length === 0) return;
          if (typeof value === 'string' && value.trim() === '') return;

          // Enforce source priority: check if transcript (priority 100) can overwrite existing value
          const existingFieldSource = getFieldSource(existingBuyer?.extraction_sources, field);
          const existingSourceType = existingFieldSource?.source;
          const existingValue = existingBuyer?.[field];

          if (canOverwriteField(field, existingSourceType, 'transcript', existingValue)) {
            buyerUpdates[field] = value;
            sourceUpdates[field] = createFieldSource('transcript', transcriptRecord?.id);
          } else {
            rejectedFields.push(`${field}: transcript blocked by ${existingSourceType}`);
          }
        };

        // Map buyer_profile fields
        if (insights.buyer_profile) {
          if (insights.buyer_profile.thesis_summary) {
            safeSet('thesis_summary', insights.buyer_profile.thesis_summary);
          }
          if (insights.buyer_profile.acquisition_timeline) {
            safeSet('acquisition_timeline', insights.buyer_profile.acquisition_timeline);
          }
        }

        // Map buyer_criteria fields to buyer record
        if (insights.buyer_criteria) {
          // Map service targets to target_services (NOT target_industries — that's a different field)
          if (insights.buyer_criteria.service_criteria?.target_services?.length) {
            safeSet('target_services', insights.buyer_criteria.service_criteria.target_services);
          }

          // Map geography targets
          if (insights.buyer_criteria.geography_criteria?.target_states?.length) {
            safeSet('target_geographies', insights.buyer_criteria.geography_criteria.target_states);
          }

          // Geographic exclusions are stored in extracted_insights JSONB on the
          // transcript record. No dedicated column exists on the buyers table yet.

          // Map size criteria — deal structure can ONLY come from transcripts
          const size = insights.buyer_criteria.size_criteria;
          if (size) {
            if (size.revenue_min) safeSet('target_revenue_min', size.revenue_min);
            if (size.revenue_max) safeSet('target_revenue_max', size.revenue_max);
            if (size.ebitda_min) safeSet('target_ebitda_min', size.ebitda_min);
            if (size.ebitda_max) safeSet('target_ebitda_max', size.ebitda_max);
          }
        }

        if (rejectedFields.length > 0) {
          console.log(
            `[SOURCE_PRIORITY] ${rejectedFields.length} fields blocked by higher-priority sources:`,
            rejectedFields,
          );
        }

        if (Object.keys(buyerUpdates).length > 0) {
          // Build the per-field source map for priority lookups (canOverwriteField)
          // getFieldSource() expects an object keyed by field name, so we must store
          // extraction_sources as an object — NOT the legacy array format.
          const existingSourcesObj =
            existingBuyer?.extraction_sources &&
            typeof existingBuyer.extraction_sources === 'object' &&
            !Array.isArray(existingBuyer.extraction_sources)
              ? existingBuyer.extraction_sources
              : {};

          const mergedExtractionSources = updateExtractionSources(
            existingSourcesObj as Record<string, any>,
            sourceUpdates as Record<string, any>,
          );

          // Store as object format so getFieldSource() works on subsequent runs.
          // Also embed a _history array for audit trail (replaces legacy top-level array).
          const historyArray = Array.isArray(existingBuyer?.extraction_sources)
            ? existingBuyer.extraction_sources
            : (existingSourcesObj as Record<string, any>)?._history || [];

          buyerUpdates.extraction_sources = {
            ...mergedExtractionSources,
            _history: [
              ...historyArray,
              {
                type: 'transcript',
                transcript_id: transcriptRecord.id,
                extracted_at: new Date().toISOString(),
                fields_extracted: Object.keys(buyerUpdates).filter(
                  (k) => k !== 'extraction_sources',
                ),
                confidence: insights.overall_confidence,
              },
            ],
          };
          buyerUpdates.data_last_updated = new Date().toISOString();

          await supabase.from('buyers').update(buyerUpdates).eq('id', buyer_id);

          console.log(
            `[BUYER_UPDATED] Applied ${Object.keys(buyerUpdates).length} fields to buyer ${buyer_id}. Confidence: ${insights.overall_confidence}. Fields: ${Object.keys(
              buyerUpdates,
            )
              .filter((k) => k !== 'extraction_sources' && k !== 'data_last_updated')
              .join(', ')}`,
          );
        }
      }

      // If universe_id provided, create extraction source record
      if (universe_id) {
        await supabase.from('criteria_extraction_sources').insert({
          universe_id,
          source_type: 'call_transcript',
          source_name: `Transcript - ${participants.join(', ') || 'Unknown'}`,
          source_metadata: {
            transcript_id: transcriptRecord.id,
            call_date: call_date || transcriptRecord.call_date,
            participants,
          },
          extraction_status: 'completed',
          extraction_started_at: new Date().toISOString(),
          extraction_completed_at: new Date().toISOString(),
          extracted_data: insights,
          confidence_scores: {
            size: insights.buyer_criteria?.size_criteria?.confidence || 0,
            service: insights.buyer_criteria?.service_criteria?.service_confidence || 0,
            geography: insights.buyer_criteria?.geography_criteria?.confidence || 0,
            deal_structure: insights.buyer_criteria?.deal_structure?.confidence || 0,
            overall: insights.overall_confidence,
          },
        });

        console.log(`[SOURCE_CREATED] Extraction source created for universe ${universe_id}`);
      }

      console.log(
        `[SUCCESS] Buyer transcript extraction completed with ${insights.overall_confidence}% confidence`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          transcript_id: transcriptRecord.id,
          insights,
          message: 'Buyer transcript insights extracted successfully',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    } catch (extractionError: unknown) {
      await supabase
        .from('buyer_transcripts')
        .update({
          extraction_status: 'failed',
          extraction_error:
            extractionError instanceof Error ? extractionError.message : String(extractionError),
          processed_at: new Date().toISOString(),
        })
        .eq('id', transcriptRecord.id);

      throw extractionError;
    }
  } catch (error: unknown) {
    console.error('[ERROR]', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
