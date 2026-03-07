/**
 * generate-teaser: AI-generates an anonymous teaser from a completed lead memo.
 *
 * Admin-only. Reads the completed lead memo (single source of truth),
 * transforms it into an anonymized buyer-facing teaser via Claude Sonnet.
 *
 * Raw Data → generate-lead-memo → Lead Memo Text
 * Lead Memo Text → generate-teaser → Anonymous Teaser Text
 *
 * POST body:
 *   - deal_id: UUID
 *   - project_name: optional project codename (default: "Project [Industry]")
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

function validateTeaser(
  teaserText: string,
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
    new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(teaserText)
  ) {
    errors.push(`ANONYMITY BREACH: Company name "${companyName}" found in teaser`);
  }

  if (ownerName) {
    const nameParts = ownerName.split(' ').filter((p) => p.length > 2);
    for (const part of nameParts) {
      if (new RegExp(`\\b${part}\\b`, 'i').test(teaserText)) {
        errors.push(`ANONYMITY BREACH: Owner name part "${part}" found`);
      }
    }
  }

  for (const name of employeeNames) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(teaserText)) {
      errors.push(`ANONYMITY BREACH: Employee name "${name}" found`);
    }
  }

  if (leadMemoCity && new RegExp(`\\b${leadMemoCity}\\b`, 'i').test(teaserText)) {
    errors.push(`ANONYMITY BREACH: City "${leadMemoCity}" found`);
  }

  const states = [
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'Florida',
    'Georgia',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
  ];
  for (const state of states) {
    if (new RegExp(`\\b${state}\\b`, 'i').test(teaserText)) {
      errors.push(`ANONYMITY BREACH: State "${state}" not converted to region`);
    }
  }

  // --- STRUCTURE CHECKS ---

  if (/not provided|not stated|not confirmed|not discussed|not yet provided/i.test(teaserText)) {
    errors.push('Contains banned placeholder language');
  }

  if (/information not yet provided/i.test(teaserText)) {
    errors.push('Contains INFORMATION NOT YET PROVIDED section');
  }

  const wordCount = teaserText.split(/\s+/).filter(Boolean).length;
  if (wordCount > 600) errors.push(`Exceeds 600 word limit (${wordCount} words)`);

  if (!/## BUSINESS OVERVIEW/i.test(teaserText)) errors.push('Missing BUSINESS OVERVIEW section');

  const allowed = [
    'BUSINESS OVERVIEW',
    'DEAL SNAPSHOT',
    'KEY FACTS',
    'GROWTH CONTEXT',
    'OWNER OBJECTIVES',
  ];
  const headers = teaserText.match(/^## .+$/gm) || [];
  for (const h of headers) {
    const title = h.replace('## ', '').trim().toUpperCase();
    if (!allowed.includes(title)) errors.push(`Unexpected section: "${h}"`);
  }

  // --- WARNINGS ---

  if (wordCount < 150) warnings.push(`Only ${wordCount} words`);

  const banned = [
    'robust',
    'impressive',
    'attractive',
    'compelling',
    'well-positioned',
    'best-in-class',
    'world-class',
    'industry-leading',
    'turnkey',
    'synergies',
    'uniquely positioned',
    'market leader',
    'poised for growth',
  ];
  const found = banned.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(teaserText));
  if (found.length) warnings.push(`Banned words: ${found.join(', ')}`);

  return { pass: errors.length === 0, errors, warnings };
}

// ─── Helper: extract names from lead memo text ───

function extractEmployeeNames(leadMemoText: string): string[] {
  const names: string[] = [];
  // Look for patterns like "Name (role)" or "Name, role" in management section
  const mgmtSection = leadMemoText.match(/## MANAGEMENT AND STAFFING[\s\S]*?(?=## [A-Z]|$)/i);
  if (mgmtSection) {
    // Match capitalized multi-word names that appear at the start of bullet points
    const namePattern = /[-•*]\s*\*?\*?([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g;
    let match;
    while ((match = namePattern.exec(mgmtSection[0])) !== null) {
      names.push(match[1]);
    }
  }
  return names;
}

function extractCities(leadMemoText: string): string[] {
  const cities: string[] = [];
  // Common patterns: "in CityName", "headquartered in CityName", "locations in CityName"
  const cityPattern =
    /(?:in|headquartered in|locations? in|based in|operating in)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g;
  let match;
  while ((match = cityPattern.exec(leadMemoText)) !== null) {
    const candidate = match[1];
    // Filter out common non-city words
    const nonCities = [
      'The',
      'This',
      'That',
      'New',
      'North',
      'South',
      'East',
      'West',
      'Company',
      'Business',
    ];
    if (!nonCities.includes(candidate)) {
      cities.push(candidate);
    }
  }
  return [...new Set(cities)];
}

// ─── Markdown parser ───

function parseMarkdownToSections(markdown: string): MemoSection[] {
  const sections: MemoSection[] = [];
  const parts = markdown.split(/^## /gm);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const newlineIdx = trimmed.indexOf('\n');
    if (newlineIdx === -1) continue;
    const title = trimmed.substring(0, newlineIdx).trim();
    const content = trimmed.substring(newlineIdx + 1).trim();
    if (!content) continue;
    const key = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '');
    sections.push({ key, title, content });
  }
  return sections;
}

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
    const { deal_id: dealId, project_name: requestProjectName } = await req.json();

    if (!dealId) {
      return new Response(JSON.stringify({ error: 'deal_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Fetch the completed lead memo — the teaser's ONLY input
    const { data: leadMemo } = await supabaseAdmin
      .from('lead_memos')
      .select('content')
      .eq('deal_id', dealId)
      .eq('memo_type', 'full_memo')
      .eq('status', 'completed')
      .single();

    if (!leadMemo) {
      return new Response(
        JSON.stringify({
          error: 'Lead memo must be generated before creating a teaser.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Step 2: Fetch deal record for identifying info (for validation)
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

    // Build lead memo text from sections
    const leadMemoContent = leadMemo.content as MemoContent;
    const leadMemoText = leadMemoContent.sections
      .map((s: MemoSection) => `## ${s.title}\n${s.content}`)
      .join('\n\n');

    // Resolve project name
    const industry = (deal.industry || deal.category || '') as string;
    const projectName =
      (requestProjectName as string)?.trim() || `Project ${industry || 'Opportunity'}`;

    // Save project_name to the deal record
    if (requestProjectName) {
      await supabaseAdmin
        .from('listings')
        .update({ project_name: requestProjectName })
        .eq('id', dealId);
    }

    // Step 3: Build prompts — uses the UNIFIED teaser prompt (same sections as anonymous_teaser in generate-lead-memo)
    const systemPrompt = `You are a senior analyst at a tech-enabled investment bank writing an anonymous marketplace listing. Your audience is PE firms, family offices, and strategic acquirers in the lower-middle market ($500K-$10M EBITDA range) who evaluate dozens of opportunities per week.

PURPOSE: Create a factual, structured blind profile that gives qualified buyers enough information to determine fit and request a connection — without revealing the company identity. A buyer should read the entire teaser in under 2 minutes.

CORE RULES
1. ANONYMITY IS ABSOLUTE: No piece of information that could identify the specific company may appear in the output. When in doubt, generalize.
2. ONLY STATED FACTS: Every claim must be traceable to the provided data. Replace adjectives with measurable facts.
3. OMIT, DON'T APOLOGIZE: If information is not available, omit the topic entirely. Never write "not provided", "not stated", or any variation.
4. NO CHARACTERIZATION: Do not describe any metric with evaluative adjectives. State the numbers.
5. NO COMPARISONS: Do not compare to industry benchmarks unless the source data contains a specific stated comparison.

FORMAT RULES
* The complete teaser must be 300-500 words. Do not exceed 600 words.
* Use bullet points for all content outside the Business Overview section.
* Business Overview should be 2-3 sentences maximum.
* Include facts in this priority order: (1) financial figures, (2) transaction type and structure, (3) business model and services, (4) management and operations.

ANONYMIZATION RULES
RULE 1 — COMPANY NAME
Use the provided codename only. Never include company name, owner name, or any identifying proper nouns.

RULE 2 — GEOGRAPHY
Never include city or state names. Use regional descriptors only.
ME, NH, VT, MA, RI, CT → New England
NY, NJ, PA → Mid-Atlantic
OH, IN, IL, MI, WI → Midwest
MN, IA, MO, ND, SD, NE, KS → Great Plains
DE, MD, VA, WV, NC, SC, GA, FL → Southeast
KY, TN, AL, MS → South
AR, LA, OK, TX → South Central
MT, ID, WY, CO, NM, AZ, UT, NV → Mountain West
WA, OR, CA, AK, HI → West Coast

RULE 3 — PERSONAL NAMES
Remove all names. Replace with role titles only ("the owner", "the General Manager").

RULE 4 — CUSTOMERS AND KEY ACCOUNTS
Remove all customer names. Replace with type descriptions ("a national insurance carrier", "multiple national hotel chains").

RULE 5 — COMPETITORS
Remove all competitor names. Replace with descriptions ("a regional competitor").

RULE 6 — BUYERS AND PE FIRMS
Remove all buyer/investor names. Deal terms (valuation, structure) CAN stay — just remove the buyer's name.

RULE 7 — PROFESSIONAL ADVISORS
Remove names. Replace with role only ("an acquisition attorney").

RULE 8 — FINANCIALS
Present all financial figures as approximate ranges (+/- 10-15%) to prevent identification through exact numbers.

RULE 9 — CATCH-ALL
After Rules 1-8, do a final anonymity audit. Could an industry expert identify this company from any remaining detail? If yes, generalize it.

SECTIONS — use only these headers, in this order:

BUSINESS OVERVIEW
2-3 sentences. What the company does, how it makes money, approximate scale and geography (regional descriptors only). No adjectives.

DEAL SNAPSHOT
Structured labeled bullet points:
* Revenue: (range, anonymized)
* EBITDA / SDE: (range, anonymized)
* EBITDA Margin: (range)
* Employees: (approximate)
* Region: (no city/state)
* Years in Operation: (approximate range)
* Transaction Type: (majority sale, full sale, etc.)

KEY FACTS
3-5 bullet points. Each must be a specific, sourced fact — not a characterization.
Wrong: "Significant growth opportunity in adjacent markets"
Right: "Owner has not pursued commercial contracts, which represent approximately 40% of the regional market"

GROWTH CONTEXT
Only include if the owner explicitly stated growth plans or untapped opportunities. Bullet points. If nothing was stated, omit this section entirely.

OWNER OBJECTIVES
Transaction preference, timeline, transition willingness, reason for sale. Stated exactly as given.

BANNED LANGUAGE
Never use: strong, robust, impressive, attractive, compelling, well-positioned, significant, poised for growth, track record, best-in-class, proven, synergies, uniquely positioned, market leader, healthy, diversified (without data), recession-resistant (without data), scalable (without specifics), turnkey, world-class, industry-leading, notable, consistent (as characterization), solid, substantial, meaningful, considerable, well-established, high-quality, top-tier, premier, differentiated, defensible, platform (as characterization), low-hanging fruit, runway, tailwinds, fragmented market, blue-chip, mission-critical, sticky revenue, white-space.

FINAL ANONYMITY CHECK: Before returning, re-read every sentence. Confirm no combination of details could identify the business.`;

    const userPrompt = `Transform the following internal lead memo into an anonymous marketplace teaser.

CODENAME: ${projectName}

=== LEAD MEMO (your only input) === ${leadMemoText}

Apply all anonymization rules. Convert all specific financial figures to approximate ranges (+/- 10-15%). Return as markdown with ## headers. Must exactly match: BUSINESS OVERVIEW, DEAL SNAPSHOT, KEY FACTS, GROWTH CONTEXT, OWNER OBJECTIVES. Omit GROWTH CONTEXT if no growth plans were stated.

The output must contain ZERO identifying information: no company name, no city names, no state names, no personal names, no customer names, no competitor names, no buyer names.

Verify before returning: search your output for any proper noun that is not the Codename. If found, anonymize it.`;

    // Step 4: Call Anthropic API
    const response = await fetchWithAutoRetry(
      ANTHROPIC_API_URL,
      {
        method: 'POST',
        headers: getAnthropicHeaders(anthropicApiKey),
        body: JSON.stringify({
          model: DEFAULT_CLAUDE_MODEL,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.2,
          max_tokens: 4096,
        }),
      },
      { callerName: 'generate-teaser', maxRetries: 2 },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const teaserText = result.content?.[0]?.text;

    if (!teaserText) {
      throw new Error('No content returned from AI');
    }

    // Step 5: Gather identifying info for validation
    const companyName = (deal.internal_company_name || deal.title || '') as string;
    const ownerName = (deal.main_contact_name || '') as string;
    const leadMemoCity = ((deal.address_city || '') as string) || null;
    const employeeNames = extractEmployeeNames(leadMemoText);

    // Also extract cities from lead memo text for broader city checking
    const extractedCities = extractCities(leadMemoText);

    // Step 6: Validate the teaser
    const validationResult = validateTeaser(
      teaserText,
      companyName,
      ownerName,
      leadMemoCity,
      employeeNames,
    );

    // Also check extracted cities
    for (const city of extractedCities) {
      if (new RegExp(`\\b${city}\\b`, 'i').test(teaserText)) {
        validationResult.errors.push(`ANONYMITY BREACH: City "${city}" found in teaser`);
        validationResult.pass = false;
      }
    }

    // Parse teaser into sections for storage
    const teaserSections = parseMarkdownToSections(teaserText);

    // Step 7: Save the result
    const teaserContent: MemoContent = {
      sections: teaserSections,
      memo_type: 'anonymous_teaser',
      branding: 'sourceco',
      generated_at: new Date().toISOString(),
      company_name: projectName,
      company_address: '',
      company_website: '',
      company_phone: '',
    };

    const { data: teaser, error: teaserError } = await supabaseAdmin
      .from('lead_memos')
      .insert({
        deal_id: dealId,
        memo_type: 'anonymous_teaser',
        content: teaserContent,
        status: validationResult.pass ? 'completed' : 'failed_validation',
        validation_result: validationResult,
        project_name: projectName,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (teaserError) throw teaserError;

    // Log audit event (non-blocking)
    const { error: auditError } = await supabaseAdmin.rpc('log_data_room_event', {
      p_deal_id: dealId,
      p_user_id: auth.userId,
      p_action: 'generate_teaser',
      p_metadata: {
        memo_id: teaser.id,
        project_name: projectName,
        validation_pass: validationResult.pass,
        validation_errors: validationResult.errors,
        validation_warnings: validationResult.warnings,
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
        teaser,
        validation: validationResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Generate teaser error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate teaser',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
