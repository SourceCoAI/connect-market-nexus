import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  GEMINI_API_URL,
  getGeminiHeaders,
  DEFAULT_GEMINI_MODEL,
  callGeminiWithRetry,
} from '../_shared/ai-providers.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

/**
 * Analyze Tracker Notes Edge Function
 *
 * Input Pathway 1: Quick Import from Notes
 * Extracts structured buyer universe criteria from unstructured text
 * (call notes, emails, meeting notes, etc.)
 */

const EXTRACTION_TOOL = {
  type: 'function',
  function: {
    name: 'extract_criteria',
    description: 'Extract structured buyer universe criteria from natural language text',
    parameters: {
      type: 'object',
      properties: {
        size_criteria: {
          type: 'object',
          properties: {
            revenue_min: { type: 'number', description: 'Minimum revenue in dollars' },
            revenue_max: { type: 'number', description: 'Maximum revenue in dollars' },
            ebitda_min: { type: 'number', description: 'Minimum EBITDA in dollars' },
            ebitda_max: { type: 'number', description: 'Maximum EBITDA in dollars' },
            ebitda_multiple_min: {
              type: 'number',
              description: 'Minimum EBITDA multiple (e.g., 3 for 3x)',
            },
            ebitda_multiple_max: { type: 'number', description: 'Maximum EBITDA multiple' },
            locations_min: { type: 'number' },
            locations_max: { type: 'number' },
            revenue_per_location: { type: 'number' },
            other_notes: { type: 'string' },
          },
        },
        service_criteria: {
          type: 'object',
          properties: {
            primary_focus: {
              type: 'array',
              items: { type: 'string' },
              description:
                "PRIMARY industry/service focus - REQUIRED. Examples: 'Collision Repair', 'HVAC', 'Pest Control'",
            },
            required_services: { type: 'array', items: { type: 'string' } },
            preferred_services: { type: 'array', items: { type: 'string' } },
            excluded_services: { type: 'array', items: { type: 'string' } },
            business_model: { type: 'string' },
            customer_profile: { type: 'string' },
          },
          required: ['primary_focus'],
        },
        geography_criteria: {
          type: 'object',
          properties: {
            target_states: { type: 'array', items: { type: 'string' } },
            target_regions: { type: 'array', items: { type: 'string' } },
            preferred_metros: { type: 'array', items: { type: 'string' } },
            exclude_states: { type: 'array', items: { type: 'string' } },
            coverage: { type: 'string', enum: ['local', 'regional', 'national', 'multi-state'] },
            hq_requirements: { type: 'string' },
          },
        },
        buyer_types_criteria: {
          type: 'object',
          properties: {
            include_pe_firms: { type: 'boolean' },
            include_platforms: { type: 'boolean' },
            include_strategic: { type: 'boolean' },
            include_family_office: { type: 'boolean' },
            include_independent_sponsors: { type: 'boolean' },
            include_search_funds: { type: 'boolean' },
            include_individual_buyers: { type: 'boolean' },
            buyer_types: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  priority: { type: 'number' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  locations_min: { type: 'number' },
                  locations_max: { type: 'number' },
                  enabled: { type: 'boolean' },
                },
              },
            },
          },
        },
        scoring_hints: {
          type: 'object',
          properties: {
            geography_mode: { type: 'string', enum: ['strict', 'flexible', 'national'] },
            size_importance: { type: 'string', enum: ['critical', 'important', 'flexible'] },
            service_matching: { type: 'string', enum: ['exact', 'related', 'broad'] },
          },
        },
        human_readable_summaries: {
          type: 'object',
          properties: {
            size_summary: {
              type: 'string',
              description: "One-line summary like 'Revenue: $5M-$25M, EBITDA: $1M+'",
            },
            service_summary: { type: 'string', description: 'One-line summary of service focus' },
            geography_summary: {
              type: 'string',
              description: 'One-line summary of geographic focus',
            },
            buyer_types_summary: {
              type: 'string',
              description: 'One-line summary of target buyer types',
            },
          },
        },
        confidence: {
          type: 'number',
          description: 'Confidence score 0-1 for the extraction quality',
        },
        extracted_keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key terms extracted from the text',
        },
      },
      required: ['service_criteria', 'confidence'],
    },
  },
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { notes_text, universe_name, existing_criteria } = await req.json();

    if (!notes_text || notes_text.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: 'Please provide notes with at least 20 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    console.log(`Analyzing notes for universe: ${universe_name || 'unnamed'}`);
    console.log(`Notes length: ${notes_text.length} chars`);

    const systemPrompt = `You are an expert M&A analyst extracting structured buyer universe criteria from unstructured notes.

Your task is to parse the provided text and extract:
1. SIZE CRITERIA: Revenue ranges, EBITDA ranges/multiples, location counts
   - Convert "$5M-$30M revenue" to revenue_min: 5000000, revenue_max: 30000000
   - Separate EBITDA multiples (3x-5x) from EBITDA dollars ($1M-$5M)
   
2. SERVICE CRITERIA: Industry focus and service requirements
   - CRITICAL: Always populate primary_focus with the main industry/service types
   - Examples: "Collision Repair", "HVAC", "Pest Control", "Plumbing", "Home Services"
   
3. GEOGRAPHY CRITERIA: Target regions, states, metros
   - Map region names like "Southeast" to actual states
   - Note coverage mode (local, regional, national)
   
4. BUYER TYPES: What types of buyers are being targeted
   - PE firms, platforms, strategic acquirers, family offices
   - Any specific buyer profiles mentioned

5. SCORING HINTS: How strict the matching should be
   - Geography mode: strict (exact state), flexible (region), national
   - Size importance: critical (hard cutoff), important (strong weight), flexible

IMPORTANT RULES:
- Never leave primary_focus empty - infer from context if not explicit
- Do not use placeholder values like [X] or [VALUE]
- Convert all currency to raw numbers (no $, M, K in output)
- Set confidence based on how explicit vs inferred the data is`;

    const userPrompt = `Extract buyer universe criteria from these notes:

---
${notes_text}
---

${existing_criteria ? `\nExisting criteria to merge with (don't override unless notes are more specific):\n${JSON.stringify(existing_criteria, null, 2)}` : ''}

Extract all available criteria using the extract_criteria function. Be thorough but only include what's explicitly stated or strongly implied.`;

    // Use shared retry-aware Gemini call
    const response = await callGeminiWithRetry(
      GEMINI_API_URL,
      getGeminiHeaders(GEMINI_API_KEY),
      {
        model: DEFAULT_GEMINI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'function', function: { name: 'extract_criteria' } },
      },
      45000,
      'analyze-tracker-notes',
    );

    if (!response.ok) {
      if (response.status === 429 || response.status === 529) {
        return new Response(
          JSON.stringify({ error: 'AI service busy. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const text = await response.text();
      console.error('AI Gateway error:', response.status, text);
      throw new Error('Failed to analyze notes');
    }

    const result = await response.json();

    // Extract the tool call result
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'extract_criteria') {
      throw new Error('AI did not return expected extraction result');
    }

    let extractedData;
    try {
      extractedData = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error('Failed to parse tool call arguments');
      throw new Error('Failed to parse extraction result');
    }

    // Post-process: clean placeholders and validate
    const cleanedData = cleanExtractedData(extractedData);

    console.log(
      `Extracted criteria with ${Math.round((Number(cleanedData.confidence) || 0.5) * 100)}% confidence`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        criteria: cleanedData,
        summaries: cleanedData.human_readable_summaries || {},
        confidence: cleanedData.confidence || 0.5,
        keywords: cleanedData.extracted_keywords || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error analyzing notes:', error);
    const message = error instanceof Error ? error.message : 'Failed to analyze notes';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Clean extracted data to remove placeholders and fix common issues
function cleanExtractedData(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned = JSON.parse(JSON.stringify(data)); // Deep clone

  // Remove placeholder patterns
  const cleanValue = (val: unknown): unknown => {
    if (typeof val === 'string') {
      // Remove [X], [VALUE], etc.
      if (/\[[^\]]*\]/.test(val)) return undefined;
      if (/^(TBD|N\/A|TODO)$/i.test(val.trim())) return undefined;
      return val.trim() || undefined;
    }
    if (Array.isArray(val)) {
      return val.map(cleanValue).filter((v) => v !== undefined);
    }
    if (typeof val === 'object' && val !== null) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) {
        const cleaned = cleanValue(v);
        if (cleaned !== undefined && cleaned !== null) {
          if (!(Array.isArray(cleaned) && cleaned.length === 0)) {
            result[k] = cleaned;
          }
        }
      }
      return Object.keys(result).length > 0 ? result : undefined;
    }
    return val;
  };

  // Clean all sections
  if (cleaned.size_criteria) {
    cleaned.size_criteria = cleanValue(cleaned.size_criteria) || {};

    // Fix EBITDA multiples stored in dollar fields
    const sc = cleaned.size_criteria;
    if (sc.ebitda_min && sc.ebitda_min > 0 && sc.ebitda_min < 20) {
      sc.ebitda_multiple_min = sc.ebitda_min;
      delete sc.ebitda_min;
    }
    if (sc.ebitda_max && sc.ebitda_max > 0 && sc.ebitda_max < 20) {
      sc.ebitda_multiple_max = sc.ebitda_max;
      delete sc.ebitda_max;
    }
  }

  if (cleaned.service_criteria) {
    cleaned.service_criteria = cleanValue(cleaned.service_criteria) || {};

    // Ensure primary_focus exists
    if (
      !cleaned.service_criteria.primary_focus ||
      cleaned.service_criteria.primary_focus.length === 0
    ) {
      // Try to infer from required_services
      if (cleaned.service_criteria.required_services?.length > 0) {
        cleaned.service_criteria.primary_focus = cleaned.service_criteria.required_services.slice(
          0,
          3,
        );
      }
    }
  }

  if (cleaned.geography_criteria) {
    cleaned.geography_criteria = cleanValue(cleaned.geography_criteria) || {};
  }

  if (cleaned.buyer_types_criteria) {
    cleaned.buyer_types_criteria = cleanValue(cleaned.buyer_types_criteria) || {};
  }

  if (cleaned.scoring_hints) {
    cleaned.scoring_hints = cleanValue(cleaned.scoring_hints) || {};
  }

  return cleaned;
}
