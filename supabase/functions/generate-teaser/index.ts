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
  if (wordCount > 700) errors.push(`Exceeds 700 word limit (${wordCount} words)`);

  if (!/## COMPANY OVERVIEW/i.test(teaserText)) errors.push('Missing COMPANY OVERVIEW section');

  const allowed = [
    'COMPANY OVERVIEW',
    'FINANCIAL SNAPSHOT',
    'SERVICES AND OPERATIONS',
    'OWNERSHIP AND TRANSACTION',
    'MANAGEMENT AND STAFFING',
    'KEY STRUCTURAL NOTES',
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

    // Step 3: Build prompts
    const systemPrompt = `You are a senior analyst at a tech-enabled investment bank preparing a buyer-facing anonymous teaser. Your input is a completed internal lead memo. Your job is to transform it into an anonymized document by applying the rules below.

You are NOT reading raw transcripts. You are NOT summarizing. You are transforming an existing memo. Every fact stays. Every identifier is removed or generalized.

CORE RULES
1. ANONYMITY IS ABSOLUTE: No piece of information that could identify the specific company may appear in the output. When in doubt, generalize.
2. FACTS STAY INTACT: All financial figures, headcounts, operational details, and growth metrics that do not identify the company transfer exactly from the lead memo.
3. NOTHING ADDED: Do not add, invent, or infer any information not in the lead memo. The teaser is a filtered view of the lead memo, not an independent document.
4. OMIT, DON'T APOLOGIZE: If the lead memo is missing data, the teaser is also missing it. Never write "not provided", "not stated", or any variation.
5. NO CHARACTERIZATION: Same rule as the lead memo. No evaluative adjectives. State numbers.

ANONYMIZATION RULES
RULE 1 — COMPANY NAME
Replace the real company name with the Project Name provided in the user prompt. Format: "Project [NAME]" throughout the document.

RULE 2 — GEOGRAPHY
Remove all cities, towns, and metro areas. Convert all states to regions:

ME, NH, VT, MA, RI, CT → New England
NY, NJ, PA → Mid-Atlantic
OH, IN, IL, MI, WI → Midwest
MN, IA, MO, ND, SD, NE, KS → Great Plains
DE, MD, VA, WV, NC, SC, GA, FL → Southeast
KY, TN, AL, MS → South
AR, LA, OK, TX → South Central
MT, ID, WY, CO, NM, AZ, UT, NV → Mountain West
WA, OR, CA, AK, HI → West Coast

If a company spans multiple regions, list all: "operates across the Southeast and Mid-Atlantic."

RULE 3 — PERSONAL NAMES
Remove all names of owners, employees, and individuals. Replace with role titles only.
* Owner name → "the owner"
* Named employees → their role title (e.g., "the General Manager")
* If two people share a title, use "a senior [title]" and "a second [title]"

RULE 4 — CUSTOMERS AND KEY ACCOUNTS
Remove all customer, carrier, and account names. Replace with type descriptions.
* "State Farm" → "a national insurance carrier"
* Multiple named customers of same type → consolidate: "multiple national carriers"

RULE 5 — COMPETITORS
Remove all competitor names. Replace with a description.
* "[Name]" → "a regional competitor" or "a national franchise competitor"

RULE 6 — BUYERS AND PE FIRMS
Remove all buyer and investor names from transaction context.
* "Alpine Investors" → "a private equity firm"
* Deal terms (valuation, structure) CAN stay — just remove the buyer's name.

RULE 7 — PROFESSIONAL ADVISORS
Remove names of attorneys, accountants, and advisors. Replace with role only.
* "[Name] at [Firm]" → "an acquisition attorney"

RULE 8 — CATCH-ALL
After Rules 1–7, do a final pass: could a reader who is an industry expert use ANY remaining detail to identify this company? If yes, generalize it. Examples:
* Unique equipment with a trademarked name → describe the function
* Hyper-specific founding story → keep the year, remove the narrative
* Proprietary process name → describe what it does

FORMAT
Use the same section headers as the lead memo, in the same order:

COMPANY OVERVIEW, FINANCIAL SNAPSHOT, SERVICES AND OPERATIONS, OWNERSHIP AND TRANSACTION, MANAGEMENT AND STAFFING, KEY STRUCTURAL NOTES

Omit sections that have no data after anonymization (except COMPANY OVERVIEW). Target length: 300–600 words. The teaser is shorter than the lead memo — it gives enough for a buyer to decide if they want to sign an NDA, not enough to make an investment decision.

WHAT STAYS THE SAME
* All dollar amounts (revenue, EBITDA, owner comp, add-backs, real estate value)
* All percentages (margins, growth rates, customer concentration)
* Employee headcount totals
* Number of locations
* Service descriptions (without identifying details)
* Founded year
* Transaction type and owner goals
* Real estate details (owned/leased, included in deal)

BANNED LANGUAGE
Same list as the lead memo: strong, robust, impressive, attractive, compelling, well-positioned, significant, best-in-class, world-class, industry-leading, turnkey, synergies, uniquely positioned, market leader, poised for growth, track record, healthy, notable, consistent (as characterization), solid, substantial, meaningful, considerable, well-established, high-quality, top-tier, premier, differentiated, defensible, platform (as characterization), low-hanging fruit, runway, tailwinds, fragmented market, blue-chip, mission-critical, sticky revenue, white-space.`;

    const userPrompt = `Transform the following lead memo into an anonymous teaser.

PROJECT NAME: ${projectName}

=== LEAD MEMO (your only input) === ${leadMemoText}

Apply all anonymization rules. Return as markdown with ## section headers. The output must contain ZERO identifying information: no company name, no city names, no personal names, no customer names, no competitor names, no buyer names.

Verify before returning: search your output for any proper noun that is not the Project Name. If found, anonymize it.`;

    // Step 4: Call Anthropic API
    const response = await fetchWithAutoRetry(
      ANTHROPIC_API_URL,
      {
        method: 'POST',
        headers: getAnthropicHeaders(anthropicApiKey),
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
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
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
