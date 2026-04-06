/**
 * generate-listing-content: AI-generates all marketplace listing content
 * directly from deal data. Does NOT require a completed lead memo.
 *
 * Falls back to generate-marketplace-listing logic when a lead memo exists.
 * When no memo is available, builds context from raw deal fields, enrichment,
 * transcripts, and notes.
 *
 * POST body:
 *   - deal_id: UUID (required) — the listing/deal record ID
 *   - listing_id: UUID (optional) — if provided, updates the listing row
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import {
  ANTHROPIC_API_URL,
  DEFAULT_CLAUDE_MODEL,
  getAnthropicHeaders,
  fetchWithAutoRetry,
} from '../_shared/ai-providers.ts';
import { logAICallCost } from '../_shared/cost-tracker.ts';
import { sanitizeAnonymityBreaches, STATE_NAMES, STATE_ABBREVS } from '../_shared/anonymization.ts';

// ─── Helpers ───

function formatRevenue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatRevenueRange(value: number): string {
  const low = value * 0.9;
  const high = value * 1.1;
  return `~${formatRevenue(low)}-${formatRevenue(high)}`;
}

function markdownToHtml(markdown: string): string {
  let html = '';
  const lines = markdown.split('\n');
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { html += '</ul>\n'; inList = false; }
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      const text = trimmed.replace(/^## /, '').trim();
      html += `<h2>${text}</h2>\n`;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      const text = trimmed.replace(/^### /, '').trim();
      html += `<h3>${text}</h3>\n`;
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) { html += '<ul>\n'; inList = true; }
      const text = trimmed.replace(/^[-*] /, '').trim();
      const formatted = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html += `<li>${formatted}</li>\n`;
      continue;
    }
    if (inList) { html += '</ul>\n'; inList = false; }
    const formatted = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html += `<p>${formatted}</p>\n`;
  }
  if (inList) html += '</ul>\n';
  return html.trim();
}

/** Strip em dashes and en dashes from text */
function stripDashes(text: string): string {
  return text.replace(/\u2014/g, ' - ').replace(/\u2013/g, '-');
}

// ─── System Prompt ───

const SYSTEM_PROMPT = `You are a senior analyst at a sell-side M&A advisory firm writing a marketplace listing for a lower-middle market business acquisition opportunity.

Your reader is a PE fund associate or principal, a family office deal professional, or an independent sponsor. They evaluate 20-50 opportunities per week. They will spend 60-90 seconds on this listing before deciding whether to request a connection.

CRITICAL FORMATTING RULE:
- NEVER use em dashes or en dashes. Use hyphens (-) or commas instead.
- NEVER use the characters \u2014 or \u2013 anywhere in your output.

WHAT THIS LISTING MUST DO:
1. Give a qualified buyer enough factual information to assess fit
2. Protect the seller's anonymity completely - zero identifying details
3. Read like it was written by a professional advisor, not generated from notes

CORE RULES:
1. ANONYMITY IS ABSOLUTE: No company name, city, state, owner name, employee name, customer name, or any detail that could identify the specific business.
2. FACTS ONLY: Every claim must come from the provided data. No invented details.
3. OMIT, DON'T APOLOGIZE: If information is not available, omit the section entirely. Never write "not provided", "not stated", "not discussed", or any variation.
4. NO CHARACTERIZATION: Use numbers, not adjectives. "16% EBITDA margin" not "strong margins."
5. PROFESSIONAL REGISTER: Write as an analyst briefing a partner. Precise, factual, institutional.
6. NO TRANSCRIPT LANGUAGE: No "the owner mentioned", "during the call", no colloquialisms. Formal analyst prose only.
7. RATIONALIZE CONTENT: Only include sections where you have real, substantive data. A shorter, factual listing is better than a padded one. If the data only supports 2-3 sections, write 2-3 sections.

ANONYMIZATION RULES:
- COMPANY NAME: Use "the Company" throughout.
- GEOGRAPHY: Never city or state names. Use regional descriptors:
  TX, OK, AR, LA -> South Central | FL, GA, NC, SC, VA, TN, AL, MS -> Southeast
  OH, IN, IL, MI, WI -> Midwest | NY, NJ, PA, MD, DE -> Mid-Atlantic
  CA, WA, OR -> West Coast | CO, AZ, NV, UT, NM -> Mountain West
  MA, CT, RI, VT, NH, ME -> New England | Multi-state -> "X-state footprint"
- NAMES: All personal names removed. Use "the owner," "the General Manager," etc.
- CUSTOMERS: Remove all customer names. Use type descriptors.
- FINANCIALS: Present as approximate ranges (+/-10%).
- LOCATION COUNTS: Use "multi-location" or "several locations" instead of exact counts per market.

BANNED LANGUAGE - never use these words:
strong, robust, impressive, attractive, compelling, well-positioned, significant growth opportunity, poised for growth, track record, best-in-class, proven, synergies, uniquely positioned, market leader, healthy, diversified (without data), recession-resistant (without data), scalable (without specifics), turnkey, world-class, industry-leading, notable, solid, substantial, meaningful, considerable, well-established, high-quality, top-tier, premier, differentiated, defensible, low-hanging fruit, runway, tailwinds, fragmented market, blue-chip, mission-critical, sticky revenue, white-space.

FORMATTING RULES:
- Use **bold** for all important numbers, dollar amounts, percentages, and key financial terms.
- Use **bold** for key labels in bullet points. Example: **Revenue**: ~$4.3M-$5.8M
- Use bullet points (- prefix) for all list items except BUSINESS OVERVIEW.
- Short, direct sentences. No fluff.

OUTPUT FORMAT - return valid markdown with these section headers (## prefix), in order. Only include sections where you have real data:

## HERO_DESCRIPTION
## BUSINESS OVERVIEW
## DEAL SNAPSHOT
## KEY FACTS
## GROWTH CONTEXT
## OWNER OBJECTIVES

SECTION SPECS:
- HERO_DESCRIPTION: EXACTLY 1-2 sentences, MAXIMUM 280 characters total. This is the card preview buyers see before clicking. Summarize what the business does and its financial scale (revenue range, margin, region). Must NOT repeat the BUSINESS OVERVIEW text verbatim. Think of it as a headline elevator pitch.
- BUSINESS OVERVIEW: 2-3 sentences. What the company does, revenue model, scale, region. This is a DIFFERENT, more detailed narrative than the hero. Do not copy the hero here.
- DEAL SNAPSHOT: Bullet points with bolded labels/values for Revenue, EBITDA, Margin, Locations, Region, Years, Employees.
- KEY FACTS: 4-8 bullets covering service mix, customer profile, competitive dynamics.
- GROWTH CONTEXT: Only include if specific growth opportunities are stated. Bullet points.
- OWNER OBJECTIVES: What the seller wants (full exit, partnership, timeline, transition). Only include if data exists.`;

// ─── Title generation prompt ───

const TITLE_SYSTEM = `Generate an anonymous marketplace listing title for an M&A deal.

Rules:
- Never use em dashes or en dashes. Use hyphens (-) only.
- Never include the company name, city, or state.
- Use regional descriptors for geography.
- Format: "[Descriptor] [Industry] Business - [Region]"
- Descriptor options based on financials: High-Margin, Profitable, Growth-Stage, Scaled, Established
- Keep under 80 characters.
- Return ONLY the title, nothing else.`;

// ─── Main handler ───

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Auth check
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const adminResult = await requireAdmin(req, supabaseAdmin);
    if (adminResult.error) {
      return new Response(
        JSON.stringify({ error: adminResult.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const dealId = body.deal_id;
    const listingId = body.listing_id;

    if (!dealId) {
      return new Response(
        JSON.stringify({ error: 'deal_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[generate-listing-content] Starting for deal_id=${dealId}`);

    // Fetch the deal/listing record
    const { data: deal, error: dealError } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      // Also try deal_pipeline if not found in listings
      const { data: pipelineDeal } = await supabaseAdmin
        .from('deal_pipeline')
        .select('*')
        .eq('id', dealId)
        .single();

      if (!pipelineDeal) {
        return new Response(
          JSON.stringify({ error: 'Deal not found in listings or deal_pipeline' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Use pipeline deal data
      return await generateFromRawData(pipelineDeal, dealId, listingId, anthropicApiKey, supabaseAdmin, corsHeaders);
    }

    // Check if a lead memo exists
    const { data: leadMemo } = await supabaseAdmin
      .from('lead_memos')
      .select('content, status, created_at')
      .eq('deal_id', dealId)
      .eq('memo_type', 'full_memo')
      .in('status', ['completed', 'published'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (leadMemo?.content) {
      console.log(`[generate-listing-content] Found lead memo, using memo-based generation`);
      return await generateFromMemo(deal, leadMemo, dealId, listingId, anthropicApiKey, supabaseAdmin, corsHeaders);
    }

    console.log(`[generate-listing-content] No lead memo found, using raw deal data`);
    return await generateFromRawData(deal, dealId, listingId, anthropicApiKey, supabaseAdmin, corsHeaders);

  } catch (err) {
    console.error('[generate-listing-content] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});

// ─── Generate from lead memo ───

async function generateFromMemo(
  deal: Record<string, unknown>,
  leadMemo: { content: unknown },
  dealId: string,
  listingId: string | undefined,
  anthropicApiKey: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>,
) {
  const content = leadMemo.content as { sections?: Array<{ title: string; content: string }> };
  const leadMemoText = (content.sections || [])
    .map((s) => `## ${s.title}\n${s.content}`)
    .join('\n\n');

  const metricsLines = buildMetricsLines(deal);

  const userPrompt = `Generate a marketplace listing description for the following deal.

=== DEAL METRICS (from database) ===
${metricsLines}

=== LEAD MEMO (your primary content source) ===
${leadMemoText}

Apply all anonymization rules strictly. Return markdown only - no preamble, no explanation, no code fences. Start directly with ## HERO_DESCRIPTION.`;

  return await callAIAndRespond(deal, userPrompt, dealId, listingId, anthropicApiKey, supabaseAdmin, corsHeaders);
}

// ─── Generate from raw deal data ───

async function generateFromRawData(
  deal: Record<string, unknown>,
  dealId: string,
  listingId: string | undefined,
  anthropicApiKey: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>,
) {
  // Gather all available data from the deal record
  const dataPoints: string[] = [];

  // Basic info
  if (deal.description) dataPoints.push(`Description: ${deal.description}`);
  if (deal.executive_summary) dataPoints.push(`Executive Summary: ${deal.executive_summary}`);

  // Financials
  const metricsLines = buildMetricsLines(deal);
  if (metricsLines) dataPoints.push(`Financial Metrics:\n${metricsLines}`);

  // Services and operations
  if (deal.services) dataPoints.push(`Services: ${deal.services}`);
  if (deal.customer_types) dataPoints.push(`Customer Types: ${deal.customer_types}`);
  if (deal.revenue_model) dataPoints.push(`Revenue Model: ${deal.revenue_model}`);
  if (deal.business_model) dataPoints.push(`Business Model: ${deal.business_model}`);
  if (deal.growth_trajectory) dataPoints.push(`Growth Context: ${deal.growth_trajectory}`);
  if (deal.number_of_locations) dataPoints.push(`Locations: ${deal.number_of_locations}`);
  if (deal.geographic_states) {
    const states = Array.isArray(deal.geographic_states) ? deal.geographic_states.join(', ') : deal.geographic_states;
    dataPoints.push(`Geographic States (anonymize to region): ${states}`);
  }

  // Enrichment data
  if (deal.enrichment_data && typeof deal.enrichment_data === 'object') {
    const ed = deal.enrichment_data as Record<string, unknown>;
    if (ed.company_overview) dataPoints.push(`Company Overview: ${ed.company_overview}`);
    if (ed.services_offered) dataPoints.push(`Services Detail: ${JSON.stringify(ed.services_offered)}`);
    if (ed.competitive_advantages) dataPoints.push(`Competitive Advantages: ${JSON.stringify(ed.competitive_advantages)}`);
    if (ed.target_market) dataPoints.push(`Target Market: ${JSON.stringify(ed.target_market)}`);
    if (ed.employee_count) dataPoints.push(`Employees: ${ed.employee_count}`);
  }

  // Internal notes (useful context)
  if (deal.internal_notes) dataPoints.push(`Internal Notes: ${deal.internal_notes}`);
  if (deal.owner_notes) dataPoints.push(`Owner Notes: ${deal.owner_notes}`);

  // Fetch any transcripts
  try {
    const { data: transcripts } = await supabaseAdmin
      .from('call_intelligence')
      .select('call_summary, key_takeaways')
      .eq('deal_id', dealId)
      .limit(3);

    if (transcripts?.length) {
      const transcriptContext = transcripts
        .map((t: { call_summary?: string; key_takeaways?: string[] }) => {
          const parts = [];
          if (t.call_summary) parts.push(t.call_summary);
          if (t.key_takeaways?.length) parts.push(t.key_takeaways.join('; '));
          return parts.join(' ');
        })
        .filter(Boolean)
        .join('\n');
      if (transcriptContext) dataPoints.push(`Call Intelligence:\n${transcriptContext}`);
    }
  } catch { /* ignore */ }

  if (dataPoints.length === 0) {
    return new Response(
      JSON.stringify({
        error: 'Insufficient deal data to generate a listing. Add a description, financial data, or notes first.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const userPrompt = `Generate a marketplace listing description from the following raw deal data. Use ONLY the information provided below. Do not invent or assume any details not explicitly stated.

IMPORTANT: Only include sections where you have real data. If the data is thin, write a shorter listing with fewer sections. A 150-word listing with real facts is better than a 400-word listing with padding.

=== DEAL DATA ===
${dataPoints.join('\n\n')}

Apply all anonymization rules strictly. Return markdown only - no preamble, no explanation, no code fences. Start directly with ## HERO_DESCRIPTION.`;

  return await callAIAndRespond(deal, userPrompt, dealId, listingId, anthropicApiKey, supabaseAdmin, corsHeaders);
}

// ─── Shared AI call + response ───

async function callAIAndRespond(
  deal: Record<string, unknown>,
  userPrompt: string,
  dealId: string,
  listingId: string | undefined,
  anthropicApiKey: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>,
) {
  console.log(`[generate-listing-content] Calling Claude API for deal_id=${dealId}`);

  const response = await fetchWithAutoRetry(
    ANTHROPIC_API_URL,
    {
      method: 'POST',
      headers: getAnthropicHeaders(anthropicApiKey),
      body: JSON.stringify({
        model: DEFAULT_CLAUDE_MODEL,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    },
    { callerName: 'generate-listing-content', maxRetries: 2 },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();

  // Log cost
  if (result.usage) {
    logAICallCost(
      supabaseAdmin,
      'generate-listing-content',
      'anthropic',
      DEFAULT_CLAUDE_MODEL,
      { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens },
      undefined,
      { deal_id: dealId },
    ).catch(console.error);
  }

  let markdownText = result.content?.[0]?.text;
  if (!markdownText) throw new Error('No content returned from AI');

  // Post-process: strip dashes and sanitize
  markdownText = stripDashes(markdownText);
  markdownText = sanitizeAnonymityBreaches(markdownText);

  // Extract hero description from BUSINESS OVERVIEW
  let heroDescription = '';
  const overviewMatch = markdownText.match(/## BUSINESS OVERVIEW\n([\s\S]*?)(?=\n## |$)/);
  if (overviewMatch) {
    heroDescription = overviewMatch[1]
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^[-*]\s*/gm, '')
      .replace(/\n+/g, ' ')
      .trim();
    if (heroDescription.length > 500) {
      const trimmed = heroDescription.substring(0, 500);
      const lastPeriod = trimmed.lastIndexOf('.');
      heroDescription = lastPeriod > 100 ? trimmed.substring(0, lastPeriod + 1).trim() : trimmed.trim();
    }
  }

  // Generate title
  const industry = (deal.industry || deal.category || 'Services') as string;
  const rawState = (deal.address_state || deal.location || '') as string;
  const regionDescriptor = resolveRegion(rawState);
  const margin = deal.ebitda && deal.revenue
    ? Math.round(((deal.ebitda as number) / (deal.revenue as number)) * 100)
    : 0;
  const rev = (deal.revenue || 0) as number;
  const descriptor = margin >= 25 ? 'High-Margin' : margin >= 15 ? 'Profitable' : rev >= 10_000_000 ? 'Scaled' : rev >= 5_000_000 ? 'Growth-Stage' : 'Established';
  const title = regionDescriptor
    ? `${descriptor} ${industry} Business - ${regionDescriptor}`
    : `${descriptor} ${industry} Business`;

  // Convert to HTML
  const descriptionHtml = markdownToHtml(markdownText);

  // Resolve location for form
  const location = regionDescriptor || (deal.location as string) || '';

  console.log(`[generate-listing-content] Generated ${descriptionHtml.length} chars HTML, title="${title}"`);

  // Update listing if ID provided
  if (listingId) {
    const update: Record<string, unknown> = {
      title,
      description_html: descriptionHtml,
      description: markdownText,
    };
    if (heroDescription) update.hero_description = heroDescription;
    if (location) update.location = location;

    const { error: updateError } = await supabaseAdmin
      .from('listings')
      .update(update)
      .eq('id', listingId);

    if (updateError) {
      console.error('[generate-listing-content] Failed to update listing:', updateError);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      title,
      hero_description: heroDescription,
      description_html: descriptionHtml,
      description_markdown: markdownText,
      location,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

// ─── Helpers ───

function buildMetricsLines(deal: Record<string, unknown>): string {
  const revenue = deal.revenue ? formatRevenueRange(deal.revenue as number) : null;
  const ebitda = deal.ebitda ? formatRevenueRange(deal.ebitda as number) : null;
  const ebitdaMargin = deal.ebitda && deal.revenue
    ? `~${Math.round(((deal.ebitda as number) / (deal.revenue as number)) * 90)}-${Math.round(((deal.ebitda as number) / (deal.revenue as number)) * 110)}%`
    : null;
  const industry = (deal.industry || deal.category || 'Services') as string;
  const rawState = (deal.address_state || deal.location || '') as string;
  const regionDescriptor = resolveRegion(rawState);

  return [
    revenue ? `Revenue: ${revenue}` : null,
    ebitda ? `EBITDA: ${ebitda}` : null,
    ebitdaMargin ? `EBITDA Margin: ${ebitdaMargin}` : null,
    `Industry: ${industry}`,
    deal.full_time_employees ? `Employees: ${deal.full_time_employees}` : null,
    deal.number_of_locations ? `Locations: ${deal.number_of_locations}` : null,
    regionDescriptor ? `Geography: ${regionDescriptor} (regional descriptor)` : null,
  ].filter(Boolean).join('\n');
}

function resolveRegion(rawState: string): string {
  if (!rawState) return '';
  // Try abbreviation first, then full name
  return STATE_ABBREVS[rawState.toUpperCase()] || STATE_NAMES[rawState] || rawState;
}
