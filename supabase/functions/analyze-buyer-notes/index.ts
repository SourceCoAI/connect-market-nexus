/**
 * EDGE FUNCTION: analyze-buyer-notes
 *
 * PURPOSE:
 *   Extracts structured buyer investment criteria from general notes using
 *   regex pre-extraction + Gemini AI, then writes to the buyers table with
 *   source priority enforcement (source = 'notes', priority 80).
 *
 * TRIGGERS:
 *   HTTP POST request from BuyerNotesSection "Analyze Notes" button
 *   Body: { buyerId: string, notesText: string }
 *
 * DATABASE TABLES TOUCHED:
 *   READ:  buyers (existing record + extraction_sources)
 *   WRITE: buyers (structured criteria fields)
 *
 * LAST UPDATED: 2026-03-06
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeStates, extractStatesFromText } from "../_shared/geography.ts";
import { buildPriorityUpdates, updateExtractionSources } from "../_shared/source-priority.ts";
import { isPlaceholder } from "../_shared/deal-extraction.ts";
import { VALID_BUYER_COLUMNS } from "../_shared/buyer-extraction.ts";
import { callGeminiWithRetry, GEMINI_API_URL, getGeminiHeaders, DEFAULT_GEMINI_MODEL } from "../_shared/ai-providers.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

// Regex patterns for buyer-relevant financial data in notes
const REVENUE_PATTERNS = [
  /revenue[:\s]+~?\$?\s*([\d,.]+)\s*(M|MM|m|million|mil)?/i,
  /~?\$\s*([\d,.]+)\s*(M|MM|m|million|mil)\s*(?:in\s+)?(?:revenue|sales)/i,
  /([\d,.]+)\s*(M|MM|million)\s*(?:in\s+)?(?:revenue|sales)/i,
  /target(?:ing)?\s+~?\$?\s*([\d,.]+)\s*(M|MM|m|million|mil)?\s*(?:revenue|companies)/i,
];

const EBITDA_PATTERNS = [
  /EBITDA[:\s]+~?\$?\s*([\d,.]+)\s*(K|k|M|MM|m|thousand|million)?/i,
  /~?\$\s*([\d,.]+)\s*(K|k|M|MM)?\s*EBITDA/i,
  /cash\s*flow[:\s]+~?\$?\s*([\d,.]+)\s*(K|k|M|MM|m|thousand|million)?/i,
  /SDE[:\s]+~?\$?\s*([\d,.]+)\s*(K|k|M|MM|m|thousand|million)?/i,
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

  if (num < 1000) {
    return num * 1000000;
  }

  return num;
}

function extractWithRegex(text: string): {
  target_revenue_min?: number;
  target_ebitda_min?: number;
} {
  const result: { target_revenue_min?: number; target_ebitda_min?: number } = {};

  for (const pattern of REVENUE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const value = parseNumberValue(match[1], match[2]);
      if (value && value > 100000) {
        result.target_revenue_min = value;
        break;
      }
    }
  }

  for (const pattern of EBITDA_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const value = parseNumberValue(match[1], match[2]);
      if (value && value > 10000) {
        result.target_ebitda_min = value;
        break;
      }
    }
  }

  return result;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const internalSecret = req.headers.get('x-internal-secret') || '';
    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';
    const isInternalCall = internalSecret === supabaseKey;

    if (!isInternalCall) {
      if (!bearer) {
        return new Response(
          JSON.stringify({ error: 'Missing Authorization bearer token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (bearer !== supabaseKey) {
        const { data: userData, error: userErr } = await supabase.auth.getUser(bearer);
        if (userErr || !userData?.user) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    const { buyerId, notesText } = await req.json();

    if (!buyerId) {
      return new Response(
        JSON.stringify({ error: 'Missing buyerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch existing buyer
    const { data: buyer, error: buyerError } = await supabase
      .from('buyers')
      .select('*, extraction_sources')
      .eq('id', buyerId)
      .single();

    if (buyerError || !buyer) {
      return new Response(
        JSON.stringify({ error: 'Buyer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const notes = notesText || buyer.notes || '';

    if (!notes || notes.length < 20) {
      return new Response(
        JSON.stringify({ error: 'No notes content to analyze (minimum 20 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[analyze-buyer-notes] Analyzing notes for buyer ${buyerId}, length: ${notes.length}`);

    // Step 1: Regex pre-extraction
    const regexExtracted = extractWithRegex(notes);
    const geographyFromNotes = extractStatesFromText(notes);
    console.log('[analyze-buyer-notes] Regex:', regexExtracted, 'Geography:', geographyFromNotes);

    // Step 2: AI extraction
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    let aiExtracted: Record<string, unknown> = {};

    if (geminiApiKey || lovableApiKey) {
      const systemPrompt = `You are an elite M&A analyst extracting buyer investment criteria from internal notes, call summaries, and broker memos. Extract EVERY detail about what this buyer is looking for in an acquisition target.

RULES:
1. Extract EXHAUSTIVELY — capture every detail about the buyer's acquisition criteria.
2. Accuracy over fabrication — never invent data not explicitly stated.
3. Numbers as raw integers (e.g., 5000000 not "5M").
4. US states as 2-letter codes (e.g., "TX", "AZ").
5. Services should be specific and granular.`;

      const userPrompt = `Extract ALL buyer investment criteria from these notes. Focus on what the buyer is looking for in acquisition targets — services, geography, deal size, timeline, thesis.

${notes.substring(0, 15000)}

Use the tool to return structured data.`;

      const toolDef = {
        type: 'function',
        function: {
          name: 'extract_buyer_criteria',
          description: 'Extract structured buyer investment criteria from notes',
          parameters: {
            type: 'object',
            properties: {
              thesis_summary: { type: 'string', description: 'Investment thesis: 2-5 sentences describing what this buyer is looking for, why, and their strategic rationale.' },
              target_services: { type: 'array', items: { type: 'string' }, description: 'Specific services the buyer targets (e.g., "fire restoration", "commercial HVAC", "pest control"). Be granular.' },
              target_geographies: { type: 'array', items: { type: 'string' }, description: 'Target US states as 2-letter codes. Include all mentioned states and expansion targets.' },
              target_revenue_min: { type: 'number', description: 'Minimum target revenue as raw integer (e.g., 5000000 for $5M). Null if not mentioned.' },
              target_revenue_max: { type: 'number', description: 'Maximum target revenue as raw integer. Null if not mentioned.' },
              target_ebitda_min: { type: 'number', description: 'Minimum target EBITDA as raw integer. Null if not mentioned.' },
              target_ebitda_max: { type: 'number', description: 'Maximum target EBITDA as raw integer. Null if not mentioned.' },
              acquisition_timeline: { type: 'string', description: 'Timeline for acquisitions: "immediate", "1-3 months", "3-6 months", "6-12 months", "12+ months", or specific details.' },
              geographic_exclusions: { type: 'array', items: { type: 'string' }, description: 'States or regions the buyer explicitly wants to avoid.' },
              acquisition_appetite: { type: 'string', description: 'How active is the buyer? "very_active", "active", "selective", "opportunistic".' },
            },
            required: ['thesis_summary', 'target_services', 'target_geographies'],
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
        tool_choice: { type: 'function', function: { name: 'extract_buyer_criteria' } },
      };

      const parseToolResponse = (aiData: { choices?: { message?: { tool_calls?: { function?: { arguments?: string | Record<string, unknown> } }[] } }[] }): Record<string, unknown> | null => {
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          return JSON.parse(typeof toolCall.function.arguments === 'string' ? toolCall.function.arguments : JSON.stringify(toolCall.function.arguments));
        }
        return null;
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
            'Gemini/buyer-notes-extract'
          );
          if (aiResponse.ok) {
            const parsed = parseToolResponse(await aiResponse.json());
            if (parsed) {
              aiExtracted = parsed;
              aiSuccess = true;
              console.log('[AI] Direct Gemini succeeded for buyer notes');
            }
          } else {
            const errText = await aiResponse.text();
            console.warn('[AI] Direct Gemini failed:', aiResponse.status, errText.slice(0, 200));
          }
        } catch (e) {
          console.warn('[AI] Direct Gemini error:', e instanceof Error ? e.message : e);
        }
      }

      // Attempt 2: Lovable AI Gateway fallback
      if (!aiSuccess && lovableApiKey) {
        try {
          console.log('[AI] Falling back to Lovable AI Gateway...');
          const gatewayBody = { ...requestBody, model: 'google/gemini-2.5-flash' };
          const aiResponse = await callGeminiWithRetry(
            'https://ai.gateway.lovable.dev/v1/chat/completions',
            { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
            gatewayBody,
            90000,
            'LovableAI/buyer-notes-extract'
          );
          if (aiResponse.ok) {
            const parsed = parseToolResponse(await aiResponse.json());
            if (parsed) {
              aiExtracted = parsed;
              aiSuccess = true;
              console.log('[AI] Lovable AI Gateway succeeded for buyer notes');
            }
          } else {
            const errText = await aiResponse.text();
            console.error('[AI] Lovable AI Gateway failed:', aiResponse.status, errText.slice(0, 200));
          }
        } catch (e) {
          console.error('[AI] Lovable AI Gateway error:', e instanceof Error ? e.message : e);
        }
      }

      if (!aiSuccess) {
        console.warn('[AI] All AI providers failed — using regex-only extraction for buyer notes');
      }
    }

    // Strip empty/null values
    for (const [k, v] of Object.entries(aiExtracted)) {
      if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
        delete aiExtracted[k];
      }
    }

    // Merge regex and AI extractions (regex takes precedence for numeric values)
    const extracted: Record<string, unknown> = {
      ...aiExtracted,
      ...regexExtracted,
    };

    // Normalize geographic data
    if (extracted.target_geographies) {
      extracted.target_geographies = normalizeStates(extracted.target_geographies as string[]);
    }
    if (geographyFromNotes.length > 0) {
      const existing = (extracted.target_geographies as string[] | undefined) || [];
      const merged = [...new Set([...existing, ...geographyFromNotes])];
      extracted.target_geographies = merged;
    }

    // Filter extracted fields to valid buyer columns before priority check
    for (const key of Object.keys(extracted)) {
      if (!VALID_BUYER_COLUMNS.has(key)) {
        delete extracted[key];
      }
    }

    // Build priority-aware updates (source = 'notes', priority 80)
    const { updates, sourceUpdates, rejected } = buildPriorityUpdates(
      buyer,
      buyer.extraction_sources,
      extracted,
      'notes',
      undefined,
      isPlaceholder,
    );

    const finalUpdates: Record<string, unknown> = {
      ...updates,
      notes_analyzed_at: new Date().toISOString(),
      extraction_sources: updateExtractionSources(buyer.extraction_sources, sourceUpdates),
    };

    const { error: updateError } = await supabase
      .from('buyers')
      .update(finalUpdates)
      .eq('id', buyerId);

    if (updateError) {
      console.error('[analyze-buyer-notes] Update error:', updateError);
      throw updateError;
    }

    const fieldsUpdated = Object.keys(updates);
    console.log(`[analyze-buyer-notes] Updated ${fieldsUpdated.length} fields:`, fieldsUpdated);
    if (rejected.length > 0) {
      console.log(`[analyze-buyer-notes] ${rejected.length} fields blocked by higher-priority sources:`, rejected);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Analyzed notes and updated ${fieldsUpdated.length} fields`,
        fieldsUpdated,
        blockedFields: rejected,
        extracted,
        regexFindings: regexExtracted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[analyze-buyer-notes] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
