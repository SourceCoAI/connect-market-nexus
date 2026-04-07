/**
 * EDGE FUNCTION: process-buyer-universe-queue
 *
 * PURPOSE:
 *   Background queue worker that generates buyer universe labels and descriptions
 *   for flagged deals. Reads listing IDs from the global_activity_queue context_json
 *   and processes them sequentially, calling the Gemini AI for each.
 *
 * TRIGGERS:
 *   HTTP POST — invoked by the frontend after registering a major operation,
 *   or auto-started by the global queue drain mechanism.
 *
 * DATABASE TABLES TOUCHED:
 *   READ:  global_activity_queue, listings
 *   WRITE: listings, global_activity_queue
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import {
  updateGlobalQueueProgress,
  completeGlobalQueueOperation,
  isOperationPaused,
} from '../_shared/global-activity-queue.ts';
import {
  callGeminiWithTool,
  DEFAULT_GEMINI_MODEL,
  getGeminiApiKey,
} from '../_shared/ai-providers.ts';

const OPERATION_TYPE = 'buyer_universe_generation' as const;
const MAX_FUNCTION_RUNTIME_MS = 50_000; // 50s — must stay well under the 58s edge function hard-kill limit

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const startedAt = Date.now();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const GEMINI_API_KEY = getGeminiApiKey();
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Find the running operation for this type
    const { data: op } = await supabase
      .from('global_activity_queue')
      .select('id, context_json, completed_items, failed_items, total_items')
      .eq('operation_type', OPERATION_TYPE)
      .eq('status', 'running')
      .limit(1)
      .maybeSingle();

    if (!op) {
      return new Response(
        JSON.stringify({ message: 'No running buyer_universe_generation operation found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const context = op.context_json as Record<string, unknown>;
    const listingIds = (context?.listing_ids as string[]) || [];

    if (listingIds.length === 0) {
      await completeGlobalQueueOperation(supabase, OPERATION_TYPE, 'completed');
      return new Response(JSON.stringify({ message: 'No listing IDs in context' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skip already-processed items (resume support)
    const alreadyProcessed = (op.completed_items || 0) + (op.failed_items || 0);
    const remainingIds = listingIds.slice(alreadyProcessed);

    let processed = 0;

    for (const listingId of remainingIds) {
      // Check time budget
      if (Date.now() - startedAt > MAX_FUNCTION_RUNTIME_MS) {
        // Self-continue: invoke ourselves again to process the rest
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        fetch(`${supabaseUrl}/functions/v1/process-buyer-universe-queue`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            apikey: anonKey || supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ continuation: true }),
        }).catch((err: unknown) => {
          console.warn('[buyer-universe-queue] Continuation trigger failed:', err);
        });
        return new Response(
          JSON.stringify({ message: `Processed ${processed}, continuing in next invocation` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Check if paused
      if (await isOperationPaused(supabase, OPERATION_TYPE)) {
        return new Response(JSON.stringify({ message: 'Operation paused', processed }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        await generateForListing(supabase, listingId, GEMINI_API_KEY);
        await updateGlobalQueueProgress(supabase, OPERATION_TYPE, { completedDelta: 1 });
      } catch (err) {
        console.error(`Failed to generate for listing ${listingId}:`, err);
        await updateGlobalQueueProgress(supabase, OPERATION_TYPE, {
          failedDelta: 1,
          errorEntry: {
            itemId: listingId,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }

      processed++;
    }

    // All done
    await completeGlobalQueueOperation(supabase, OPERATION_TYPE, 'completed');

    return new Response(
      JSON.stringify({ message: `Completed. Processed ${processed} listings.` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('process-buyer-universe-queue error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

/**
 * Generate buyer universe label + description for a single listing.
 * Same logic as the generate-buyer-universe edge function, inlined here
 * so the processor can call it directly without an HTTP round-trip.
 */
async function generateForListing(
  supabase: ReturnType<typeof createClient>,
  listingId: string,
  geminiApiKey: string,
): Promise<void> {
  const { data: listing, error: fetchError } = await supabase
    .from('listings')
    .select(
      'id, title, internal_company_name, website, industry, category, categories, ' +
        'description, executive_summary, hero_description, end_market_description, ' +
        'address_state, address_city, geographic_states, ' +
        'revenue, ebitda, ebitda_margin, business_model, services, service_mix, ' +
        'full_time_employees, number_of_locations, founded_year, ' +
        'buyer_universe_label, buyer_universe_description, buyer_universe_generated_at',
    )
    .eq('id', listingId)
    .single();

  if (fetchError || !listing) {
    throw new Error(`Listing ${listingId} not found`);
  }

  // Skip if already generated
  if (listing.buyer_universe_generated_at) {
    return;
  }

  // Build context
  const companyName = listing.internal_company_name || listing.title;
  const contextParts: string[] = [];

  contextParts.push(`Company Name: ${companyName}`);
  if (listing.website) contextParts.push(`Website: ${listing.website}`);
  if (listing.industry) contextParts.push(`Industry: ${listing.industry}`);
  if (listing.category) contextParts.push(`Category: ${listing.category}`);
  if (listing.categories?.length) contextParts.push(`Categories: ${listing.categories.join(', ')}`);
  if (listing.executive_summary)
    contextParts.push(`Executive Summary: ${listing.executive_summary.slice(0, 500)}`);
  if (listing.hero_description) contextParts.push(`Hero Description: ${listing.hero_description}`);
  if (listing.end_market_description)
    contextParts.push(`End Market: ${listing.end_market_description}`);
  if (listing.address_state) contextParts.push(`State: ${listing.address_state}`);
  if (listing.address_city) contextParts.push(`City: ${listing.address_city}`);
  if (listing.geographic_states?.length)
    contextParts.push(`Geographic Coverage: ${listing.geographic_states.join(', ')}`);
  if (listing.revenue) contextParts.push(`Revenue: $${(listing.revenue / 1_000_000).toFixed(1)}M`);
  if (listing.ebitda) contextParts.push(`EBITDA: $${(listing.ebitda / 1_000_000).toFixed(1)}M`);
  if (listing.ebitda_margin) contextParts.push(`EBITDA Margin: ${listing.ebitda_margin}%`);
  if (listing.business_model) contextParts.push(`Business Model: ${listing.business_model}`);
  if (listing.services?.length) contextParts.push(`Services: ${listing.services.join(', ')}`);
  if (listing.service_mix) contextParts.push(`Service Mix: ${listing.service_mix}`);
  if (listing.full_time_employees) contextParts.push(`Employees: ${listing.full_time_employees}`);
  if (listing.number_of_locations) contextParts.push(`Locations: ${listing.number_of_locations}`);
  if (listing.founded_year) contextParts.push(`Founded: ${listing.founded_year}`);

  const companyContext = contextParts.join('\n');

  const systemPrompt = `You are an M&A deal sourcing expert who helps identify buyer universes for acquisition targets. You understand PE platform strategies, add-on acquisition theses, and strategic buyer motivations.

Given information about a company, you must produce two outputs:

1. **buyer_universe_label**: A short label (3-6 words max) identifying the SPECIFIC TYPE of business or service vertical, ending with "Add-On" or occasionally "Platform Target".
   The label must answer: "What exact type of company is this?" — NOT "Where do they operate?" or "How big are they?"

   STRICT RULES:
   - NEVER lead with geography (no "Regional", "Southeast", "Pacific NW", "National", "Midwest", etc.)
   - NEVER use vague filler words like "Services", "Solutions", or "Platform" as the PRIMARY descriptor — the specific trade or product type must come first
   - Focus on the specific trade, product, or service vertical
   - Keep it under 6 words total

   FORMAT: [Specific Service/Product Type] + Add-On  OR  [Specific Service/Product Type] + Platform Target

   GOOD examples:
   - "Window & Door Installation Add-On" (specific trade)
   - "Commercial Fleet Maintenance Add-On" (specific service)
   - "HVAC Services Add-On" (specific trade)
   - "Restoration Services Add-On" (specific vertical — fire/water damage)
   - "Equipment Rental & Supply Add-On" (specific product type)
   - "Commercial Landscaping Add-On" (specific trade)
   - "Last-Mile Logistics Add-On" (specific service model)

   BAD examples (NEVER produce these):
   - "Pacific NW Home Services Add-On" (leads with geography)
   - "Regional Fleet Services Add-On" (leads with geography, vague "Services")
   - "Southeast Mechanical Services Add-On" (leads with geography)
   - "Regional Equipment Rental Platform Add-On" (leads with geography)
   - "Trucking Company" (too generic, missing "Add-On")
   - "Commercial Landscaping Platform Add-On" (unnecessary "Platform")

2. **buyer_universe_description**: Exactly 2 sentences.
   - Sentence 1: What this company specifically does (precise trade/service, not a generic industry tag).
   - Sentence 2: Who would likely acquire them and why (what type of PE firm or strategic buyer, and what acquisition thesis fits).

Be specific about the trade or service vertical. Focus on specialization and deal thesis, not geography.`;

  const tool = {
    type: 'function',
    function: {
      name: 'set_buyer_universe',
      description: 'Set the buyer universe label and description for this deal',
      parameters: {
        type: 'object',
        properties: {
          buyer_universe_label: {
            type: 'string',
            description:
              'Short 3-6 word label identifying the specific service/product type ending with Add-On. Never lead with geography. Example: "Window & Door Installation Add-On"',
          },
          buyer_universe_description: {
            type: 'string',
            description:
              'Exactly 2 sentences: what the company does specifically, then who would acquire and why',
          },
        },
        required: ['buyer_universe_label', 'buyer_universe_description'],
      },
    },
  };

  const result = await callGeminiWithTool(
    systemPrompt,
    `Analyze this company and generate the buyer universe label and description:\n\n${companyContext}`,
    tool,
    geminiApiKey,
    DEFAULT_GEMINI_MODEL,
    20000,
    1024,
  );

  if (result.error) {
    throw new Error(result.error.message || 'AI generation failed');
  }

  const label: string | null = result.data?.buyer_universe_label || null;
  const description: string | null = result.data?.buyer_universe_description || null;

  if (!label) {
    throw new Error('AI failed to generate buyer universe data');
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('listings')
    .update({
      buyer_universe_label: label,
      buyer_universe_description: description,
      buyer_universe_generated_at: now,
    } as never)
    .eq('id', listingId);

  if (updateError) {
    throw new Error(`Failed to store results: ${updateError.message}`);
  }
}
