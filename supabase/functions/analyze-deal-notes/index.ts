import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeStates, extractStatesFromText, mergeStates } from '../_shared/geography.ts';
import { buildPriorityUpdates, updateExtractionSources } from '../_shared/source-priority.ts';
import { isPlaceholder, VALID_LISTING_UPDATE_KEYS } from '../_shared/deal-extraction.ts';
import {
  callGeminiWithRetry,
  GEMINI_API_URL,
  getGeminiHeaders,
  DEFAULT_GEMINI_MODEL,
  getGeminiApiKey,
} from '../_shared/ai-providers.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

// Pre-extraction regex patterns per spec
const REVENUE_PATTERNS = [
  /~?\$\s*([\d,.]+)\s*(M|MM|m|million|mil|K|k|thousand)/i,
  /revenue[:\s\-–—]+~?\$?\s*([\d,.]+)\s*(M|MM|m|million|mil|K|k|thousand)?/i,
  /revenue\s+(?:of|is|at|around|approximately|about|~)\s+~?\$?\s*([\d,.]+)\s*(M|MM|m|million|mil|K|k|thousand)?/i,
  /([\d,.]+)\s*(M|MM|m|million|mil|K|k|thousand)\s*(?:in\s+)?(?:revenue|sales)/i,
  /top\s*line[:\s\-–—]+~?\$?\s*([\d,.]+)\s*(M|MM|m|million|mil|K|k|thousand)?/i,
  /annual\s+revenue[:\s\-–—]+~?\$?\s*([\d,.]+)\s*(M|MM|m|million|mil|K|k|thousand)?/i,
];

const EBITDA_PATTERNS = [
  /EBITDA[:\s\-–—]+~?\$?\s*([\d,.]+)\s*(K|k|M|MM|m|thousand|million)?/i,
  /~?\$\s*([\d,.]+)\s*(K|k|M|MM|m|thousand|million|mil)?\s*EBITDA/i,
  /cash\s*flow[:\s\-–—]+~?\$?\s*([\d,.]+)\s*(K|k|M|MM|m|thousand|million)?/i,
  /SDE[:\s\-–—]+~?\$?\s*([\d,.]+)\s*(K|k|M|MM|m|thousand|million)?/i,
  /owner.?s?\s*(?:cash|earnings)[:\s\-–—]+~?\$?\s*([\d,.]+)\s*(K|k|M|MM|m|thousand|million)?/i,
];

const MARGIN_PATTERNS = [
  /([\d.]+)\s*%\s*(?:EBITDA\s*)?margin/i,
  /margin[:\s]+([\d.]+)\s*%/i,
  /run(?:ning|s)?\s+(?:at\s+)?(?:about\s+)?([\d.]+)\s*%\s*margin/i,
];

const EMPLOYEE_PATTERNS = [
  /([\d,]+)\s*(?:full[- ]?time\s*)?employees/i,
  /headcount[:\s]+([\d,]+)/i,
  /team\s*(?:of\s*)?([\d,]+)/i,
  /([\d,]+)\s*FTEs?/i,
];

const LOCATION_PATTERNS = [
  /(\d+)\s+(?:staffed\s+)?locations?/i,
  /(\d+)\s+offices?/i,
  /(\d+)\s+branches?/i,
  /(\d+)\s+stores?/i,
  /(\d+)\s+shops?/i,
  /(\d+)\s+facilities/i,
  /operate\s+out\s+of\s+(\d+)/i,
  /(\d+)\s+sites?\s+across/i,
];

function parseNumberValue(match: string, multiplier?: string): number | null {
  const cleaned = match.replace(/,/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  if (multiplier) {
    const mult = multiplier.toLowerCase();
    if (mult === 'm' || mult === 'mm' || mult === 'million' || mult === 'mil') {
      return num * 1000000;
    }
    if (mult === 'k' || mult === 'thousand') {
      return num * 1000;
    }
  }

  // Without an explicit multiplier, only assume millions for values that look
  // like shorthand (e.g., "2.5" or "12" meaning $2.5M or $12M).
  // Values >= 100 without a multiplier are ambiguous — could be $800 literal
  // or $800K shorthand — so return them as-is and let the threshold filter decide.
  if (!multiplier && num > 0 && num < 100) {
    return num * 1000000;
  }

  return num;
}

function extractWithRegex(text: string): {
  revenue?: number;
  ebitda?: number;
  ebitda_margin?: number;
  full_time_employees?: number;
  geographic_states?: string[];
  number_of_locations?: number;
} {
  const result: {
    revenue?: number;
    ebitda?: number;
    ebitda_margin?: number;
    full_time_employees?: number;
    geographic_states?: string[];
    number_of_locations?: number;
  } = {};

  // Extract revenue
  for (const pattern of REVENUE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const value = parseNumberValue(match[1], match[2]);
      if (value && value > 100000) {
        // Minimum threshold
        result.revenue = value;
        break;
      }
    }
  }

  // Extract EBITDA
  for (const pattern of EBITDA_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const value = parseNumberValue(match[1], match[2]);
      if (value && value > 10000) {
        // Minimum threshold
        result.ebitda = value;
        break;
      }
    }
  }

  // Extract margin
  for (const pattern of MARGIN_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const margin = parseFloat(match[1]);
      if (margin > 0 && margin < 100) {
        result.ebitda_margin = margin / 100;
        break;
      }
    }
  }

  // Extract employees
  for (const pattern of EMPLOYEE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const employees = parseInt(match[1].replace(/,/g, ''), 10);
      if (employees > 0 && employees < 100000) {
        result.full_time_employees = employees;
        break;
      }
    }
  }

  // Extract location count per spec
  for (const pattern of LOCATION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count > 0 && count < 1000) {
        result.number_of_locations = count;
        break;
      }
    }
  }

  // Handle "multiple locations" inference per spec
  if (!result.number_of_locations) {
    if (/multiple\s+locations?/i.test(text)) {
      result.number_of_locations = 3;
    } else if (/several\s+locations?/i.test(text)) {
      result.number_of_locations = 4;
    }
  }

  return result;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth: Allow either internal service calls (x-internal-secret) OR valid user JWT
    const internalSecret = req.headers.get('x-internal-secret') || '';
    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';
    const isInternalCall = internalSecret === supabaseKey;

    if (!isInternalCall) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: 'Missing Authorization bearer token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Legacy fallback: allow direct service role bearer
      if (bearer !== supabaseKey) {
        const { data: userData, error: userErr } = await supabase.auth.getUser(bearer);
        if (userErr || !userData?.user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const { dealId, notesText } = await req.json();

    if (!dealId) {
      return new Response(JSON.stringify({ error: 'Missing dealId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch deal data
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

    // Use the explicitly provided notes text, or concatenate all available note fields.
    const notes = notesText || [
      deal.general_notes,
      deal.owner_notes,
      deal.internal_notes,
      deal.owner_response,
      deal.captarget_call_notes,
    ].filter(Boolean).join('\n\n');

    if (!notes || notes.length < 20) {
      return new Response(JSON.stringify({ error: 'No notes content to analyze' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Analyzing notes for deal ${dealId}, length: ${notes.length}`);

    // Step 1: Pre-extraction with regex
    const regexExtracted = extractWithRegex(notes);
    const geographyFromNotes = extractStatesFromText(notes);

    console.log('Regex pre-extraction:', regexExtracted);
    console.log('Geography from notes:', geographyFromNotes);

    // Step 2: AI extraction for complex fields
    // Direct Gemini API
    const geminiApiKey = getGeminiApiKey();

    let aiExtracted: Record<string, unknown> = {};

    if (geminiApiKey) {
      const systemPrompt = `You are an elite M&A analyst extracting EVERY piece of deal intelligence from internal notes, call summaries, and broker memos. Your output directly drives buyer matching and deal scoring — the more detail you extract, the better the matches.

RULES:
1. Extract EXHAUSTIVELY — capture every detail mentioned, no matter how minor. Read word by word.
2. Accuracy over fabrication — never invent data not explicitly stated. But DO capture inferences clearly marked as such.
3. Numbers as raw integers (e.g., 5000000 not "5M").
4. US states as 2-letter codes (e.g., "TX", "AZ").
5. Key quotes must be VERBATIM from the notes — include speaker attribution if available.

DEPTH REQUIREMENTS — Every text field should be 2-5 sentences of rich context, NOT brief labels:
- For services: Describe the full service portfolio, how services interrelate, what drives revenue. Don't just list — explain the business model.
- For service_mix: Include residential vs commercial split, recurring vs project-based, revenue concentration by service line.
- For growth_trajectory: Trend direction with specifics — revenue CAGR, new locations, new service lines, headcount growth, contract wins.
- For financial_notes: Revenue breakdown by segment/location, EBITDA adjustments, add-backs, owner comp, margin trends, seasonality, capex needs.
- For management_depth: Key personnel by role, tenure, capabilities, succession readiness. Is there a #2? Who runs day-to-day?
- For owner_goals: Full context — motivation (retirement, burnout, health, growth), deal type preference, valuation expectations, timeline, emotional factors.
- For customer_types: Specific segments with detail — not just "commercial" but what KIND, any concentration risks, key account details.
- For technology_systems: Specific platforms, ERP, CRM, fleet management, industry-specific software, digital maturity level.`;

      const userPrompt = `Extract ALL deal intelligence from these notes. Be EXHAUSTIVE — every detail matters for buyer matching. Write detailed, contextual descriptions (2-5 sentences each) rather than brief labels.

${notes.substring(0, 15000)}

Use the tool to return structured data.`;

      const toolDef = {
        type: 'function',
        function: {
          name: 'extract_notes_intelligence',
          description: 'Extract comprehensive deal intelligence from internal notes',
          parameters: {
            type: 'object',
            properties: {
              owner_goals: {
                type: 'string',
                description:
                  'Detailed 2-5 sentences: Primary motivation for selling, desired deal type, financial expectations, beyond-money goals (legacy, employees, brand), urgency level. Include verbatim owner quotes where available.',
              },
              ownership_structure: {
                type: 'string',
                description:
                  'Entity type, ownership percentages, family involvement, silent partners, employee equity, trust structures. Include all details mentioned.',
              },
              transition_preferences: {
                type: 'string',
                description:
                  'Detailed 2-3 sentences: Transition timeline, owner role during transition, knowledge transfer readiness, key relationship dependencies, non-compete willingness, whether a #2 is in place.',
              },
              seller_motivation: {
                type: 'string',
                description:
                  'Detailed context on why the seller wants to sell — retirement, burnout, health, growth capital, partner buyout, estate planning. Include urgency signals and emotional factors.',
              },
              special_requirements: {
                type: 'string',
                description:
                  'Deal breakers, must-haves, non-negotiables: valuation floor, employee retention requirements, buyer location/type preferences, earnout preferences, closing timeline constraints.',
              },
              timeline_notes: {
                type: 'string',
                description:
                  'Timeline and urgency details: target close date, competing offers, advisor engagement timeline, tax-driven deadlines.',
              },
              description: {
                type: 'string',
                description:
                  'Business description — 3-5 sentences covering what the company does, business model, market position, competitive advantages, and size indicators. Write for a PE investor scanning in 30 seconds.',
              },
              services: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'List of EVERY specific service offered. Be granular: "fire restoration", "water restoration", "mold remediation" NOT just "restoration". Include sub-services and planned services.',
              },
              service_mix: {
                type: 'string',
                description:
                  'Detailed 2-4 sentences: Revenue breakdown by service line with percentages if stated, residential vs commercial split, recurring vs project-based, in-house vs subcontracted, cross-sell dynamics.',
              },
              industry: {
                type: 'string',
                description:
                  'Primary industry classification (e.g., "Fire & Water Restoration", "Commercial HVAC", "Managed IT Services").',
              },
              customer_types: {
                type: 'string',
                description:
                  'Detailed 2-3 sentences: Specific customer segments with concentration details. Not just "commercial" — what kind? Property managers, insurance companies, government agencies? Key account relationships, repeat business percentage.',
              },
              geographic_states: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'All US states where business operates, has customers, or holds licenses (2-letter codes). Include expansion targets.',
              },
              location: {
                type: 'string',
                description:
                  'Primary location/HQ in "City, ST" format. Use suburb name if mentioned.',
              },
              number_of_locations: {
                type: 'number',
                description:
                  'Total physical locations: offices, shops, warehouses, branches, storage (owned + leased). Home office = 1.',
              },
              revenue: {
                type: 'number',
                description:
                  'Annual revenue as a raw integer (e.g., 2000000 for $2M, 500000 for $500K). Extract from any mention of revenue, sales, top-line, or annual run-rate. Return null if not mentioned.',
              },
              ebitda: {
                type: 'number',
                description:
                  'Annual EBITDA/SDE/cash flow as a raw integer (e.g., 400000 for $400K). Extract from any mention of EBITDA, SDE, discretionary earnings, or cash flow. Return null if not mentioned.',
              },
              full_time_employees: {
                type: 'number',
                description:
                  'Total employee headcount (full-time equivalents). Extract from any mention of employees, team size, headcount, FTEs, or staff.',
              },
              ebitda_margin: {
                type: 'number',
                description:
                  'EBITDA margin as a percentage (e.g., 25 for 25%). Extract from any mention of margin percentage, profitability rate, or "runs at X%". Return null if not mentioned.',
              },
              financial_notes: {
                type: 'string',
                description:
                  'Detailed 3-5 sentences: Revenue breakdown by segment/location, EBITDA adjustments and add-backs, owner compensation details, margin trends, seasonality patterns, capex requirements, working capital needs, debt structure, growth rates with specific numbers.',
              },
              growth_trajectory: {
                type: 'string',
                description:
                  'Detailed 2-3 sentences: Revenue CAGR or trend with specifics, new location openings, service line additions, headcount growth, contract wins, market expansion, pipeline indicators.',
              },
              management_depth: {
                type: 'string',
                description:
                  'Detailed 2-3 sentences: Key personnel by role and tenure, succession readiness, is there a strong #2? Who runs day-to-day operations? What happens if owner leaves? Training/mentoring pipeline.',
              },
              key_risks: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Specific risk factors: owner dependency, customer concentration, key-man risk, regulatory exposure, geographic limitation, technology debt, deferred maintenance, pending litigation, competitive threats.',
              },
              key_quotes: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'VERBATIM notable quotes with speaker attribution. Prioritize quotes about goals, deal expectations, business challenges, and growth plans.',
              },
              growth_drivers: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Specific growth opportunities: geographic expansion targets, new service lines, acquisition candidates, technology investments, untapped customer segments, capacity utilization improvements.',
              },
              real_estate_info: {
                type: 'string',
                description:
                  'Facility details: owned vs leased, square footage, lease terms, facility condition, expansion capacity, recent investments.',
              },
              technology_systems: {
                type: 'string',
                description:
                  'Specific platforms and tools: CRM, ERP, fleet management, scheduling, industry-specific software, customer portals, mobile apps. Note digital maturity level.',
              },
            },
            required: [
              'owner_goals',
              'ownership_structure',
              'transition_preferences',
              'special_requirements',
              'description',
              'services',
              'industry',
              'customer_types',
              'geographic_states',
              'location',
              'number_of_locations',
              'financial_notes',
              'growth_trajectory',
              'management_depth',
              'key_risks',
              'key_quotes',
              'growth_drivers',
            ],
          },
        },
      };

      const requestBody = {
        model: DEFAULT_GEMINI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [toolDef],
        tool_choice: { type: 'function', function: { name: 'extract_notes_intelligence' } },
      };

      const parseToolResponse = (aiData: {
        choices?: {
          message?: {
            tool_calls?: { function?: { arguments?: string | Record<string, unknown> } }[];
          };
        }[];
      }): Record<string, unknown> | null => {
        try {
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            return JSON.parse(
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments),
            );
          }
          return null;
        } catch (e) {
          console.warn(
            '[AI] Failed to parse tool response JSON:',
            e instanceof Error ? e.message : e,
          );
          return null;
        }
      };

      let aiSuccess = false;

      // Attempt 1: Direct Gemini API
      if (geminiApiKey && !aiSuccess) {
        try {
          const aiResponse = await callGeminiWithRetry(
            GEMINI_API_URL,
            getGeminiHeaders(geminiApiKey),
            requestBody,
            90000,
            'Gemini/notes-extract',
          );

          if (aiResponse.ok) {
            const parsed = parseToolResponse(await aiResponse.json());
            if (parsed) {
              aiExtracted = parsed;
              aiSuccess = true;
              console.log('[AI] Direct Gemini succeeded');
            }
          } else {
            const errText = await aiResponse.text();
            console.warn('[AI] Direct Gemini failed:', aiResponse.status, errText.slice(0, 200));
          }
        } catch (e) {
          console.warn('[AI] Direct Gemini error:', e instanceof Error ? e.message : e);
        }
      }

      if (!aiSuccess) {
        console.warn('[AI] All AI providers failed — using regex-only extraction');
      } else {
        console.log(
          'AI extracted fields:',
          Object.keys(aiExtracted).filter((k) => {
            const v = aiExtracted[k];
            return (
              v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
            );
          }),
        );
      }
    }

    // Post-process: key_risks and growth_drivers are JSONB in DB
    // Wrap arrays so they serialize correctly
    if (aiExtracted.key_risks && Array.isArray(aiExtracted.key_risks)) {
      // DB stores as Json, keep as array — Supabase handles serialization
    }
    if (aiExtracted.growth_drivers && Array.isArray(aiExtracted.growth_drivers)) {
      // Same — keep as array
    }

    // Strip empty/null values from AI extraction
    for (const [k, v] of Object.entries(aiExtracted)) {
      if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
        delete aiExtracted[k];
      }
    }

    // Normalize AI ebitda_margin from percentage (25) to decimal (0.25) to match DB format
    if (
      typeof aiExtracted.ebitda_margin === 'number' &&
      (aiExtracted.ebitda_margin as number) > 1
    ) {
      aiExtracted.ebitda_margin = (aiExtracted.ebitda_margin as number) / 100;
    }

    // Merge regex and AI extractions
    const extracted: Record<string, unknown> = {
      ...aiExtracted,
      ...regexExtracted, // Regex takes precedence for numeric values per spec
    };

    // Normalize geographic_states
    if (extracted.geographic_states) {
      extracted.geographic_states = normalizeStates(extracted.geographic_states as string[]);
    }

    // Merge with geography from text
    if (geographyFromNotes.length > 0) {
      extracted.geographic_states = mergeStates(
        extracted.geographic_states as string[] | undefined,
        geographyFromNotes,
      );
    }

    // Filter extracted fields to valid listing columns before priority check
    for (const key of Object.keys(extracted)) {
      if (!VALID_LISTING_UPDATE_KEYS.has(key)) {
        delete extracted[key];
      }
    }

    // Build priority-aware updates
    const { updates, sourceUpdates } = buildPriorityUpdates(
      deal,
      deal.extraction_sources,
      extracted,
      'notes',
      undefined,
      isPlaceholder,
    );

    // Add notes_analyzed_at
    const finalUpdates: Record<string, unknown> = {
      ...updates,
      notes_analyzed_at: new Date().toISOString(),
      extraction_sources: updateExtractionSources(deal.extraction_sources, sourceUpdates),
    };

    // Merge geographic states if both exist
    if (updates.geographic_states && deal.geographic_states?.length > 0) {
      finalUpdates.geographic_states = mergeStates(
        deal.geographic_states,
        updates.geographic_states as string[],
      );
    }

    const { error: updateError } = await supabase
      .from('listings')
      .update(finalUpdates)
      .eq('id', dealId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    const fieldsUpdated = Object.keys(updates);
    console.log(`Updated ${fieldsUpdated.length} fields from notes:`, fieldsUpdated);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Analyzed notes and updated ${fieldsUpdated.length} fields`,
        fieldsUpdated,
        extracted,
        regexFindings: regexExtracted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in analyze-deal-notes:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
