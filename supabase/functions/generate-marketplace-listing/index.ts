/**
 * generate-marketplace-listing: AI-generates a buyer-grade HTML listing description
 * from a completed lead memo.
 *
 * Admin-only. Reads the completed lead memo (single source of truth),
 * transforms it into an anonymized, structured marketplace listing via Claude.
 * Returns both markdown and HTML (for TipTap editor).
 *
 * Raw Data -> generate-lead-memo -> Lead Memo Text
 * Lead Memo Text -> generate-marketplace-listing -> HTML Listing Description
 *
 * POST body:
 *   - deal_id: UUID (required)
 *   - listing_id: UUID (optional — if provided, updates that listing row)
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

// ─── Types ───

interface MemoSection {
  key: string;
  title: string;
  content: string;
}

interface MemoContent {
  sections: MemoSection[];
  memo_type: string;
  branding: string;
  generated_at: string;
  company_name: string;
  company_address: string;
  company_website: string;
  company_phone: string;
}

// ─── Validation ───

function validateListing(
  text: string,
  companyName: string,
  ownerName: string,
  leadMemoCity: string | null,
  employeeNames: string[],
): { pass: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- ANONYMITY CHECKS ---

  if (
    companyName &&
    new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)
  ) {
    errors.push(`ANONYMITY BREACH: Company name "${companyName}" found in listing`);
  }

  if (ownerName) {
    const nameParts = ownerName.split(' ').filter((p) => p.length > 2);
    for (const part of nameParts) {
      if (new RegExp(`\\b${part}\\b`, 'i').test(text)) {
        errors.push(`ANONYMITY BREACH: Owner name part "${part}" found`);
      }
    }
  }

  for (const name of employeeNames) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) {
      errors.push(`ANONYMITY BREACH: Employee name "${name}" found`);
    }
  }

  if (leadMemoCity && new RegExp(`\\b${leadMemoCity}\\b`, 'i').test(text)) {
    errors.push(`ANONYMITY BREACH: City "${leadMemoCity}" found`);
  }

  const states = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
    'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'West Virginia', 'Wisconsin', 'Wyoming',
  ];
  for (const state of states) {
    if (new RegExp(`\\b${state}\\b`, 'i').test(text)) {
      errors.push(`ANONYMITY BREACH: State "${state}" not converted to region`);
    }
  }

  // --- STRUCTURE CHECKS ---

  if (/not provided|not stated|not confirmed|not discussed|not yet provided/i.test(text)) {
    errors.push('Contains banned placeholder language');
  }

  if (/information not yet provided/i.test(text)) {
    errors.push('Contains INFORMATION NOT YET PROVIDED section');
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 600) errors.push(`Exceeds 600 word limit (${wordCount} words)`);

  if (!/## BUSINESS OVERVIEW/i.test(text)) errors.push('Missing BUSINESS OVERVIEW section');

  const allowed = [
    'BUSINESS OVERVIEW',
    'DEAL SNAPSHOT',
    'KEY FACTS',
    'GROWTH CONTEXT',
    'OWNER OBJECTIVES',
  ];
  const headers = text.match(/^## .+$/gm) || [];
  for (const h of headers) {
    const title = h.replace('## ', '').trim().toUpperCase();
    if (!allowed.includes(title)) errors.push(`Unexpected section: "${h}"`);
  }

  // --- WARNINGS ---

  if (wordCount < 150) warnings.push(`Only ${wordCount} words`);

  const banned = [
    'robust', 'impressive', 'attractive', 'compelling', 'well-positioned',
    'best-in-class', 'world-class', 'industry-leading', 'turnkey', 'synergies',
    'uniquely positioned', 'market leader', 'poised for growth',
  ];
  const found = banned.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
  if (found.length) warnings.push(`Banned words: ${found.join(', ')}`);

  return { pass: errors.length === 0, errors, warnings };
}

// ─── Helper: extract names from lead memo text ───

function extractEmployeeNames(leadMemoText: string): string[] {
  const names: string[] = [];
  const mgmtSection = leadMemoText.match(/## MANAGEMENT AND STAFFING[\s\S]*?(?=## [A-Z]|$)/i);
  if (mgmtSection) {
    const namePattern = /[-\u2022*]\s*\*?\*?([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g;
    let match;
    while ((match = namePattern.exec(mgmtSection[0])) !== null) {
      names.push(match[1]);
    }
  }
  return names;
}

function extractCities(leadMemoText: string): string[] {
  const cities: string[] = [];
  const cityPattern =
    /(?:in|headquartered in|locations? in|based in|operating in)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g;
  let match;
  while ((match = cityPattern.exec(leadMemoText)) !== null) {
    const candidate = match[1];
    const nonCities = [
      'The', 'This', 'That', 'New', 'North', 'South', 'East', 'West',
      'Company', 'Business',
    ];
    if (!nonCities.includes(candidate)) {
      cities.push(candidate);
    }
  }
  return [...new Set(cities)];
}

// ─── Post-processing: strip leaked state names and location-identifying patterns ───

const STATE_NAMES: Record<string, string> = {
  'Alabama': 'Southeast', 'Alaska': 'Northwest', 'Arizona': 'Mountain West',
  'Arkansas': 'South Central', 'California': 'West Coast', 'Colorado': 'Mountain West',
  'Connecticut': 'New England', 'Delaware': 'Mid-Atlantic', 'Florida': 'Southeast',
  'Georgia': 'Southeast', 'Hawaii': 'Pacific', 'Idaho': 'Mountain West',
  'Illinois': 'Midwest', 'Indiana': 'Midwest', 'Iowa': 'Midwest',
  'Kansas': 'Midwest', 'Kentucky': 'Southeast', 'Louisiana': 'South Central',
  'Maine': 'New England', 'Maryland': 'Mid-Atlantic', 'Massachusetts': 'New England',
  'Michigan': 'Midwest', 'Minnesota': 'Midwest', 'Mississippi': 'Southeast',
  'Missouri': 'Midwest', 'Montana': 'Mountain West', 'Nebraska': 'Midwest',
  'Nevada': 'Mountain West', 'New Hampshire': 'New England', 'New Jersey': 'Mid-Atlantic',
  'New Mexico': 'Mountain West', 'New York': 'Mid-Atlantic', 'North Carolina': 'Southeast',
  'North Dakota': 'Midwest', 'Ohio': 'Midwest', 'Oklahoma': 'South Central',
  'Oregon': 'West Coast', 'Pennsylvania': 'Mid-Atlantic', 'Rhode Island': 'New England',
  'South Carolina': 'Southeast', 'South Dakota': 'Midwest', 'Tennessee': 'Southeast',
  'Texas': 'South Central', 'Utah': 'Mountain West', 'Vermont': 'New England',
  'Virginia': 'Southeast', 'Washington': 'West Coast', 'West Virginia': 'Mid-Atlantic',
  'Wisconsin': 'Midwest', 'Wyoming': 'Mountain West',
};

function sanitizeAnonymityBreaches(text: string): string {
  let result = text;

  // Replace full state names with regional descriptors
  for (const [state, region] of Object.entries(STATE_NAMES)) {
    const escaped = state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), region);
  }

  // Replace "{State}-market" patterns (e.g. "Arizona-market" -> "regional")
  // Handle state abbreviation patterns too
  const stateAbbrevs: Record<string, string> = {
    'AL': 'Southeast', 'AK': 'Northwest', 'AZ': 'Mountain West', 'AR': 'South Central',
    'CA': 'West Coast', 'CO': 'Mountain West', 'CT': 'New England', 'DE': 'Mid-Atlantic',
    'FL': 'Southeast', 'GA': 'Southeast', 'HI': 'Pacific', 'ID': 'Mountain West',
    'IL': 'Midwest', 'IN': 'Midwest', 'IA': 'Midwest', 'KS': 'Midwest',
    'KY': 'Southeast', 'LA': 'South Central', 'ME': 'New England', 'MD': 'Mid-Atlantic',
    'MA': 'New England', 'MI': 'Midwest', 'MN': 'Midwest', 'MS': 'Southeast',
    'MO': 'Midwest', 'MT': 'Mountain West', 'NE': 'Midwest', 'NV': 'Mountain West',
    'NH': 'New England', 'NJ': 'Mid-Atlantic', 'NM': 'Mountain West', 'NY': 'Mid-Atlantic',
    'NC': 'Southeast', 'ND': 'Midwest', 'OH': 'Midwest', 'OK': 'South Central',
    'OR': 'West Coast', 'PA': 'Mid-Atlantic', 'RI': 'New England', 'SC': 'Southeast',
    'SD': 'Midwest', 'TN': 'Southeast', 'TX': 'South Central', 'UT': 'Mountain West',
    'VT': 'New England', 'VA': 'Southeast', 'WA': 'West Coast', 'WV': 'Mid-Atlantic',
    'WI': 'Midwest', 'WY': 'Mountain West',
  };

  // Replace specific location counts per region (e.g. "Two South Central locations" -> "several locations in one region")
  // Per-region counts combined with region names can narrow down the specific business
  const regionNames = 'South Central|Southeast|Midwest|Mid-Atlantic|West Coast|Mountain West|New England|Pacific|Northwest';
  result = result.replace(
    new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(${regionNames})\\s+(location|store|shop|office|branch|site|facilit)`, 'gi'),
    'several $3',
  );

  // Replace "both {Region} locations" pattern
  result = result.replace(
    new RegExp(`\\bboth\\s+(${regionNames})\\s+(location|store|shop|office|branch|site|facilit)`, 'gi'),
    'the $2',
  );

  return result;
}

// ─── Markdown to HTML ───

function markdownToHtml(markdown: string): string {
  let html = '';
  const lines = markdown.split('\n');
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        html += '</ul>\n';
        inList = false;
      }
      continue;
    }

    // H2 headers
    if (trimmed.startsWith('## ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      const text = trimmed.replace(/^## /, '').trim();
      html += `<h2>${text}</h2>\n`;
      continue;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) { html += '<ul>\n'; inList = true; }
      const text = trimmed.replace(/^[-*] /, '').trim();
      const formatted = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html += `<li>${formatted}</li>\n`;
      continue;
    }

    // Regular paragraph
    if (inList) { html += '</ul>\n'; inList = false; }
    const formatted = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html += `<p>${formatted}</p>\n`;
  }

  if (inList) html += '</ul>\n';
  return html.trim();
}

// ─── Format helpers ───

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

// ─── Prompts ───

const SYSTEM_PROMPT = `You are a senior analyst at a sell-side M&A advisory firm writing a marketplace listing for a lower-middle market business acquisition opportunity.

Your reader is a PE fund associate or principal, a family office deal professional, or an independent sponsor. They evaluate 20-50 opportunities per week. They will spend 60-90 seconds on this listing before deciding whether to request a connection.

WHAT THIS LISTING MUST DO:
1. Give a qualified buyer enough factual information to assess fit
2. Protect the seller's anonymity completely - zero identifying details
3. Read like it was written by a professional advisor, not generated from notes
4. Be clean, structured, and scannable

WHAT THIS IS NOT:
- Not a marketing document. No adjectives. No hype.
- Not a transcript summary. No conversational language. No "the owner mentioned...", no "during the call...", no "the interviewer asked..."
- Not a placeholder. Every section must contain real content or be omitted entirely.

CORE RULES:
1. ANONYMITY IS ABSOLUTE: No company name, city, state, owner name, employee name, customer name, or any detail that could identify the specific business. When in doubt, generalize.
2. FACTS ONLY: Every claim must come from the provided lead memo. No invented details.
3. OMIT, DON'T APOLOGIZE: If information is not available for a section, omit it entirely. Never write "not provided", "not stated", "not discussed", or any variation. Never note the absence of information.
4. NO CHARACTERIZATION: Use numbers, not adjectives. "16% EBITDA margin" not "strong margins."
5. PROFESSIONAL REGISTER: Write as an analyst briefing a partner. Precise, factual, institutional.
6. NO TRANSCRIPT LANGUAGE: Never use phrases from call transcripts. No "pick up", "sweet deal", "hot market", no colloquial language. No references to interviews, calls, conversations, or discussions. Rewrite all information in formal analyst prose.

ANONYMIZATION RULES:
- COMPANY NAME: Use "the Company" throughout. Never the actual name.
- GEOGRAPHY: Never city or state names. Use regional descriptors:
  TX, OK, AR, LA -> South Central
  FL, GA, NC, SC, VA, TN, AL, MS -> Southeast
  OH, IN, IL, MI, WI -> Midwest
  NY, NJ, PA, MD, DE -> Mid-Atlantic
  CA, WA, OR -> West Coast
  CO, AZ, NV, UT, NM -> Mountain West
  MA, CT, RI, VT, NH, ME -> New England
  Multi-state -> describe as "X-state footprint" or "multi-market"
- NAMES: All personal names removed. Use "the owner," "the General Manager," "a key employee."
- CUSTOMERS: Remove all customer names. Use type descriptors: "a national insurance carrier," "regional fleet operators."
- FINANCIALS: Present as approximate ranges (+/-10%). "$800K EBITDA" -> "~$750K-$850K EBITDA."
- LOCATION COUNTS: Never state specific counts per market or geography. Use "multi-location" or "several locations" instead of "11 locations in [state]."
- TRANSACTION HISTORY: Remove prior transaction details that could identify the seller (e.g., "sold 11 locations in [state]" -> "the owner has prior exit experience").

BANNED LANGUAGE - never use these words:
strong, robust, impressive, attractive, compelling, well-positioned, significant growth opportunity, poised for growth, track record, best-in-class, proven, synergies, uniquely positioned, market leader, healthy, diversified (without data), recession-resistant (without data), scalable (without specifics), turnkey, world-class, industry-leading, notable, solid, substantial, meaningful, considerable, well-established, high-quality, top-tier, premier, differentiated, defensible, low-hanging fruit, runway, tailwinds, fragmented market, blue-chip, mission-critical, sticky revenue, white-space.

OUTPUT FORMAT - return valid markdown with exactly these section headers (## prefix), in this order. Omit GROWTH CONTEXT if no growth opportunities were explicitly stated in the memo.

## BUSINESS OVERVIEW
## DEAL SNAPSHOT
## KEY FACTS
## GROWTH CONTEXT
## OWNER OBJECTIVES

SECTION SPECIFICATIONS:

## BUSINESS OVERVIEW
2-3 sentences maximum. State: what the company does, how it generates revenue, approximate scale, and geography (regional descriptor only). No adjectives. No history. No narrative arc.

Example: "The Company is an automotive maintenance and repair operator with a multi-location footprint across two South Central markets. Revenue is generated through retail consumer repair services, tire installation and sales, and fleet maintenance contracts. The business generates approximately $4.3M-$5.8M in combined annual revenue across all locations."

## DEAL SNAPSHOT
Bullet points only. Use these exact labels:
- Revenue: [range]
- EBITDA / SDE: [range] (note if recast pending)
- EBITDA Margin: [range]
- Locations: [count or approximate]
- Region: [regional descriptor - never city or state]
- Years in Operation: [approximate range]
- Transaction Type: [full buyout / majority sale / etc.]

Only include a line if the data exists in the memo. Do not include a line with "N/A" or "not provided."

## KEY FACTS
3-6 bullet points. Each bullet must be a specific, sourced operational fact. Not characterizations.

Wrong: "The business benefits from significant brand recognition in its local market."
Right: "Store-level management operates independently; the owner reports less than 5 hours per week of active involvement."

Wrong: "Strong growth potential exists in fleet maintenance."
Right: "Fleet maintenance currently represents less than 10% of revenue; the owner has not pursued commercial contracts as a primary channel."

## GROWTH CONTEXT
Only include if the lead memo contains explicit, stated growth opportunities or untapped channels. 2-4 bullet points. Each must reference a specific opportunity mentioned in the memo.

If no growth plans were stated -> omit this section entirely.

## OWNER OBJECTIVES
3-5 bullet points. State the seller's transaction preferences, timeline, transition willingness, and reason for sale exactly as given in the memo. No interpretation.

Example:
- Seeking 100% buyout of all locations; not interested in partial sale or equity rollover
- Post-close transition support available; owner-affiliated individual could remain in a GM capacity
- Recast financials in process; owner indicated completion is imminent
- No asking price stated; owner referenced prior exit at ~10x as a valuation reference point

FINAL CHECK BEFORE RETURNING:
Read every sentence. Ask: "Could an industry professional use this to identify the specific company?" If yes, generalize or remove. Confirm no city, state, company name, or personal name appears anywhere. Confirm no transcript language, colloquialisms, or references to calls/interviews appear.`;

// ─── Main Handler ───

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { deal_id: dealId, listing_id: listingId } = await req.json();

    if (!dealId) {
      return new Response(JSON.stringify({ error: 'deal_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[generate-marketplace-listing] Starting for deal_id=${dealId}, listing_id=${listingId || 'none'}`);

    // Step 1a: Verify Final PDFs exist in data_room_documents for both memo types.
    // The Final PDF is the authoritative, reviewed document — both must be uploaded
    // before a marketplace listing can be generated.
    const { data: finalPdfs } = await supabaseAdmin
      .from('data_room_documents')
      .select('document_category')
      .eq('deal_id', dealId)
      .in('document_category', ['full_memo', 'anonymous_teaser'])
      .eq('status', 'active');

    const hasFinalLeadMemo = finalPdfs?.some((d: { document_category: string }) => d.document_category === 'full_memo');
    const hasFinalTeaser = finalPdfs?.some((d: { document_category: string }) => d.document_category === 'anonymous_teaser');

    if (!hasFinalLeadMemo || !hasFinalTeaser) {
      const missing = [];
      if (!hasFinalLeadMemo) missing.push('Full Lead Memo');
      if (!hasFinalTeaser) missing.push('Anonymous Teaser');
      return new Response(
        JSON.stringify({
          error: `Final PDF missing for: ${missing.join(' and ')}. Upload Final PDFs in the Data Room before generating a marketplace listing.`,
          needs_pdf: true,
          missing_pdfs: missing,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Step 1b: Fetch the lead memo content (draft or completed) — this provides the
    // structured text that the AI uses as input. The Final PDF confirms it was reviewed;
    // the lead_memos row contains the parseable content.
    const { data: leadMemo } = await supabaseAdmin
      .from('lead_memos')
      .select('content, status')
      .eq('deal_id', dealId)
      .eq('memo_type', 'full_memo')
      .in('status', ['completed', 'draft', 'published'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!leadMemo) {
      return new Response(
        JSON.stringify({
          error: 'Lead memo content not found. Generate a Full Lead Memo from the Data Room first.',
          needs_memo: true,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Step 2: Fetch deal record for metadata and validation
    const { data: deal } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', dealId)
      .single();

    if (!deal) {
      return new Response(JSON.stringify({ error: 'Deal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Build lead memo text from sections
    const leadMemoContent = leadMemo.content as MemoContent;
    const leadMemoText = leadMemoContent.sections
      .map((s: MemoSection) => `## ${s.title}\n${s.content}`)
      .join('\n\n');

    // Step 4: Build deal metrics block for the user prompt
    const revenue = deal.revenue ? formatRevenueRange(deal.revenue as number) : null;
    const ebitda = deal.ebitda ? formatRevenueRange(deal.ebitda as number) : null;
    const ebitdaMargin = deal.ebitda_margin
      ? `~${Math.round((deal.ebitda_margin as number) * 0.9)}-${Math.round((deal.ebitda_margin as number) * 1.1)}%`
      : (deal.ebitda && deal.revenue
        ? `~${Math.round(((deal.ebitda as number) / (deal.revenue as number)) * 90)}-${Math.round(((deal.ebitda as number) / (deal.revenue as number)) * 110)}%`
        : null);
    const industry = (deal.industry || deal.category || 'Services') as string;
    const state = (deal.address_state || '') as string;

    const metricsLines = [
      revenue ? `Revenue: ${revenue}` : null,
      ebitda ? `EBITDA: ${ebitda}` : null,
      ebitdaMargin ? `EBITDA Margin: ${ebitdaMargin}` : null,
      `Industry: ${industry}`,
      state ? `Geography: ${state} (use regional descriptor, never the state name)` : null,
    ].filter(Boolean).join('\n');

    const userPrompt = `Generate a marketplace listing description for the following deal.

=== DEAL METRICS (from database) ===
${metricsLines}

=== LEAD MEMO (your primary content source) ===
${leadMemoText}

Apply all anonymization rules strictly. Return markdown only - no preamble, no explanation, no code fences. Start directly with ## BUSINESS OVERVIEW.`;

    console.log(`[generate-marketplace-listing] Calling Claude API for deal_id=${dealId}`);

    // Step 5: Call Claude API
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
      { callerName: 'generate-marketplace-listing', maxRetries: 2 },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    let markdownText = result.content?.[0]?.text;

    if (!markdownText) {
      throw new Error('No content returned from AI');
    }

    // Post-process: strip any state names or location-identifying patterns
    // the AI may have leaked despite instructions
    markdownText = sanitizeAnonymityBreaches(markdownText);

    console.log(`[generate-marketplace-listing] Got AI response, sanitized and validating...`);

    // Step 6: Validate anonymity
    const companyName = (deal.internal_company_name || deal.title || '') as string;
    const ownerName = (deal.main_contact_name || '') as string;
    const leadMemoCity = ((deal.address_city || '') as string) || null;
    const employeeNames = extractEmployeeNames(leadMemoText);
    const extractedCities = extractCities(leadMemoText);

    const validation = validateListing(
      markdownText,
      companyName,
      ownerName,
      leadMemoCity,
      employeeNames,
    );

    for (const city of extractedCities) {
      if (new RegExp(`\\b${city}\\b`, 'i').test(markdownText)) {
        validation.errors.push(`ANONYMITY BREACH: City "${city}" found in listing`);
        validation.pass = false;
      }
    }

    if (!validation.pass) {
      console.warn(`[generate-marketplace-listing] Validation failed:`, validation.errors);
    }

    // Step 6b: Generate an anonymous title from the AI output.
    // Extract key info from the listing to build a clean, anonymized title.
    const stateAbbrevToRegion: Record<string, string> = {
      'AL': 'Southeast', 'AK': 'Northwest', 'AZ': 'Mountain West', 'AR': 'South Central',
      'CA': 'West Coast', 'CO': 'Mountain West', 'CT': 'New England', 'DE': 'Mid-Atlantic',
      'FL': 'Southeast', 'GA': 'Southeast', 'HI': 'Pacific', 'ID': 'Mountain West',
      'IL': 'Midwest', 'IN': 'Midwest', 'IA': 'Midwest', 'KS': 'Great Plains',
      'KY': 'Southeast', 'LA': 'South Central', 'ME': 'New England', 'MD': 'Mid-Atlantic',
      'MA': 'New England', 'MI': 'Midwest', 'MN': 'Great Plains', 'MS': 'Southeast',
      'MO': 'Great Plains', 'MT': 'Mountain West', 'NE': 'Great Plains', 'NV': 'Mountain West',
      'NH': 'New England', 'NJ': 'Mid-Atlantic', 'NM': 'Mountain West', 'NY': 'Mid-Atlantic',
      'NC': 'Southeast', 'ND': 'Great Plains', 'OH': 'Midwest', 'OK': 'South Central',
      'OR': 'West Coast', 'PA': 'Mid-Atlantic', 'RI': 'New England', 'SC': 'Southeast',
      'SD': 'Great Plains', 'TN': 'Southeast', 'TX': 'South Central', 'UT': 'Mountain West',
      'VT': 'New England', 'VA': 'Southeast', 'WA': 'West Coast', 'WV': 'Mid-Atlantic',
      'WI': 'Midwest', 'WY': 'Mountain West',
    };
    const region = state ? (stateAbbrevToRegion[state.toUpperCase()] || '') : '';
    const margin = deal.ebitda && deal.revenue
      ? Math.round(((deal.ebitda as number) / (deal.revenue as number)) * 100)
      : 0;
    const rev = (deal.revenue as number) || 0;
    const titleDescriptor = margin >= 25 ? 'High-Margin'
      : margin >= 15 ? 'Profitable'
      : rev >= 10_000_000 ? 'Scaled'
      : rev >= 5_000_000 ? 'Growth-Stage'
      : 'Established';
    const generatedTitle = region
      ? `${titleDescriptor} ${industry} Business — ${region}`
      : `${titleDescriptor} ${industry} Business`;

    // Step 6c: Extract hero_description from BUSINESS OVERVIEW section.
    // This section is already a clean 2-3 sentence elevator pitch that follows
    // all anonymization rules — perfect as the hero description for cards/pages.
    let heroDescription = '';
    const overviewMatch = markdownText.match(/## BUSINESS OVERVIEW\n([\s\S]*?)(?=\n## |$)/);
    if (overviewMatch) {
      heroDescription = overviewMatch[1]
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/^[-•*]\s*/gm, '')
        .replace(/\n+/g, ' ')
        .trim();
      // Enforce 500 char limit — trim to last complete sentence
      if (heroDescription.length > 500) {
        const trimmed = heroDescription.substring(0, 500);
        const lastPeriod = trimmed.lastIndexOf('.');
        heroDescription = lastPeriod > 100 ? trimmed.substring(0, lastPeriod + 1).trim() : trimmed.trim();
      }
    }

    // Step 7: Convert markdown to HTML
    const descriptionHtml = markdownToHtml(markdownText);

    console.log(`[generate-marketplace-listing] Generated HTML (${descriptionHtml.length} chars), validation pass=${validation.pass}`);

    // Step 8: If listing_id provided, update the listing row
    if (listingId) {
      const listingUpdate: Record<string, unknown> = {
        description_html: descriptionHtml,
        description: markdownText,
        title: generatedTitle,
      };
      if (heroDescription) {
        listingUpdate.hero_description = heroDescription;
      }
      if (region) {
        listingUpdate.location = region;
      }
      const { error: updateError } = await supabaseAdmin
        .from('listings')
        .update(listingUpdate)
        .eq('id', listingId);

      if (updateError) {
        console.error(`[generate-marketplace-listing] Failed to update listing ${listingId}:`, updateError);
      } else {
        console.log(`[generate-marketplace-listing] Updated listing ${listingId}`);
      }
    }

    // Step 9: Log audit event (non-blocking)
    const { error: auditError } = await supabaseAdmin.rpc('log_data_room_event', {
      p_deal_id: dealId,
      p_user_id: auth.userId,
      p_action: 'generate_marketplace_listing',
      p_metadata: {
        listing_id: listingId || null,
        validation_pass: validation.pass,
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        markdown_length: markdownText.length,
        html_length: descriptionHtml.length,
      },
      p_ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      p_user_agent: req.headers.get('user-agent') || null,
    });
    if (auditError) {
      console.error('Audit log failed (non-blocking):', auditError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        title: generatedTitle,
        description_html: descriptionHtml,
        description_markdown: markdownText,
        hero_description: heroDescription || null,
        location: region || null,
        validation,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Generate marketplace listing error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate marketplace listing description',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
