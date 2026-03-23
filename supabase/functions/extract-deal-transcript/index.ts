import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeStates, mergeStates } from '../_shared/geography.ts';
import { buildPriorityUpdates, updateExtractionSources } from '../_shared/source-priority.ts';
import { isPlaceholder } from '../_shared/deal-extraction.ts';
// Uses Gemini 2.5 Flash (not 2.0) for superior long-context extraction on call transcripts.
// Transcripts are the highest-priority data source (priority 100) and benefit from the newer model.
import { GEMINI_25_FLASH_MODEL } from '../_shared/ai-providers.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface FinancialExtraction {
  value?: number;
  is_inferred?: boolean;
  source_quote?: string;
  inference_method?: string;
}

interface ExtractionResult {
  // Financial (structured per spec)
  revenue?: FinancialExtraction;
  ebitda?: {
    amount?: number;
    margin_percentage?: number;
    is_inferred?: boolean;
    source_quote?: string;
  };
  asking_price?: number;
  financial_notes?: string;
  financial_followup_questions?: string[];

  // Business basics
  location?: string;
  industry?: string;
  website?: string;
  founded_year?: number;

  // Employees
  full_time_employees?: number;
  part_time_employees?: number;

  // Services
  services?: string[];
  service_mix?: string;

  // Geography
  geographic_states?: string[];
  number_of_locations?: number;

  // Owner & Transaction
  owner_goals?: string;
  ownership_structure?: string;
  transition_preferences?: string;
  timeline_notes?: string;
  special_requirements?: string;

  // Customers
  customer_types?: string;
  customer_concentration?: string;
  customer_geography?: string;
  end_market_description?: string;

  // Strategic info
  executive_summary?: string;
  growth_trajectory?: string;
  key_risks?: string;
  technology_systems?: string;
  real_estate_info?: string;

  // Contact info
  main_contact_name?: string;
  main_contact_email?: string;
  main_contact_phone?: string;

  // Metadata
  key_quotes?: string[];
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

    // Auth: Allow either:
    // 1. Internal service calls via x-internal-secret header (matches service role key)
    // 2. End-user calls with a valid Supabase JWT in Authorization header
    const internalSecret = req.headers.get('x-internal-secret') || '';
    const authHeader = req.headers.get('authorization') || '';
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';

    const isInternalCall = internalSecret === supabaseKey;

    if (!isInternalCall) {
      // Not an internal call — require a valid user JWT
      if (!bearer) {
        return new Response(JSON.stringify({ error: 'Missing Authorization bearer token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Also accept service role key directly in Authorization (legacy/fallback)
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

    const {
      transcriptId,
      transcriptText: providedText,
      dealInfo,
      applyToDeal = true,
    } = await req.json();

    if (!transcriptId) {
      return new Response(JSON.stringify({ error: 'Missing transcriptId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch transcript text from database if not provided
    let transcriptText = providedText;
    let transcriptTitle: string | null = null;
    if (!transcriptText) {
      const { data: transcript, error: fetchError } = await supabase
        .from('deal_transcripts')
        .select('transcript_text, listing_id, title')
        .eq('id', transcriptId)
        .single();

      if (fetchError || !transcript) {
        return new Response(
          JSON.stringify({ error: 'Transcript not found or has no text content' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      transcriptText = transcript.transcript_text;
      transcriptTitle = transcript.title || null;

      if (!transcriptText || transcriptText.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'Transcript has no text content to extract from' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // If title not available from initial fetch, try to get it separately
    if (!transcriptTitle) {
      const { data: tMeta } = await supabase
        .from('deal_transcripts')
        .select('title')
        .eq('id', transcriptId)
        .single();
      transcriptTitle = tMeta?.title || null;
    }

    console.log(
      `Extracting intelligence from transcript ${transcriptId}${transcriptTitle ? ` ("${transcriptTitle}")` : ''}, text length: ${transcriptText.length}`,
    );

    // Use AI to extract intelligence
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const extractionPrompt = `You are a senior M&A analyst conducting due diligence on a potential acquisition target. You are reviewing a call transcript or meeting notes between our team and a business owner, broker, or company representative.

Your job is to extract EVERY piece of deal intelligence from this transcript. Be EXHAUSTIVE, not conservative. If something is mentioned even briefly, capture it. Read the ENTIRE transcript word by word — do not skip ANY section. Owners reveal critical information throughout the conversation, not just when directly asked.

${
  dealInfo
    ? `CURRENT DEAL PROFILE (for context — update if transcript has newer/better info):
Company: ${dealInfo.company_name || 'Unknown'}
Industry: ${dealInfo.industry || 'Unknown'}
Location: ${dealInfo.location || 'Not specified'}
Revenue: ${dealInfo.revenue ? '$' + dealInfo.revenue.toLocaleString() : 'Unknown'}
EBITDA: ${dealInfo.ebitda ? '$' + dealInfo.ebitda.toLocaleString() : 'Unknown'}
`
    : ''
}

TRANSCRIPT/NOTES TO ANALYZE:
"""
${transcriptText}
"""

---

# FIELD-BY-FIELD EXTRACTION INSTRUCTIONS

## SECTION 1: FINANCIALS

### Revenue (structured object)

Search the entire transcript for any mention of revenue, sales, top-line, gross revenue, annual revenue, run rate, or total sales. Apply these rules in order:

1. **Exact number stated:** "we do $8 million a year" → value=8000000, is_inferred=false.
2. **Range given:** "somewhere between 5 and 7 million" → use MIDPOINT (6000000). Include exact range in source_quote.
3. **Approximate/hedged language:** "about", "roughly", "around", "ballpark" with a single number → use that number.
4. **Inferred from other data:** "20% EBITDA margins on $1.2M EBITDA" → revenue ≈ $6M. OR "500 jobs/year at $15K average" → $7.5M. Set is_inferred=true, explain math in inference_method.
5. **Multiple revenue figures at different times:** "we did $5M last year but tracking to $7M this year" → use MOST CURRENT figure. Note historical in inference_method.
6. **Not mentioned:** value=null, source_quote=null.

**Common mistakes to avoid:**
- Do NOT confuse revenue with EBITDA, profit, or cash flow.
- Do NOT confuse a single project value with annual revenue.
- Do NOT use enterprise value or asking price as revenue.
- "We bill about $600K a month" → ANNUALIZE to $7,200,000.
- Always store as a raw number with no dollar signs, commas, or abbreviations.

### EBITDA (structured object)

Search for EBITDA, earnings, cash flow, profit, margin, SDE, owner's benefit, adjusted earnings, or net income.

1. **EBITDA stated directly:** "our EBITDA is $1.5 million" → amount=1500000.
2. **Margin stated directly:** "we run at about 18% margins" → margin_percentage=18. If revenue known, calculate amount = revenue × (margin/100), set is_inferred=true.
3. **Margin calculable:** If both revenue and EBITDA stated, calculate margin_percentage = (EBITDA / revenue) × 100.
4. **SDE vs EBITDA:** If speaker says SDE/"seller's discretionary earnings"/"owner's benefit", use that number but note in financial_notes: "Figure represents SDE, not adjusted EBITDA. SDE includes owner compensation."
5. **Adjusted vs unadjusted:** Always prefer ADJUSTED figure. Note which was used in inference_method.
6. **Ranges/approximations:** Same as revenue — midpoint for ranges.

**Common mistakes to avoid:**
- Do NOT confuse gross margin with EBITDA margin.
- Do NOT use revenue as EBITDA.
- "We keep about 20 cents on every dollar" → margin_percentage=20.
- "After I pay myself $300K, the business throws off another $800K" — this is likely SDE territory. Flag it.

### Financial Notes (string — detailed paragraph)

Scan the ENTIRE transcript for financial context beyond revenue/EBITDA. Include ALL of the following if mentioned:
- **Seasonality:** "70% of revenue comes Q2-Q3", "December is dead month"
- **Revenue trends:** "Revenue grown 15% YoY for 3 years", "down year in 2023"
- **One-time items:** "$500K insurance claim inflated last year", "bought new fleet — unusual capex"
- **Owner compensation:** ALWAYS capture this — "I pay myself $250K plus car and health insurance." Affects SDE/EBITDA adjustments.
- **Add-backs:** Personal expenses through business, one-time legal, family on payroll not working full-time, above-market rent to related entity
- **Debt/liens:** Business debt, SBA loans, equipment financing, lines of credit
- **Pending changes:** "Just signed $2M contract starting next quarter", "about to lose biggest customer"
- **Capex:** Equipment needs, deferred maintenance
- **Tax structure:** S-corp, C-corp, LLC, sole proprietor — how taxes affect reported earnings
- **Working capital needs:** AR/AP cycles, inventory requirements

If NOTHING beyond revenue/EBITDA mentioned: "No additional financial context provided in this call."

## SECTION 2: EXECUTIVE SUMMARY (string — 5-12 sentences)

This is the SINGLE MOST IMPORTANT field. It must be a comprehensive, investor-ready overview that covers everything a PE buyer needs to evaluate the opportunity at a glance. This field replaces separate "business model" and "competitive position" fields, so it MUST weave those themes in.

Write a summary a PE investor could scan in 60 seconds. MUST include ALL of the following that are available:
1. **What the company does and HOW it makes money** — primary services/products, business model (B2B vs B2C vs mixed, recurring vs project-based, subscription vs contract vs transactional), revenue model, and how services interrelate.
2. **Size indicators** — revenue, EBITDA, margins, employee count (use whichever are available). Be precise with numbers.
3. **Geographic presence** — where they operate, HQ location, number of locations, service radius, states covered.
4. **Competitive advantages and market position** — certifications, preferred vendor relationships, proprietary processes, customer lock-in mechanisms, brand reputation, years in market, franchise affiliations, awards, barriers to entry. What makes this company hard to replicate?
5. **Customer base quality** — type of customers (residential, commercial, government, insurance), recurring/repeat rates, contract vs spot work, key account relationships.
6. **Growth trajectory** — how fast they've grown AND where they could go with investment. Specific levers: geographic expansion, new services, acquisitions, sales team, commercial push.
7. **Acquisition attractiveness** — platform opportunity? strong add-on? geographic gap filler? What's the thesis?
8. **Owner goals and transaction motivation (1-2 sentences, IF available)** — why the owner wants to sell or partner, what they're looking for in a deal (retirement, growth capital, partial liquidity, health reasons, partner buyout, etc.). Only include if the transcript contains this information; omit entirely if not discussed.

**Style rules:**
- Write in third person ("The company..." not "They...").
- Use SPECIFIC numbers from the transcript, not vague language.
- Do NOT include risks in executive summary — those go in other fields.
- Lead with the most compelling aspect.
- The business overview (points 1-7) should be 5-10 sentences depending on the level of detail available in the transcript.
- Owner goals (point 8) should be 1-2 sentences appended at the end, only if discussed in the transcript.
- Every sentence should contain at least one SPECIFIC fact, number, or detail.
- This is NOT a brief tagline — it's a full investment summary.

**Example:** "ABC Restoration is a $8.2M revenue fire and water restoration company based in Sellersburg, IN, operating across southern Indiana and the Louisville metro area with 45 full-time staff across two locations. The company generates approximately $1.5M in adjusted EBITDA (18% margins) through a diversified service model spanning fire restoration (~40%), water restoration (~35%), and a growing roofing segment (~25%), with approximately 60% residential and 40% commercial mix. Revenue is driven by a combination of insurance-referred restoration projects (recurring via DRP partnerships with State Farm, Allstate, and USAA) and direct-to-consumer retail work, creating a resilient demand profile. The company holds IICRC certifications, maintains preferred vendor status with three major insurance carriers, and has built an 18-year track record and strong regional reputation that creates significant barriers to entry for competitors. Founded in 2005, the business has grown from $2M to $8.2M over five years, with recent expansion into commercial roofing opening a substantial new revenue stream. This represents an attractive platform opportunity in the fragmented $70B restoration services market, with clear organic growth levers (geographic expansion into Kentucky, commercial segment growth) and add-on acquisition potential (two smaller competitors identified as targets). The owner is seeking a full exit within the next 12-18 months, primarily motivated by retirement after 20 years of ownership, and is open to a transition period of up to one year to ensure continuity of key insurance carrier relationships."

## SECTION 3: SERVICES

### Services (array of strings)

List EVERY distinct service/product mentioned ANYWHERE in the transcript — not just the "what do you do" section. Owners reveal additional services casually later.
- Listen for direct statements: "We do X, Y, and Z."
- Listen for indirect mentions: "We also started doing roofing about two years ago"
- Listen for sub-services: If "restoration" → does that mean fire, water, mold, storm, smoke, or all?
- Listen for ancillary services: "We have our own textile cleaning facility"
- Mark planned services: "commercial HVAC (planned)"
- Use lowercase except proper nouns. Be specific: "fire restoration" not "restoration".
- Include sub-services as SEPARATE items: ["fire restoration", "water restoration", "mold remediation"] NOT ["restoration"]

### Service Mix (string — detailed paragraph)

1. **Primary services with revenue percentages** if owner gave them: "Fire restoration ~40%, water restoration ~35%"
2. **How services interrelate:** "Water damage calls frequently lead to mold remediation, creating natural cross-sell"
3. **Residential vs commercial split** if mentioned
4. **Recurring vs project-based split** if mentioned
5. **In-house vs subcontracted** for each service
6. **Recently added or planned services**
If owner didn't provide percentage breakdowns, say so explicitly. Do NOT make up percentages.

## SECTION 4: GEOGRAPHIC COVERAGE

### Location (string — "City, ST" format)
Primary location/headquarters. Use suburb name if mentioned ("Sellersburg, IN" not "Louisville area"). If home-based, use owner's stated city. If multiple locations, use first mentioned or described as "main."

### Headquarters Address (string or null)
Only populate if specific STREET ADDRESS mentioned. Do NOT guess or look up.

### Geographic States (array of 2-letter codes)
Include EVERY state where company: operates, has customers, holds licenses, or plans to expand.
- Map ALL city mentions to states: Minneapolis→MN, Dallas→TX, Louisville→KY, Nashville→TN, etc.
- "Licensed in six states" → identify all six from context.
- Past project mentions: "big job in St. Louis" → MO.
- Future plans: "expanding into Tennessee" → include TN.
- ALWAYS include home state.

### Number of Locations (integer)
Count ALL: offices, shops, warehouses, branches, satellites, storage facilities (owned + leased).
- Home office = 1 if only location
- "Two shops and a warehouse" = 3
- Do NOT count job sites or temporary project locations

## SECTION 5: OWNER GOALS & TRANSITION

### Owner Goals (string — detailed paragraph)
This is one of the MOST IMPORTANT fields for buyer matching. Include:
1. **Primary motivation:** Retirement? Growth capital? Burnout? Health? Partner buyout? Estate planning? "Take chips off the table"?
2. **Desired deal type:** Full sale? Majority recap? Minority investment? Strategic partner? Merger?
3. **Financial expectations:** Valuation expectations? Multiple mentioned? "Walk away with $X"?
4. **Beyond-money goals:** Legacy preservation? Employee retention? Brand name? Continued involvement? Community impact?
5. **Owner's exact words** where possible: Include their actual quotes.
Do NOT editorialize or interpret. Report what the owner actually said. If vague ("just exploring options"), say that.

### Ownership Structure (string)
- Entity type: LLC, S-corp, C-corp, sole proprietorship, partnership
- Number of owners with percentages if stated
- Family involvement: "Husband and wife 50/50", "Father founded, son runs it"
- Silent partners or investors
- Employee equity if mentioned
- Trust or estate structures
If not discussed: "Ownership structure not discussed on this call."

### Transition Preferences (string — detailed paragraph)
1. **Duration:** How long will they stay? "1-2 years" or "out in 90 days"
2. **Role:** Full-time? Part-time? Advisory? Operations? Sales?
3. **Willing vs not willing:** "Help with customer relationships but not day-to-day operations"
4. **Key relationships held:** Customer/vendor relationships only the owner manages (transition risk)
5. **Training plan:** Knowledge transfer readiness, is there a #2 in place?
6. **Non-compete willingness**
If not discussed: "Transition preferences not discussed on this call."

### Timeline Notes (string or null)
- Desired close date: "Done by Q4"
- Urgency factors: Health, lease expiration, key employee leaving, partner pressure, market timing
- Constraints: "After busy season", "Contract renews in March"
- Previous attempts: "Tried to sell two years ago"
- Broker timelines: "On market by June"
If not discussed, set to null.

## SECTION 6: CUSTOMERS

### Customer Types (string — detailed paragraph with percentages)
1. **Segments with percentages** if provided: "Residential homeowners (60%), commercial property managers (25%), insurance companies (15%)"
2. **Description of each segment:** Who specifically? Large enterprises? Small businesses? Homeowners?
3. **How segments behave differently:** Residential one-time vs commercial ongoing contracts?
4. **Growing vs shrinking segments**
5. **Segments they want to grow into**
If no percentages: describe qualitatively and note "Specific revenue breakdown by segment not provided."

### Customer Concentration (string — detailed text)
Assess concentration risk:
1. **Largest single customer %:** "Biggest customer is ~15% of revenue"
2. **Top 5/10 concentration:** "Top 10 = ~40% of revenue"
3. **Key account dependencies:** "Losing ServiceMaster contract = $2M hit"
4. **Insurance/government dependencies:** "80% of work through State Farm and Allstate"
5. **Contractual vs at-will**
If not discussed: "Customer concentration not discussed. Recommend follow-up."

### Customer Geography (string)
- Service radius: "50-mile radius around Indianapolis"
- Coverage map: "All of southern Indiana and Louisville metro"
- Remote/national accounts
- Urban vs rural mix
- Geographic expansion plans

## SECTION 7: STRATEGIC ANALYSIS

### Growth Trajectory (string — detailed paragraph, TWO parts)
**Part 1 — Historical (what HAS happened):**
- Revenue over time: "Grew from $2M to $8M over 5 years"
- Employee growth: "10 employees 3 years ago, 45 now"
- New services, locations, markets added
- Key inflection points: "Took off after State Farm contract in 2020"

**Part 2 — Future potential (what COULD happen):**
- Owner's view: "Can be a $15M business with right partner"
- Specific growth levers: geographic expansion, adding services, hiring sales, commercial growth
- What's holding them back: "Can't grow faster because I manage everything"
- Acquisition opportunities: "Two smaller competitors I could acquire"
Use SPECIFIC NUMBERS. Do not generalize.

## SECTION 8: COMPANY BASICS

### Industry (string)
Use MOST SPECIFIC category: "Fire & Water Restoration" NOT "Restoration" or "Construction". "Commercial HVAC Services" NOT "HVAC". If spans multiple, lead with largest revenue contributor.

### Website (string or null)
Full URL format: "https://www.example.com". If company name mentioned but no URL, leave null — do NOT guess.

### Founded Year (number or null)
4-digit year the company was founded/established. Listen for: "been in business since 1998", "started the company 20 years ago" (calculate from current year), "founded in 2005", "been doing this for 30 years".

### Employee Count
- **full_time_employees** (number or null): Total full-time employee headcount. Listen for: "we have 45 employees", "about 50 people", "30 full-time guys", "team of 25". Also listen for crew counts: "we run 6 crews of 4" = ~24. Include office staff if mentioned.
- **part_time_employees** (number or null): Part-time or seasonal employees if mentioned separately. "We bring on 10-15 guys in the summer" = part_time_employees ~12.

### Asking Price (number or null)
The seller's asking price in raw dollars if mentioned. "Listed at $5 million" = 5000000. "Looking for $3.5M" = 3500000. Do NOT confuse with revenue or EBITDA. Set to null if not discussed.

### Primary Contact
Name, email, phone of main contact person (usually the speaker). Note their role (owner, broker, CEO, partner).

## SECTION 9: RISK, OPERATIONS & INFRASTRUCTURE

### Key Risks (string or null — detailed paragraph)
Identify ALL risk factors mentioned or implied in the transcript:
1. **Key person risk:** "I manage everything", "I'm the only one who knows the customers"
2. **Customer concentration:** Single customer >20% of revenue, reliance on specific insurance carriers
3. **Regulatory/compliance:** Licensing requirements, pending regulatory changes, environmental issues
4. **Market risks:** Industry downturns, competitive threats, seasonal volatility
5. **Operational risks:** Equipment age, deferred maintenance, supply chain issues
6. **Financial risks:** Customer payment issues, working capital constraints, debt levels
7. **Legal risks:** Pending litigation, warranty claims, non-compete issues
8. **Succession risk:** No management team in place, key employees threatening to leave
If no risks are discussed or implied, set to null.

### Technology Systems (string or null)
Software and technology infrastructure discussed:
- ERP/accounting: "We use QuickBooks", "NetSuite", "SAP"
- CRM: "Salesforce", "HubSpot", "spreadsheets for tracking"
- Field/operations: "ServiceTitan", "Jobber", "field service management"
- Dispatch/scheduling: "We use a dispatch system", "manual scheduling"
- Industry-specific: "Xactimate for estimating", "DASH for insurance claims"
- Fleet/GPS: "GPS on all trucks", "Verizon fleet tracking"
- Communication: "Teams", "Slack", "radio"
- Custom/proprietary: Any custom-built systems or processes
If not discussed, set to null.

### Real Estate Info (string or null)
Physical real estate details discussed:
- Owned vs leased facilities
- Lease terms: "5-year lease, 3 years remaining"
- Facility size: "10,000 sq ft warehouse"
- Monthly rent/cost: "Paying $8K/month for the shop"
- Related party leases: "I own the building and lease it to the company"
- Plans: "Need bigger space", "Just signed a new lease"
If not discussed, set to null.

### Special Requirements (string or null)
Any special deal requirements, conditions, or constraints the seller has mentioned:
- "Must keep all employees"
- "Non-compete for 5 years in this market"
- "Want to keep the company name"
- "Need to close before end of year for tax reasons"
- "Key customer contracts need to transfer"
- "Want to stay involved in community partnerships"
If not discussed, set to null.

### End Market Description (string or null)
Detailed description of the end markets and verticals the company serves:
- "We primarily serve the insurance restoration market, working with carriers on water and fire claims"
- "Our end market is commercial property management — facility maintenance for Class A office buildings"
- "We serve residential new construction in the $300K-$800K home price range"
Include market dynamics if discussed: growing, shrinking, competitive landscape, barriers to entry.
If not discussed, set to null.

### Financial Follow-up Questions (array of strings)
Questions that remain unanswered after this call, specifically about financials or deal terms:
- "What are the add-backs beyond owner compensation?"
- "What is the current debt load on the business?"
- "What is the revenue trend over the last 3 years?"
- "What is the customer concentration among the top 5 accounts?"
Include 3-8 specific, actionable follow-up questions. Always generate at least a few based on gaps in the financial data.

## SECTION 10: KEY QUOTES (8-10 EXACT VERBATIM)

Select the 8-10 most revealing quotes — the "highlights reel" a buyer scans to understand the opportunity.
Priority order:
1. **Financial specifics:** "We did $8.2 million last year with about $1.5 million in EBITDA."
2. **Growth statements:** "I honestly think this could be a $15 million business with the right investment."
3. **Owner motivation:** "I'm 62 and I've been doing this for 30 years. I want to enjoy my grandkids."
4. **Competitive advantages:** "We're the only company in the region that handles fire, water, AND roofing in-house."
5. **Risk revelations:** "If I got hit by a bus tomorrow, I'm honestly not sure the business could run without me."
6. **Customer insights:** "State Farm sends us probably 60% of our work."
7. **Operational details:** "We just invested $500K in a new textile cleaning facility."
8. **Deal preferences:** "I'm not looking for a full buyout — I want a partner who can bring capital and expertise."

**Rules:**
- MUST be exact verbatim quotes — NOT paraphrased
- Include enough context that quote makes sense standalone (2-3 sentences OK)
- Do NOT include small talk, pleasantries, or filler
- Do NOT include quotes from the interviewer — only from the business owner/seller

---

## GLOBAL RULES (apply to ALL fields):

1. **Search the ENTIRE transcript.** A question about employees might prompt a revenue disclosure. A question about customers might reveal geography.
2. **Use exact quotes for source_quote fields.** Copy-paste exact words. Do not paraphrase.
3. **When data conflicts, use the most specific and most recent statement.** "$7M" early → "$7.2M" later when more precise → use $7.2M.
4. **When data is missing, say so explicitly.** Never fabricate. Use null for structured fields, "Not discussed on this call" for text fields.
5. **Flag inconsistencies.** Owner says 45 employees but describes only 3 crews of 3 → note discrepancy.
6. **Numbers as raw integers.** 8000000 not "$8M" or "8,000,000".
7. **Percentages as numbers.** 18 not "18%" or 0.18. (margin_percentage=18 means 18%)
8. **State codes: 2-letter uppercase.** "IN" not "Indiana".
9. **Don't over-extract.** Jokes or hypotheticals are not data points.
10. **Prioritize accuracy over completeness.** Null is better than wrong. Wrong data causes bad buyer matches.

IMPORTANT: Populate as MANY fields as possible with MAXIMUM DETAIL. Use the extract_deal_info tool to return structured data.`;

    const systemPrompt = `You are a senior M&A analyst at an investment bank conducting due diligence on lower-middle-market acquisition targets (typically $500K–$10M EBITDA businesses). Your job is to extract EVERY piece of structured data from this call transcript.

CORE RULES:

1. EXHAUSTIVE EXTRACTION: Read the ENTIRE transcript from start to finish. Owners reveal critical info throughout, not just when directly asked.
2. ACCURACY OVER COMPLETENESS: It is better to return null than to return wrong data.
3. NUMBERS AS RAW INTEGERS: All dollar amounts must be stored as raw numbers. "$7.5M" = 7500000.
4. PERCENTAGES AS INTEGERS: margin_percentage=18 means 18%. NOT 0.18.
5. STATE CODES: Always 2-letter uppercase. "IN" not "Indiana."
6. VERBATIM QUOTES: source_quote and key_quotes must be EXACT words from the transcript.
7. CONFLICT RESOLUTION: Use the MOST SPECIFIC and MOST RECENT statement.
8. FLAG INCONSISTENCIES in financial_notes or follow-up questions.
9. DO NOT OVER-EXTRACT jokes or hypotheticals.
10. IGNORE THE INTERVIEWER: Extract data from the business owner/seller only.

DEPTH REQUIREMENTS — Every text field should be DETAILED with MAXIMUM CONTEXT:
- executive_summary: 5-12 sentences — this is the MOST IMPORTANT field. 5-10 sentences covering what the company does, business model (how it makes money), size indicators, geography, competitive advantages (certifications, preferred vendor status, proprietary processes, market position), customer base quality, growth trajectory, and acquisition attractiveness. Then 1-2 sentences on owner goals and why they want to transact (only if discussed in transcript). Write like a PE investor memo. Every sentence must contain specific facts or numbers.
- service_mix: 2-4 sentences with revenue percentages if stated, residential vs commercial split, recurring vs project-based, how services interrelate, in-house vs subcontracted.
- owner_goals: 2-4 sentences with primary motivation, desired deal type, financial expectations, beyond-money goals, urgency signals. Include owner's exact words.
- transition_preferences: 2-3 sentences covering duration, role, willing vs not willing, key relationships held, training plan, non-compete.
- growth_trajectory: 2-3 sentences with specific numbers — revenue growth rates, new locations, new services, hiring, contract wins, expansion plans.
- financial_notes: 3-5 sentences covering seasonality, revenue trends, one-time items, owner compensation, add-backs, debt, pending changes, capex, tax structure, working capital.
- customer_types: 2-3 sentences covering specific segments, concentration details, key accounts, repeat rates.
- key_quotes: 8-10 VERBATIM quotes from the owner, prioritized by financial specifics, growth statements, motivation, competitive advantages, risk revelations.

Return a JSON object with these fields (use null for unknown, empty array [] when no items):

{
  "revenue": { "value": number|null, "is_inferred": boolean, "source_quote": string|null, "inference_method": string|null },
  "ebitda": { "amount": number|null, "margin_percentage": number|null, "is_inferred": boolean, "source_quote": string|null },
  "asking_price": number|null,
  "financial_notes": string|null,
  "financial_followup_questions": string[],
  "executive_summary": string|null,
  "services": string[],
  "service_mix": string|null,
  "location": string|null,
  "geographic_states": string[],
  "number_of_locations": number|null,
  "founded_year": number|null,
  "full_time_employees": number|null,
  "part_time_employees": number|null,
  "owner_goals": string|null,
  "ownership_structure": string|null,
  "transition_preferences": string|null,
  "timeline_notes": string|null,
  "special_requirements": string|null,
  "customer_types": string|null,
  "customer_concentration": string|null,
  "customer_geography": string|null,
  "end_market_description": string|null,
  "growth_trajectory": string|null,
  "key_risks": string|null,
  "technology_systems": string|null,
  "real_estate_info": string|null,
  "industry": string|null,
  "website": string|null,
  "main_contact_name": string|null,
  "main_contact_email": string|null,
  "main_contact_phone": string|null,
  "key_quotes": string[]
}

Return ONLY the JSON object. No markdown fences, no explanation.`;

    // Call Gemini directly (plain JSON mode) to avoid schema branching limits
    const { callGeminiWithRetry, getGeminiHeaders, GEMINI_API_URL } =
      await import('../_shared/ai-providers.ts');

    const geminiResponse = await callGeminiWithRetry(
      GEMINI_API_URL,
      getGeminiHeaders(geminiApiKey),
      {
        model: GEMINI_25_FLASH_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: extractionPrompt },
        ],
        temperature: 0,
        max_tokens: 16384,
        response_format: { type: 'json_object' },
      },
      90000,
      'extract-deal-transcript',
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errText.substring(0, 500));
      throw new Error(
        `AI extraction failed: Gemini API returned ${geminiResponse.status}: ${errText.substring(0, 200)}`,
      );
    }

    const geminiResult = await geminiResponse.json();
    const rawContent = geminiResult.choices?.[0]?.message?.content || '';

    let extracted: ExtractionResult | null = null;
    try {
      // Strip markdown fences if present
      const cleaned = rawContent
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
      extracted = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON response:', rawContent.substring(0, 500));
      throw new Error('AI extraction failed: Could not parse JSON response');
    }

    if (!extracted) {
      throw new Error('No extraction result from AI');
    }

    // Normalize geographic_states using shared module
    if (extracted.geographic_states) {
      extracted.geographic_states = normalizeStates(extracted.geographic_states);
    }

    // Strip placeholder strings from extracted data before saving.
    // The AI often produces "Not discussed on this call." etc. which pollute
    // the DB and block lower-priority sources from overwriting.
    for (const key of Object.keys(extracted) as (keyof ExtractionResult)[]) {
      const val = extracted[key];
      if (typeof val === 'string' && isPlaceholder(val)) {
        delete extracted[key];
      }
    }

    // Update the transcript with extracted data
    const { data: transcriptRecord, error: fetchError } = await supabase
      .from('deal_transcripts')
      .select('listing_id')
      .eq('id', transcriptId)
      .single();

    if (fetchError || !transcriptRecord) {
      console.error('Failed to fetch transcript record:', fetchError);
      throw new Error(`Failed to fetch transcript record: ${fetchError?.message || 'Not found'}`);
    }

    const { error: updateTranscriptError } = await supabase
      .from('deal_transcripts')
      .update({
        extracted_data: extracted,
        processed_at: new Date().toISOString(),
        extraction_status: 'completed',
      })
      .eq('id', transcriptId);

    if (updateTranscriptError) {
      console.error('Error updating transcript:', updateTranscriptError);
      throw updateTranscriptError;
    }

    // ========== KEY SPEC REQUIREMENT: Apply to listings table ==========
    let dealUpdated = false;
    let fieldsUpdated: string[] = [];

    if (applyToDeal && transcriptRecord?.listing_id) {
      const listingId = transcriptRecord.listing_id;

      // Fetch current listing with extraction_sources
      const { data: listing, error: listingError } = await supabase
        .from('listings')
        .select('*, extraction_sources')
        .eq('id', listingId)
        .single();

      if (listingError || !listing) {
        console.error('Failed to fetch listing for enrichment:', listingError);
        throw new Error(
          `Failed to fetch listing ${listingId}: ${listingError?.message || 'Not found'}`,
        );
      }

      if (listing) {
        // Flatten extracted data for priority updates
        const flatExtracted: Record<string, unknown> = {};

        const toFiniteNumber = (v: unknown): number | undefined => {
          if (typeof v === 'number' && Number.isFinite(v)) return v;
          if (typeof v === 'string') {
            const n = Number(v.replace(/[$,]/g, '').trim());
            if (Number.isFinite(n)) return n;
          }
          return undefined;
        };

        // Handle structured revenue
        {
          const revenueValue = toFiniteNumber(extracted.revenue?.value);
          if (revenueValue != null) {
            flatExtracted.revenue = revenueValue;
            flatExtracted.revenue_is_inferred = extracted.revenue?.is_inferred || false;
            flatExtracted.revenue_source_quote = extracted.revenue?.source_quote;
          }
        }

        // Handle structured EBITDA
        {
          const ebitdaAmount = toFiniteNumber(extracted.ebitda?.amount);
          if (ebitdaAmount != null) flatExtracted.ebitda = ebitdaAmount;

          const marginPct = toFiniteNumber(extracted.ebitda?.margin_percentage);
          if (marginPct != null) flatExtracted.ebitda_margin = marginPct / 100; // Store as decimal

          if (extracted.ebitda) {
            flatExtracted.ebitda_is_inferred = extracted.ebitda.is_inferred || false;
            flatExtracted.ebitda_source_quote = extracted.ebitda.source_quote;
          }
        }

        // Map other fields
        if (extracted.geographic_states?.length)
          flatExtracted.geographic_states = extracted.geographic_states;
        {
          const n = toFiniteNumber(extracted.number_of_locations);
          if (n != null) flatExtracted.number_of_locations = n;
        }
        if (extracted.service_mix) flatExtracted.service_mix = extracted.service_mix;
        if (extracted.owner_goals) flatExtracted.owner_goals = extracted.owner_goals;
        if (extracted.transition_preferences)
          flatExtracted.transition_preferences = extracted.transition_preferences;
        if (extracted.customer_types) flatExtracted.customer_types = extracted.customer_types;
        // customer_concentration is NUMERIC in DB but LLM returns rich text.
        // Append the text to customer_types so the detail isn't lost,
        // and try to extract a numeric value for the DB column.
        if (extracted.customer_concentration) {
          const concText = String(extracted.customer_concentration);
          // Try to extract a percentage number from the text (e.g., "largest customer is 15%" → 15)
          const pctMatch = concText.match(/(\d{1,3})(?:\s*%|\s*percent)/i);
          if (pctMatch) {
            const n = Number(pctMatch[1]);
            if (Number.isFinite(n) && n > 0 && n <= 100) flatExtracted.customer_concentration = n;
          }
          // Append concentration details to customer_types so the rich text is preserved
          if (flatExtracted.customer_types) {
            flatExtracted.customer_types += '\n\nCustomer Concentration: ' + concText;
          } else {
            flatExtracted.customer_types = 'Customer Concentration: ' + concText;
          }
        }
        if (extracted.customer_geography)
          flatExtracted.customer_geography = extracted.customer_geography;
        if (extracted.executive_summary)
          flatExtracted.executive_summary = extracted.executive_summary;
        if (extracted.growth_trajectory)
          flatExtracted.growth_trajectory = extracted.growth_trajectory;
        if (extracted.key_quotes?.length) flatExtracted.key_quotes = extracted.key_quotes;
        if (extracted.financial_notes) flatExtracted.financial_notes = extracted.financial_notes;
        if (extracted.main_contact_name)
          flatExtracted.main_contact_name = extracted.main_contact_name;
        if (extracted.main_contact_email)
          flatExtracted.main_contact_email = extracted.main_contact_email;
        if (extracted.main_contact_phone)
          flatExtracted.main_contact_phone = extracted.main_contact_phone;
        if (extracted.industry) flatExtracted.industry = extracted.industry;
        if (extracted.website) flatExtracted.website = extracted.website;
        if (extracted.location) flatExtracted.location = extracted.location;
        if (extracted.ownership_structure)
          flatExtracted.ownership_structure = extracted.ownership_structure;
        if (extracted.timeline_notes) flatExtracted.timeline_notes = extracted.timeline_notes;
        if (extracted.services?.length) flatExtracted.services = extracted.services;

        // New enrichment fields
        {
          const askingPrice = toFiniteNumber(extracted.asking_price);
          if (askingPrice != null) flatExtracted.asking_price = askingPrice;
        }
        {
          const fte = toFiniteNumber(extracted.full_time_employees);
          if (fte != null) flatExtracted.full_time_employees = fte;
        }
        {
          const pte = toFiniteNumber(extracted.part_time_employees);
          if (pte != null) flatExtracted.part_time_employees = pte;
        }
        {
          const fy = toFiniteNumber(extracted.founded_year);
          if (fy != null && fy > 1800 && fy <= new Date().getFullYear())
            flatExtracted.founded_year = fy;
        }
        if (extracted.key_risks) flatExtracted.key_risks = extracted.key_risks;
        if (extracted.technology_systems)
          flatExtracted.technology_systems = extracted.technology_systems;
        if (extracted.real_estate_info) flatExtracted.real_estate_info = extracted.real_estate_info;
        if (extracted.special_requirements)
          flatExtracted.special_requirements = extracted.special_requirements;
        if (extracted.end_market_description)
          flatExtracted.end_market_description = extracted.end_market_description;
        if (extracted.financial_followup_questions?.length)
          flatExtracted.financial_followup_questions = extracted.financial_followup_questions;

        // SAFETY: Only update columns that actually exist on the listings row.
        // PostgREST rejects the entire update when any unknown column is present.
        const listingKeys = new Set(Object.keys(listing as Record<string, unknown>));
        const filteredExtracted: Record<string, unknown> = {};
        const droppedKeys: string[] = [];
        for (const [k, v] of Object.entries(flatExtracted)) {
          if (listingKeys.has(k)) filteredExtracted[k] = v;
          else droppedKeys.push(k);
        }
        if (droppedKeys.length > 0) {
          console.log(`Dropping ${droppedKeys.length} non-listing fields:`, droppedKeys);
        }

        // SAFETY: Sanitize numeric fields — LLM sometimes returns prose for numeric columns.
        // A single bad value causes PostgREST to reject the entire update.
        const NUMERIC_FIELDS = new Set([
          'revenue',
          'ebitda',
          'ebitda_margin',
          'number_of_locations',
          'full_time_employees',
          'part_time_employees',
          'founded_year',
          'linkedin_employee_count',
          'team_page_employee_count',
          'customer_concentration',
        ]);
        const removedNumeric: Array<{ key: string; value: unknown }> = [];
        for (const [k, v] of Object.entries(filteredExtracted)) {
          if (!NUMERIC_FIELDS.has(k)) continue;
          if (typeof v === 'string') {
            const cleaned = v.replace(/[$,%]/g, '').trim();
            const n = Number(cleaned);
            if (Number.isFinite(n)) {
              filteredExtracted[k] = n;
              continue;
            }
          }
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            removedNumeric.push({ key: k, value: v });
            delete filteredExtracted[k];
          }
        }
        if (removedNumeric.length > 0) {
          console.warn('Removed non-numeric values from numeric fields:', removedNumeric);
        }

        // Build priority-aware updates using shared module (transcript has highest priority)
        const { updates, sourceUpdates } = buildPriorityUpdates(
          listing,
          listing.extraction_sources,
          filteredExtracted,
          'transcript',
          transcriptId,
          isPlaceholder,
          transcriptTitle || undefined,
        );

        // Merge geographic_states instead of replacing
        if (updates.geographic_states && listing.geographic_states?.length > 0) {
          updates.geographic_states = mergeStates(
            listing.geographic_states,
            updates.geographic_states as string[],
          );
        }

        if (Object.keys(updates).length > 0) {
          const finalUpdates = {
            ...updates,
            enriched_at: new Date().toISOString(),
            extraction_sources: updateExtractionSources(listing.extraction_sources, sourceUpdates),
          };

          const { error: listingUpdateError } = await supabase
            .from('listings')
            .update(finalUpdates)
            .eq('id', listingId);

          if (listingUpdateError) {
            console.error('Error updating listing:', listingUpdateError);
            throw new Error(`Failed to update listing: ${listingUpdateError.message}`);
          } else {
            dealUpdated = true;
            fieldsUpdated = Object.keys(updates);
            console.log(`Updated ${fieldsUpdated.length} fields on listing:`, fieldsUpdated);
          }
        }

        // Mark transcript as applied once extraction succeeds, even if no fields changed
        // (prevents re-extraction loops when all fields are already set from higher-priority sources)
        await supabase
          .from('deal_transcripts')
          .update({
            applied_to_deal: true,
            applied_at: new Date().toISOString(),
          })
          .eq('id', transcriptId);
        if (!dealUpdated) {
          console.log(
            `Transcript ${transcriptId} extracted but no new fields applied (existing data has higher priority)`,
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        extracted,
        fieldsExtracted: Object.keys(extracted).filter(
          (k) => extracted[k as keyof ExtractionResult] != null,
        ).length,
        dealUpdated,
        fieldsUpdated,
        message: dealUpdated
          ? `Intelligence extracted and ${fieldsUpdated.length} fields applied to deal`
          : 'Intelligence extracted successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in extract-deal-transcript:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Update transcript extraction_status to failed
    try {
      const bodyText = await req
        .clone()
        .text()
        .catch(() => '{}');
      const { transcriptId: failedId } = JSON.parse(bodyText);
      if (failedId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);
        await sb
          .from('deal_transcripts')
          .update({
            extraction_status: 'failed',
            extraction_error: message,
          })
          .eq('id', failedId);
      }
    } catch (_) {
      /* best effort */
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
