# Deal Page System - Complete Technical Documentation

**Version:** 1.0
**Last Updated:** 2026-02-05
**Document Purpose:** Complete technical specification for rebuilding the deal page system

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Requirements Document](#requirements-document)
3. [Process Document](#process-document)
4. [Data Architecture](#data-architecture)
5. [AI Prompts & Extraction Logic](#ai-prompts--extraction-logic)
6. [Execution Instructions](#execution-instructions)
7. [Testing Instructions](#testing-instructions)
8. [Appendix](#appendix)

---

## System Overview

The Deal Page System is an AI-powered M&A deal intelligence platform that extracts, enriches, and analyzes business opportunity data from multiple sources (transcripts, websites, notes) with intelligent prioritization and confidence tracking.

### Key Capabilities

- **Multi-source data extraction**: Transcripts (priority 100), Notes (priority 80), Website (priority 60)
- **AI-powered parsing**: Claude Sonnet 4 for transcripts/websites, Gemini 2.5 Flash for notes
- **Confidence tracking**: High/medium/low confidence levels for financial data
- **Source provenance**: Track which source provided each data field
- **Auto-enrichment**: Automatic data extraction when deals are viewed
- **Priority-based updates**: Higher priority sources protect their data from overwrites

---

## Requirements Document

### Functional Requirements

#### FR-1: Deal Creation

- **FR-1.1**: User can create a new deal with basic information (deal name, website, geography, revenue, EBITDA)
- **FR-1.2**: User can paste general notes and have AI extract structured fields
- **FR-1.3**: System must check for duplicate companies across trackers via domain normalization
- **FR-1.4**: System must normalize geography inputs (state names → 2-letter codes, regions → constituent states)
- **FR-1.5**: System must track extraction source and timestamp for each field

#### FR-2: Transcript Processing

- **FR-2.1**: User can add transcripts via link, file upload (.pdf, .txt, .md), or pasted text
- **FR-2.2**: System must scrape link-based transcripts using Firecrawl API
- **FR-2.3**: System must parse PDF files using pdfjs-serverless
- **FR-2.4**: System must extract financial data with confidence levels (high/medium/low)
- **FR-2.5**: System must generate follow-up questions when data is ambiguous
- **FR-2.6**: System must calculate EBITDA amount from revenue × margin when margin provided
- **FR-2.7**: Transcript data has HIGHEST priority (100) and cannot be overwritten by notes or website

#### FR-3: Notes Analysis

- **FR-3.1**: User can paste notes and extract: deal name, website, geography, revenue, EBITDA, service mix, owner goals, location count
- **FR-3.2**: System must pre-extract obvious patterns using regex before AI analysis
- **FR-3.3**: System must expand regional terms to state codes (e.g., "Southeast" → [GA, FL, SC, NC, AL, TN, MS, LA, AR, KY, VA, WV])
- **FR-3.4**: System must convert financial values to millions (e.g., "$500K" → 0.5, "$6M" → 6)
- **FR-3.5**: Notes data has medium priority (80) and cannot overwrite transcript data
- **FR-3.6**: System must merge pre-extracted data with AI results (pre-extracted takes precedence for numeric values)

#### FR-4: Website Enrichment

- **FR-4.1**: System must scrape company website using Firecrawl API
- **FR-4.2**: System must extract: company overview, geography, headquarters, company address, service mix, employee count, founded year, location count, business model, industry type
- **FR-4.3**: Website data has LOWEST priority (60) and only fills empty fields
- **FR-4.4**: System must merge geography data instead of replacing it
- **FR-4.5**: System must respect onlyFillEmpty flag (default: true)

#### FR-5: Auto-Enrichment

- **FR-5.1**: System must automatically enrich deals when viewed if:
  - Last enriched > 24 hours ago
  - Key fields missing (company_overview < 50 chars, company_address empty, geography empty)
  - Has sources available (transcript_link, additional_info, or company_website)
- **FR-5.2**: Auto-enrichment priority order: Transcript → Notes → Website
- **FR-5.3**: System must show loading banner during auto-enrichment
- **FR-5.4**: System must update last_enriched_at timestamp after enrichment

#### FR-6: Data Display

- **FR-6.1**: Deal page must show confidence badges for revenue and EBITDA
- **FR-6.2**: Deal page must show source badges indicating data origin (transcript/notes/website)
- **FR-6.3**: Deal page must show data quality score (% of fields completed)
- **FR-6.4**: Deal page must show follow-up questions panel when financial_followup_questions exist
- **FR-6.5**: Deal page must show low confidence warning banner for revenue_confidence or ebitda_confidence = "low"
- **FR-6.6**: Deal page must allow inline editing of all sections with optimistic UI updates

#### FR-7: Location Count Extraction

- **FR-7.1**: System must extract location count from phrases: "X locations", "X offices", "X branches", "X stores", "X shops"
- **FR-7.2**: System must count individual location mentions (e.g., "Dallas, Houston, Austin" = 3)
- **FR-7.3**: System must interpret "multiple locations" as 3 (conservative estimate)
- **FR-7.4**: Single location business = 1

### Non-Functional Requirements

#### NFR-1: Performance

- Transcript extraction must complete within 60 seconds
- Website scraping must complete within 30 seconds
- Notes analysis must complete within 15 seconds
- Auto-enrichment must not block UI (show loading banner)

#### NFR-2: Data Integrity

- Source priority system must prevent data overwrites: transcript (100) > notes (80) > website (60)
- All numeric conversions must preserve precision to 2 decimal places
- Geography normalization must handle all 50 US states + DC
- EBITDA calculations must use formula: revenue × (margin / 100)

#### NFR-3: Security

- All API calls must be authenticated via Supabase Auth
- Row Level Security (RLS) must verify user access before enrichment
- Service role key must only be used after RLS verification
- File uploads must be scoped to user_id/deal_id path

#### NFR-4: Usability

- Financial data must display with confidence badges
- Protected fields must show source badges
- Extraction errors must show user-friendly messages
- Empty fields must show placeholder text

---

## Process Document

### Process Flow Diagrams

#### 1. Deal Creation Flow

```
User enters deal form
  ↓
[Optional] User pastes notes → Analyze Notes (Gemini 2.5 Flash)
  ↓                              ↓
  ↓                         Extract: deal_name, website, geography,
  ↓                         revenue, EBITDA, service_mix, owner_goals
  ↓                              ↓
  ↓                         Pre-fill form fields
  ↓                              ↓
User fills/reviews form fields ←┘
  ↓
User enters website → Domain Lookup (check for existing company)
  ↓
User submits form
  ↓
Create/link Company record
  ↓
Create Deal record with extraction_sources tracking
  ↓
Trigger initial enrichment (if transcript_link or company_website provided)
  ↓
Navigate to Deal Detail page
```

#### 2. Auto-Enrichment Flow (Deal Detail Page Load)

```
Load Deal + Transcripts from database
  ↓
Check if needs enrichment:
  - last_enriched_at > 24 hours?
  - Missing key fields (overview, address, geography)?
  - Has sources (transcript_link, additional_info, website)?
  ↓
  YES → Trigger Auto-Enrichment (in background)
  ↓
Priority 1: Extract from transcript_link (if exists)
  ↓
  Call extract-deal-transcript function
  ↓
  Update deal with transcript data (priority 100)
  ↓
Priority 2: Analyze additional_info notes (if exists)
  ↓
  Call analyze-deal-notes function
  ↓
  Update deal with notes data (priority 80, skip if transcript owns field)
  ↓
Priority 3: Scrape company_website (if exists)
  ↓
  Call enrich-deal function (onlyFillEmpty: true)
  ↓
  Update deal with website data (priority 60, skip if transcript/notes own field)
  ↓
Set last_enriched_at = NOW()
  ↓
Reload deal data and show to user
```

#### 3. Transcript Extraction Flow

```
User adds transcript (link, file, or notes)
  ↓
Store transcript in deal_transcripts table
  ↓
User clicks "Extract Data" or "Apply to Deal"
  ↓
Call extract-deal-transcript function
  ↓
Determine transcript source:
  - Link? → Scrape with Firecrawl
  - File? → Download from storage, parse PDF if needed
  - Notes? → Use notes field
  ↓
Extract content (minimum 100 characters required)
  ↓
Call Claude Sonnet 4 with M&A Analyst System Prompt
  ↓
Extract via extract_deal_info tool:
  - Company overview
  - Revenue (with confidence: high/medium/low, source_quote, inference_method)
  - EBITDA margin and amount (with confidence, source_quote, inference_method)
  - Geography (normalize to 2-letter state codes)
  - Service mix, business model
  - Employee count, founded year, headquarters, location count
  - Ownership structure, special requirements, contact name
  - End market customers, customer concentration, customer geography
  - Key risks, competitive position, technology systems, real estate, growth trajectory
  - Financial follow-up questions (if data unclear)
  ↓
Calculate EBITDA amount if only margin provided:
  ebitda_amount = revenue × (ebitda_percentage / 100)
  ↓
Build update object with extraction_sources tracking
  ↓
Update deal record (transcript data priority 100)
  ↓
Update transcript record with extracted_data and processed_at
  ↓
Return success with extracted fields list
```

#### 4. Notes Analysis Flow

```
User pastes notes in General Notes section
  ↓
User clicks "Analyze Notes"
  ↓
Pre-extract obvious patterns (regex):
  - Website URLs
  - Revenue ($XM, $XXK formats)
  - EBITDA percentage and dollar amounts
  - Geography (cities, states, regions)
  - Location count ("X locations", "X offices")
  - Founded year
  ↓
Detect local context:
  - If specific cities/states mentioned → regional terms are local modifiers
  - If NO local context → regional terms expand to macro-regions
  ↓
Call Gemini 2.5 Flash with M&A Analyst Assistant Prompt
  ↓
Pass notes + pre-extracted hints
  ↓
Extract via extract_deal_info tool:
  - Deal name, website, geography, revenue, EBITDA percentage,
    EBITDA amount, service mix, owner goals, location count, additional info
  ↓
Merge pre-extracted data (takes precedence for numeric values)
  ↓
Normalize geography to uppercase 2-letter codes
  ↓
Calculate EBITDA amount if only margin provided
  ↓
If dealId provided and applyToRecord=true:
  ↓
  Update extraction_sources for each field
  ↓
  Apply extracted fields to empty fields only
  ↓
  Trigger deal scoring
  ↓
Return extracted data and fieldsExtracted list
```

#### 5. Website Enrichment Flow

```
User clicks "Enrich from Website" or auto-enrichment triggers
  ↓
Call enrich-deal function (onlyFillEmpty: true)
  ↓
Scrape website with Firecrawl API
  ↓
Extract content as markdown (min 100 chars required)
  ↓
Call Claude Sonnet 4 with Website Extraction Prompt
  ↓
Extract via extract_website_info tool:
  - Company overview
  - Geography (all states where company operates)
  - Headquarters (city, state)
  - Company address (full street address)
  - Service mix
  - Employee count, founded year, location count
  - Business model, industry type
  ↓
Normalize geography to 2-letter codes
  ↓
If no explicit geography → derive from headquarters or company_address
  ↓
Check each field:
  - Can we overwrite? (Check source priority: website=60)
  - Is field empty or placeholder? (onlyFillEmpty flag)
  ↓
Merge geography with existing instead of replacing
  ↓
Build update object with extraction_sources tracking
  ↓
Update deal record
  ↓
Set last_enriched_at = NOW()
  ↓
Return updatedFields and skippedFields lists
```

---

## Data Architecture

### Database Schema

#### `deals` Table

```sql
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracker_id UUID NOT NULL REFERENCES industry_trackers(id),
  company_id UUID REFERENCES companies(id),

  -- Core Fields
  deal_name TEXT NOT NULL,
  company_website TEXT,
  status TEXT DEFAULT 'Active', -- Active | Closed | Archived

  -- Financial Data
  revenue DECIMAL, -- In millions
  revenue_confidence TEXT, -- high | medium | low
  revenue_is_inferred BOOLEAN,
  revenue_source_quote TEXT,
  ebitda_percentage DECIMAL, -- Percentage (e.g., 23 for 23%)
  ebitda_amount DECIMAL, -- In millions
  ebitda_confidence TEXT, -- high | medium | low
  ebitda_is_inferred BOOLEAN,
  ebitda_source_quote TEXT,
  financial_notes TEXT,
  financial_followup_questions TEXT[], -- Array of questions

  -- Company Information
  company_overview TEXT,
  company_address TEXT, -- Full street address
  headquarters TEXT, -- City, State
  founded_year INTEGER,
  employee_count INTEGER,
  location_count INTEGER DEFAULT 1,
  industry_type TEXT,

  -- Geography
  geography TEXT[], -- Array of 2-letter state codes

  -- Business Details
  service_mix TEXT,
  business_model TEXT, -- B2B, B2C, government, etc.

  -- Ownership & Goals
  owner_goals TEXT,
  ownership_structure TEXT,
  special_requirements TEXT,

  -- Contact
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_linkedin TEXT,

  -- End Market / Customers
  end_market_customers TEXT,
  customer_concentration TEXT,
  customer_geography TEXT,

  -- Additional Intelligence
  key_risks TEXT[], -- Array of risk items
  competitive_position TEXT,
  technology_systems TEXT,
  real_estate TEXT,
  growth_trajectory TEXT,
  additional_info TEXT,

  -- Source Tracking
  extraction_sources JSONB, -- { fieldName: { source: 'transcript'|'notes'|'website'|'csv'|'manual', timestamp: ISO8601 } }
  transcript_link TEXT, -- Legacy field

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_enriched_at TIMESTAMPTZ, -- Cache timestamp for auto-enrichment

  -- Scoring
  deal_score DECIMAL,
  scoring_breakdown JSONB,
  last_scored_at TIMESTAMPTZ
);

CREATE INDEX idx_deals_tracker ON deals(tracker_id);
CREATE INDEX idx_deals_company ON deals(company_id);
CREATE INDEX idx_deals_geography ON deals USING GIN(geography);
CREATE INDEX idx_deals_last_enriched ON deals(last_enriched_at);
```

#### `deal_transcripts` Table

```sql
CREATE TABLE deal_transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  -- Transcript Metadata
  title TEXT NOT NULL,
  transcript_type TEXT NOT NULL, -- 'link' | 'file' | 'notes'
  url TEXT, -- Link URL or storage path for files
  notes TEXT, -- Pasted transcript content or manual notes
  call_date DATE,

  -- Extraction Results
  extracted_data JSONB, -- Full extraction output from AI
  extraction_evidence JSONB, -- Supporting quotes and reasoning (deprecated)
  processed_at TIMESTAMPTZ, -- When extraction completed

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deal_transcripts_deal ON deal_transcripts(deal_id);
CREATE INDEX idx_deal_transcripts_processed ON deal_transcripts(processed_at);
```

#### `companies` Table

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Company Identity
  domain TEXT NOT NULL UNIQUE, -- Normalized domain for deduplication
  company_name TEXT NOT NULL,
  company_website TEXT,

  -- Company Data (inherited by deals)
  industry_type TEXT,
  geography TEXT[],
  revenue DECIMAL,
  ebitda_percentage DECIMAL,
  service_mix TEXT,
  owner_goals TEXT,
  additional_info TEXT,
  transcript_link TEXT,
  location_count INTEGER DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_companies_domain ON companies(domain);
CREATE INDEX idx_companies_user ON companies(user_id);
```

### Data Priority System

```
Source Priority Levels:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
transcript  = 100  (Highest - from call transcripts)
notes       = 80   (High - from analyzed notes)
website     = 60   (Medium - from scraped website)
csv         = 40   (Low - from CSV import)
manual      = 20   (Lowest - user-entered)
```

**Priority Rules:**

1. Higher priority sources ALWAYS win during conflicts
2. Lower priority sources can only fill empty fields
3. `extraction_sources` JSONB tracks source and timestamp per field
4. Protected fields show source badge in UI

**Example:**

```json
{
  "revenue": {
    "source": "transcript",
    "timestamp": "2026-02-05T10:30:00Z"
  },
  "company_overview": {
    "source": "website",
    "timestamp": "2026-02-05T10:32:00Z"
  }
}
```

### Geography Normalization

**Input Formats Accepted:**

- State names: "California", "texas", "New York"
- State codes: "CA", "TX", "NY"
- Regions: "Southeast", "Pacific Northwest", "Midwest"
- Cities: "Orlando", "Houston", "Seattle"

**Regional Expansions:**

```javascript
{
  'southeast': ['GA', 'FL', 'SC', 'NC', 'AL', 'TN', 'MS', 'LA', 'AR', 'KY', 'VA', 'WV'],
  'south': ['TX', 'OK', 'LA', 'AR', 'MS', 'AL', 'TN', 'KY', 'GA', 'FL', 'SC', 'NC', 'VA', 'WV'],
  'northeast': ['NY', 'NJ', 'PA', 'CT', 'MA', 'RI', 'VT', 'NH', 'ME', 'DE', 'MD'],
  'midwest': ['OH', 'MI', 'IN', 'IL', 'WI', 'MN', 'IA', 'MO', 'KS', 'NE', 'SD', 'ND'],
  'southwest': ['TX', 'AZ', 'NM', 'OK', 'NV'],
  'west': ['CA', 'WA', 'OR', 'NV', 'UT', 'CO', 'ID', 'MT', 'WY', 'AK', 'HI'],
  'pacific northwest': ['WA', 'OR', 'ID'],
  'new england': ['MA', 'CT', 'RI', 'VT', 'NH', 'ME'],
  'mid-atlantic': ['NY', 'NJ', 'PA', 'DE', 'MD', 'DC'],
  'great lakes': ['OH', 'MI', 'IN', 'IL', 'WI', 'MN'],
  'gulf coast': ['TX', 'LA', 'MS', 'AL', 'FL'],
  'rocky mountain': ['CO', 'UT', 'WY', 'MT', 'ID'],
  'sunbelt': ['CA', 'AZ', 'NM', 'TX', 'LA', 'MS', 'AL', 'GA', 'FL', 'SC', 'NC'],
  'east coast': ['ME', 'NH', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE', 'MD', 'VA', 'NC', 'SC', 'GA', 'FL'],
  'west coast': ['CA', 'OR', 'WA']
}
```

**Context-Aware Processing:**

- If notes mention specific cities/states → regional terms are local modifiers (e.g., "southeast counties near Orlando" = FL, not entire Southeast)
- If NO local context → regional terms expand to macro-regions (e.g., "Southeast" = all Southeast states)

**Output Format:**

- Always uppercase 2-letter codes
- Always sorted alphabetically
- Always unique (Set de-duplication)

---

## AI Prompts & Extraction Logic

### 1. M&A Analyst System Prompt (Transcript Extraction)

**File:** `supabase/functions/extract-deal-transcript/index.ts:242-330`

**Model:** Claude Sonnet 4 (claude-sonnet-4-20250514)

**Purpose:** Extract financial and business data from M&A call transcripts with conservative bias

**Full Prompt:**

```
You are an AI agent supporting a buy-side M&A firm. Your job is to extract revenue and EBITDA from phone call transcripts with business owners. These calls often reference financial performance without using formal accounting terms, so you must interpret owner language carefully and conservatively.

Your output will be used for deal screening and buyer matching. Accuracy matters more than completeness.

## PRIMARY GOAL
From each call transcript, determine:
- Revenue (explicit or inferred)
- EBITDA (explicit or inferred)
- EBITDA margin (if possible)
- Location count (number of physical sites/shops/branches)
- How confident the data is and what it is based on

If something is unclear, you must flag it rather than guessing.

## LOCATION COUNT EXTRACTION
CRITICAL: Always extract the number of physical locations, shops, branches, offices, or sites.
- Look for: "X locations", "X shops", "X branches", "X offices", "sites across", "operate out of X", "facilities in"
- Count individual location mentions if total not stated (e.g., "shops in Dallas, Houston, and Austin" = 3)
- Look for expansion mentions: "opened 2 new locations", "growing from 4 to 6 shops"
- Single location business = 1

## REVENUE EXTRACTION
- If the owner states revenue directly (e.g., "we do about $7 million a year"), record it as revenue.
- If they give a range, record the midpoint and note that it is a range.
- If revenue is not stated but can be calculated from margin and profit (e.g., "we make $800k at 10% margins"), you may infer revenue and clearly label it as inferred.
- Always capture the exact quote that supports the number.

## EBITDA EXTRACTION

### Explicit EBITDA
If the owner uses terms like:
- EBITDA
- Earnings before interest, taxes, depreciation
- Operating EBITDA

Record the figure as explicit EBITDA.

### Inferred EBITDA (Allowed)
If EBITDA is not mentioned, you may infer it only when the transcript supports a reasonable proxy.

You may infer EBITDA when the owner refers to:
- Operating profit
- Net profit before taxes and debt
- Cash flow that excludes financing and taxes
- Owner earnings in an owner-operated business
- Margins paired with revenue ("we run at about 15% margins")

When inferring EBITDA:
- Clearly explain how you arrived at the number
- State any assumptions
- Assign a confidence level (high, medium, or low)
- Default to the lower end if there is uncertainty

### Inference Confidence Levels
- **High confidence**: Revenue and margin are both stated, or profit is clearly pre-tax and pre-debt
- **Medium confidence**: Owner income or cash flow is discussed without full clarity
- **Low confidence**: Statements are ambiguous or partially personal

If confidence is low, do not treat the number as firm—flag it for follow-up.

### Do NOT Infer EBITDA From:
- Post-tax income
- Personal income after distributions
- Profit figures that clearly include debt service
- Statements like "what I take home after everything"

In these cases, note that EBITDA is unclear and recommend clarification questions.

## CONSERVATIVE BIAS RULE
If there is any ambiguity:
- Choose the more conservative interpretation
- Lower the confidence level
- Flag the issue for follow-up

Never fabricate numbers or assume financial definitions that are not supported by the transcript.

## OUTPUT REQUIREMENTS
For every transcript, you must clearly communicate:
- The financial figures you extracted or inferred
- Whether each number is explicit or inferred
- The exact language used by the owner
- Your confidence level
- Any questions that should be asked in a follow-up call

## FINAL PRINCIPLE
Your role is not to "fill in the blanks."
Your role is to translate owner language into investor-usable financial signals without overstating certainty.

When in doubt, flag—not guess.
```

**Tool Schema:**

```json
{
  "name": "extract_deal_info",
  "description": "Extract company, financial, and deal information from a sales call transcript with a buy-side M&A advisory firm",
  "parameters": {
    "type": "object",
    "properties": {
      "company_overview": { "type": "string" },
      "revenue": {
        "type": "object",
        "properties": {
          "value": { "type": "number", "description": "Annual revenue in millions" },
          "is_range": { "type": "boolean" },
          "range_low": { "type": "number" },
          "range_high": { "type": "number" },
          "is_inferred": { "type": "boolean" },
          "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
          "source_quote": { "type": "string" },
          "inference_method": { "type": "string" }
        },
        "required": ["confidence"]
      },
      "ebitda": {
        "type": "object",
        "properties": {
          "margin_percentage": { "type": "number" },
          "amount": { "type": "number" },
          "is_explicit": { "type": "boolean" },
          "is_inferred": { "type": "boolean" },
          "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
          "source_quote": { "type": "string" },
          "inference_method": { "type": "string" },
          "assumptions": { "type": "array", "items": { "type": "string" } },
          "do_not_use_reason": { "type": "string" }
        },
        "required": ["confidence"]
      },
      "financial_followup_questions": { "type": "array", "items": { "type": "string" } },
      "financial_notes": { "type": "string" },
      "geography": { "type": "array", "items": { "type": "string" } },
      "service_mix": { "type": "string" },
      "owner_goals": { "type": "string" },
      "business_model": { "type": "string" },
      "employee_count": { "type": "number" },
      "founded_year": { "type": "number" },
      "headquarters": { "type": "string" },
      "location_count": {
        "type": "number",
        "description": "CRITICAL: Count ALL physical locations"
      },
      "ownership_structure": { "type": "string" },
      "special_requirements": { "type": "string" },
      "contact_name": { "type": "string" },
      "end_market_customers": { "type": "string" },
      "customer_concentration": { "type": "string" },
      "customer_geography": { "type": "string" },
      "key_risks": { "type": "array", "items": { "type": "string" } },
      "competitive_position": { "type": "string" },
      "technology_systems": { "type": "string" },
      "real_estate": { "type": "string" },
      "growth_trajectory": { "type": "string" }
    }
  }
}
```

---

### 2. M&A Analyst Assistant Prompt (Notes Analysis)

**File:** `supabase/functions/analyze-deal-notes/index.ts:354-414`

**Model:** Gemini 2.5 Flash (google/gemini-2.5-flash)

**Purpose:** Extract structured deal data from general notes with regional expansion

**Full Prompt:**

```
You are an M&A analyst assistant. Extract structured deal information from notes about a business opportunity.

The notes may be in various formats:
- Conversational notes from calls or emails
- Structured memos with bullet points and headers
- Mixed formats with sections and tables

EXTRACTION RULES:

1. DEAL NAME / COMPANY NAME:
   - Look for explicit labels: "Company:", "Deal:", "Lead Memo –", or memo title/header
   - If a descriptive name is given (e.g., "Southeast Roofing Contractor"), use it
   - Can also extract from website domain if no other name given

2. WEBSITE:
   - Look for URLs anywhere: https://example.com
   - Look for labels: "Website:", "URL:", "Site:", "Web:"
   - Include full URL with https://

3. FINANCIAL DATA (convert to MILLIONS):
   - Revenue: "$6.0M" = 6, "$6,000,000" = 6, "$500K" = 0.5
   - EBITDA Amount: "$650,000" = 0.65, "$650K" = 0.65, "$1.2M" = 1.2
   - EBITDA Percentage: "10.8%" = 10.8, "EBITDA Margin: 15%" = 15
   - Also look for: "margins", "profitability", "cash flow"

4. GEOGRAPHY (expand regions to states):
   - "Southeast" → GA, FL, SC, NC, AL, TN, MS, LA
   - "Northeast" → NY, NJ, PA, CT, MA, RI, VT, NH, ME
   - "Midwest" → OH, MI, IN, IL, WI, MN, IA, MO, KS, NE, SD, ND
   - "Southwest" → TX, AZ, NM, OK
   - "West Coast" → CA, WA, OR
   - "Gulf Coast" → TX, LA, MS, AL, FL
   - "Pacific Northwest" → WA, OR, ID
   - Extract from city mentions: "Atlanta" = GA, "Houston" = TX
   - Return as array of 2-letter state codes

5. LOCATION COUNT:
   - Look for: "X locations", "X offices", "X branches"
   - "Multiple staffed locations" = estimate 3
   - "Several locations" = estimate 4

6. SERVICE MIX:
   - Extract ALL services mentioned with percentages
   - Format: "70% residential / 30% commercial. Metal roofing ~50% of production."
   - Include specialties and unique capabilities

7. OWNER GOALS:
   - Sale intentions: "open to sale discussions", "looking to exit"
   - Timeline: "retire in 2 years"
   - Post-sale: "management can run operations post-transaction"
   - Involvement preferences

8. ADDITIONAL INFO:
   - Founded/established date
   - Employee count
   - Years of experience
   - Certifications, licenses
   - Team structure
   - Customer base details
   - Unique aspects
```

**Tool Schema:**

```json
{
  "name": "extract_deal_info",
  "description": "Extract company, financial, and deal information from general notes about a business",
  "parameters": {
    "type": "object",
    "properties": {
      "deal_name": { "type": "string" },
      "company_website": { "type": "string" },
      "geography": {
        "type": "array",
        "items": { "type": "string" },
        "description": "US states as 2-letter abbreviations. Expand regions: 'Southeast' = GA,FL,SC,NC,AL,TN,MS,LA"
      },
      "revenue": {
        "type": "number",
        "description": "Annual revenue in MILLIONS. Convert: $6.0M = 6, $500K = 0.5"
      },
      "ebitda_percentage": {
        "type": "number",
        "description": "EBITDA margin as PERCENTAGE. '10.8%' = 10.8"
      },
      "ebitda_amount": {
        "type": "number",
        "description": "EBITDA dollar amount in MILLIONS. '$650K' = 0.65"
      },
      "service_mix": { "type": "string" },
      "owner_goals": { "type": "string" },
      "location_count": { "type": "number" },
      "additional_info": { "type": "string" }
    }
  }
}
```

**Pre-Extraction Regex Patterns:**

```javascript
// Website extraction
const websiteMatch = notes.match(/(?:Website|URL|Site|Web)[:\s]+\s*(https?:\/\/[^\s\n]+)/i);

// Revenue extraction
const revenuePatterns = [
  /Revenue[:\s]+\$?([\d,.]+)\s*(M|MM|million|mil)?/i,
  /\$?([\d,.]+)\s*(M|MM|million)\s+(?:in\s+)?revenue/i,
  /annual\s+revenue[:\s]+\$?([\d,.]+)\s*(M|MM|million|K|thousand)?/i,
];

// EBITDA dollar amount
const ebitdaAmountPatterns = [
  /EBITDA[:\s]+\$?([\d,.]+)\s*(K|thousand|M|MM|million)?/i,
  /\$?([\d,.]+)\s*(K|thousand|M|MM|million)?\s+EBITDA/i,
];

// EBITDA percentage
const ebitdaPercentPatterns = [
  /EBITDA\s+Margin[:\s]+([\d.]+)\s*%/i,
  /EBITDA[:\s]+([\d.]+)\s*%/i,
  /([\d.]+)\s*%\s+EBITDA/i,
  /margins?[:\s]+([\d.]+)\s*%/i,
];

// Location count
const locationPatterns = [
  /(\d+)\s+(?:staffed\s+)?locations?/i,
  /(\d+)\s+offices?/i,
  /(\d+)\s+branches?/i,
  /(\d+)\s+stores?/i,
];

// Founded year
const foundedMatch = notes.match(/(?:Founded|Established|Started)[:\s]+(\d{4})/i);
```

---

### 3. Website Extraction Prompt

**File:** `supabase/functions/enrich-deal/index.ts:174-198`

**Model:** Claude Sonnet 4 (claude-sonnet-4-20250514)

**Purpose:** Extract business information from company websites with focus on geography

**Full Prompt:**

```
You are an AI assistant that extracts business information from company websites for M&A deal research.

Your job is to find:
1. **Geography**: Where the company operates. Look for:
   - Physical addresses (extract city, state)
   - "Locations" or "Service Areas" pages
   - Phrases like "serving [area]", "proudly serving", "locations in"
   - Footer addresses
   - Multiple location mentions

2. **Company Address**: The FULL street address of the company. Look for:
   - Contact page addresses
   - Footer addresses with street number
   - "Visit us at" or "Located at" mentions
   - About Us page with physical location
   Format: "123 Main Street, Suite 100, City, ST 12345"

3. **Company Overview**: A brief summary of what they do

4. **Service Mix**: What services/products they offer

5. **Other Details**: Headquarters (city, state only), employee count, founding year, number of locations

Be thorough in finding geographic and address information - it's critical for buyer matching.
```

**User Prompt Template:**

```
Extract business information from this company website for "[COMPANY_NAME]".

Pay special attention to geographic presence - find ALL states where they operate or have locations.

Website Content:
[SCRAPED_MARKDOWN_CONTENT - first 15,000 chars]
```

**Tool Schema:**

```json
{
  "name": "extract_website_info",
  "description": "Extract company information from a business website",
  "parameters": {
    "type": "object",
    "properties": {
      "company_overview": { "type": "string" },
      "geography": {
        "type": "array",
        "items": { "type": "string" },
        "description": "US states where company operates. Use 2-letter codes or full names"
      },
      "headquarters": { "type": "string", "description": "City and state (e.g., 'Modesto, CA')" },
      "company_address": {
        "type": "string",
        "description": "Full street address including street, suite, city, state, zip"
      },
      "service_mix": { "type": "string" },
      "employee_count": { "type": "number" },
      "founded_year": { "type": "number" },
      "location_count": { "type": "number" },
      "business_model": { "type": "string", "description": "B2B, B2C, government, etc." },
      "industry_type": { "type": "string" }
    }
  }
}
```

---

## Execution Instructions

### Prerequisites

1. **External Services**
   - Supabase project with PostgreSQL database
   - Anthropic API key (Claude Sonnet 4 access)
   - Firecrawl API key (web scraping)
   - Lovable AI Gateway API key (Gemini 2.5 Flash access)

2. **Environment Variables**
   ```bash
   SUPABASE_URL=https://[project-ref].supabase.co
   SUPABASE_ANON_KEY=[anon-key]
   SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
   ANTHROPIC_API_KEY=[anthropic-key]
   FIRECRAWL_API_KEY=[firecrawl-key]
   ```

### Setup Steps

#### Step 1: Database Setup

```sql
-- 1. Create tables
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracker_id UUID NOT NULL REFERENCES industry_trackers(id),
  company_id UUID REFERENCES companies(id),
  deal_name TEXT NOT NULL,
  company_website TEXT,
  status TEXT DEFAULT 'Active',

  -- Financial
  revenue DECIMAL,
  revenue_confidence TEXT,
  revenue_is_inferred BOOLEAN,
  revenue_source_quote TEXT,
  ebitda_percentage DECIMAL,
  ebitda_amount DECIMAL,
  ebitda_confidence TEXT,
  ebitda_is_inferred BOOLEAN,
  ebitda_source_quote TEXT,
  financial_notes TEXT,
  financial_followup_questions TEXT[],

  -- Company
  company_overview TEXT,
  company_address TEXT,
  headquarters TEXT,
  founded_year INTEGER,
  employee_count INTEGER,
  location_count INTEGER DEFAULT 1,
  industry_type TEXT,
  geography TEXT[],
  service_mix TEXT,
  business_model TEXT,

  -- Ownership
  owner_goals TEXT,
  ownership_structure TEXT,
  special_requirements TEXT,

  -- Contact
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_linkedin TEXT,

  -- Customers
  end_market_customers TEXT,
  customer_concentration TEXT,
  customer_geography TEXT,

  -- Additional
  key_risks TEXT[],
  competitive_position TEXT,
  technology_systems TEXT,
  real_estate TEXT,
  growth_trajectory TEXT,
  additional_info TEXT,

  -- Metadata
  extraction_sources JSONB,
  transcript_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_enriched_at TIMESTAMPTZ,
  deal_score DECIMAL,
  scoring_breakdown JSONB,
  last_scored_at TIMESTAMPTZ
);

CREATE TABLE deal_transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  transcript_type TEXT NOT NULL,
  url TEXT,
  notes TEXT,
  call_date DATE,
  extracted_data JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  domain TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  company_website TEXT,
  industry_type TEXT,
  geography TEXT[],
  revenue DECIMAL,
  ebitda_percentage DECIMAL,
  service_mix TEXT,
  owner_goals TEXT,
  additional_info TEXT,
  transcript_link TEXT,
  location_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes
CREATE INDEX idx_deals_tracker ON deals(tracker_id);
CREATE INDEX idx_deals_company ON deals(company_id);
CREATE INDEX idx_deals_geography ON deals USING GIN(geography);
CREATE INDEX idx_deals_last_enriched ON deals(last_enriched_at);
CREATE INDEX idx_deal_transcripts_deal ON deal_transcripts(deal_id);
CREATE INDEX idx_companies_domain ON companies(domain);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
-- Deals: users can only access deals in trackers they own
CREATE POLICY "Users can view their tracker deals"
  ON deals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM industry_trackers
      WHERE industry_trackers.id = deals.tracker_id
      AND industry_trackers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their tracker deals"
  ON deals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM industry_trackers
      WHERE industry_trackers.id = deals.tracker_id
      AND industry_trackers.user_id = auth.uid()
    )
  );

-- Deal Transcripts: users can access transcripts for their deals
CREATE POLICY "Users can view their deal transcripts"
  ON deal_transcripts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deals
      JOIN industry_trackers ON deals.tracker_id = industry_trackers.id
      WHERE deals.id = deal_transcripts.deal_id
      AND industry_trackers.user_id = auth.uid()
    )
  );

-- Companies: users can only access their own companies
CREATE POLICY "Users can view their companies"
  ON companies FOR SELECT
  USING (user_id = auth.uid());

-- 5. Create storage bucket for transcript files
INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-transcripts', 'deal-transcripts', false);

CREATE POLICY "Users can upload transcript files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'deal-transcripts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

#### Step 2: Deploy Supabase Edge Functions

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Link to your project
supabase link --project-ref [your-project-ref]

# 3. Deploy functions
supabase functions deploy extract-deal-transcript
supabase functions deploy analyze-deal-notes
supabase functions deploy enrich-deal

# 4. Set environment secrets
supabase secrets set ANTHROPIC_API_KEY=[your-key]
supabase secrets set FIRECRAWL_API_KEY=[your-key]
```

#### Step 3: Frontend Components

**Install dependencies:**

```bash
npm install @supabase/supabase-js date-fns lucide-react
```

**Key files to create:**

1. `src/pages/DealDetail.tsx` - Main deal page (see Appendix A)
2. `src/pages/NewDeal.tsx` - Deal creation form (see Appendix B)
3. `src/components/DealNotesSection.tsx` - Notes analysis UI (see Appendix C)
4. `src/components/DealTranscriptsSection.tsx` - Transcript management UI (see Appendix D)
5. `src/lib/normalizeGeography.ts` - Geography normalization utility

#### Step 4: Geography Normalization Utility

**File:** `src/lib/normalizeGeography.ts`

```typescript
const STATE_NAME_TO_ABBREV: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
  dc: 'DC',
};

const REGION_TO_STATES: Record<string, string[]> = {
  southeast: ['GA', 'FL', 'SC', 'NC', 'AL', 'TN', 'MS', 'LA', 'AR', 'KY', 'VA', 'WV'],
  northeast: ['NY', 'NJ', 'PA', 'CT', 'MA', 'RI', 'VT', 'NH', 'ME', 'DE', 'MD'],
  midwest: ['OH', 'MI', 'IN', 'IL', 'WI', 'MN', 'IA', 'MO', 'KS', 'NE', 'SD', 'ND'],
  southwest: ['TX', 'AZ', 'NM', 'OK', 'NV'],
  west: ['CA', 'WA', 'OR', 'NV', 'UT', 'CO', 'ID', 'MT', 'WY', 'AK', 'HI'],
  'west coast': ['CA', 'OR', 'WA'],
  'pacific northwest': ['WA', 'OR', 'ID'],
};

export function normalizeGeography(input: string | string[] | null | undefined): string[] | null {
  if (!input) return null;

  const inputs = Array.isArray(input)
    ? input
    : input
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const result = new Set<string>();

  for (const item of inputs) {
    const lower = item.toLowerCase().trim();

    // Check if it's a 2-letter code
    if (item.length === 2 && /^[A-Z]{2}$/.test(item.toUpperCase())) {
      result.add(item.toUpperCase());
      continue;
    }

    // Check if it's a state name
    if (STATE_NAME_TO_ABBREV[lower]) {
      result.add(STATE_NAME_TO_ABBREV[lower]);
      continue;
    }

    // Check if it's a region
    if (REGION_TO_STATES[lower]) {
      REGION_TO_STATES[lower].forEach((state) => result.add(state));
      continue;
    }
  }

  return result.size > 0 ? Array.from(result).sort() : null;
}
```

#### Step 5: Deploy Frontend

```bash
# Build production bundle
npm run build

# Deploy to your hosting platform (Netlify, Vercel, etc.)
npm run deploy
```

---

## Testing Instructions

### Test Suite 1: Transcript Extraction

**Test Case 1.1: Direct Revenue Statement**

**Input Transcript:**

```
Owner: "Yeah, we do about $8.5 million a year in revenue. We've been growing steadily."
```

**Expected Output:**

```json
{
  "revenue": {
    "value": 8.5,
    "is_inferred": false,
    "confidence": "high",
    "source_quote": "we do about $8.5 million a year in revenue"
  }
}
```

**Verification:**

- ✅ `deals.revenue` = 8.5
- ✅ `deals.revenue_confidence` = "high"
- ✅ `deals.revenue_is_inferred` = false
- ✅ `deals.revenue_source_quote` contains owner quote
- ✅ `deals.extraction_sources['revenue'].source` = "transcript"

---

**Test Case 1.2: Inferred Revenue from Margin**

**Input Transcript:**

```
Owner: "We make about $800,000 and we run at 10% margins."
```

**Expected Output:**

```json
{
  "revenue": {
    "value": 8.0,
    "is_inferred": true,
    "confidence": "high",
    "source_quote": "We make about $800,000 and we run at 10% margins",
    "inference_method": "Calculated from $800k profit at 10% margins = $8M revenue"
  }
}
```

**Verification:**

- ✅ `deals.revenue` = 8.0
- ✅ `deals.revenue_is_inferred` = true
- ✅ `deals.revenue_confidence` = "high"

---

**Test Case 1.3: EBITDA Margin Extraction**

**Input Transcript:**

```
Owner: "Our EBITDA margins are around 23%."
```

**Expected Output:**

```json
{
  "ebitda": {
    "margin_percentage": 23,
    "is_explicit": true,
    "confidence": "high",
    "source_quote": "Our EBITDA margins are around 23%"
  }
}
```

**Verification:**

- ✅ `deals.ebitda_percentage` = 23
- ✅ `deals.ebitda_confidence` = "high"
- ✅ `deals.ebitda_is_inferred` = false

---

**Test Case 1.4: Low Confidence Financial Data**

**Input Transcript:**

```
Owner: "I take home maybe $500k after everything, but that includes some personal stuff."
```

**Expected Output:**

```json
{
  "ebitda": {
    "confidence": "low",
    "do_not_use_reason": "Owner's take-home includes personal distributions and post-tax income - cannot reliably infer EBITDA",
    "source_quote": "I take home maybe $500k after everything, but that includes some personal stuff"
  },
  "financial_followup_questions": [
    "What is the company's EBITDA or operating profit before owner distributions?",
    "Can you share revenue and pre-tax profit figures?"
  ]
}
```

**Verification:**

- ✅ `deals.ebitda_confidence` = "low" OR null
- ✅ `deals.financial_followup_questions` array has questions
- ✅ Low confidence banner shows in UI

---

**Test Case 1.5: Location Count Extraction**

**Input Transcript:**

```
Owner: "We have shops in Dallas, Houston, and Austin. We just opened the Austin location last year."
```

**Expected Output:**

```json
{
  "location_count": 3,
  "geography": ["TX"],
  "headquarters": "Dallas, TX" // if mentioned as primary
}
```

**Verification:**

- ✅ `deals.location_count` = 3
- ✅ `deals.geography` = ["TX"]

---

### Test Suite 2: Notes Analysis

**Test Case 2.1: Structured Notes with Patterns**

**Input Notes:**

```
Deal: Acme Roofing Services
Website: https://acmeroofing.com
Revenue: $6.5M
EBITDA Margin: 18%
Geography: Southeast
Locations: 4 staffed locations
Services: 70% residential / 30% commercial roofing
Founded: 2010
```

**Expected Pre-Extraction:**

```json
{
  "company_website": "https://acmeroofing.com",
  "revenue": 6.5,
  "ebitda_percentage": 18,
  "location_count": 4,
  "founded_year": 2010,
  "geography": ["GA", "FL", "SC", "NC", "AL", "TN", "MS", "LA", "AR", "KY", "VA", "WV"]
}
```

**Expected AI Extraction (merged):**

```json
{
  "deal_name": "Acme Roofing Services",
  "company_website": "https://acmeroofing.com",
  "revenue": 6.5,
  "ebitda_percentage": 18,
  "geography": ["GA", "FL", "SC", "NC", "AL", "TN", "MS", "LA", "AR", "KY", "VA", "WV"],
  "location_count": 4,
  "service_mix": "70% residential / 30% commercial roofing",
  "additional_info": "Founded: 2010"
}
```

**Verification:**

- ✅ Pre-extracted numeric values take precedence over AI
- ✅ Regional term "Southeast" expanded to 12 states
- ✅ All fields applied to deal
- ✅ `extraction_sources` tracks "notes" as source

---

**Test Case 2.2: Context-Aware Regional Detection**

**Input Notes:**

```
Roofing company in Orlando, FL. Serves southeast counties and parts of central Florida.
```

**Expected Behavior:**

- ✅ Local context detected: Orlando, FL mentioned
- ✅ "southeast" interpreted as local modifier (southeast Florida), NOT macro Southeast region
- ✅ `geography` = ["FL"]

---

**Test Case 2.3: Macro-Region Expansion (No Local Context)**

**Input Notes:**

```
Roofing company operating across the Southeast region.
```

**Expected Behavior:**

- ✅ No local context detected
- ✅ "Southeast" expands to macro-region
- ✅ `geography` = ["GA", "FL", "SC", "NC", "AL", "TN", "MS", "LA", "AR", "KY", "VA", "WV"]

---

**Test Case 2.4: Financial Unit Conversion**

**Input Notes:**

```
Revenue: $500,000
EBITDA: $75K
```

**Expected Output:**

```json
{
  "revenue": 0.5,
  "ebitda_amount": 0.075
}
```

**Verification:**

- ✅ $500,000 converted to 0.5M
- ✅ $75K converted to 0.075M

---

### Test Suite 3: Website Enrichment

**Test Case 3.1: Geography Extraction from Website**

**Mock Scraped Content:**

```markdown
# About Us

Acme Services proudly serves customers in California, Oregon, and Washington.

## Our Locations

- San Francisco, CA - Headquarters
- Portland, OR
- Seattle, WA

Contact: 123 Market Street, Suite 200, San Francisco, CA 94103
```

**Expected Output:**

```json
{
  "geography": ["CA", "OR", "WA"],
  "headquarters": "San Francisco, CA",
  "company_address": "123 Market Street, Suite 200, San Francisco, CA 94103",
  "location_count": 3
}
```

**Verification:**

- ✅ All 3 states extracted
- ✅ Full street address captured
- ✅ Headquarters identified
- ✅ Location count = 3

---

**Test Case 3.2: Priority System - Website Cannot Overwrite Transcript**

**Setup:**

```sql
-- Deal already has transcript data
UPDATE deals SET
  revenue = 8.5,
  extraction_sources = '{"revenue": {"source": "transcript", "timestamp": "2026-02-05T10:00:00Z"}}'
WHERE id = '[deal-id]';
```

**Action:** Run `enrich-deal` with website containing "Revenue: $10M"

**Expected Behavior:**

- ✅ Website enrichment skips revenue field
- ✅ `deals.revenue` remains 8.5
- ✅ `extraction_sources['revenue']` remains "transcript"
- ✅ Response includes `skippedFields: ['revenue']`

---

**Test Case 3.3: Empty Field Filling**

**Setup:**

```sql
UPDATE deals SET
  company_overview = NULL,
  geography = NULL
WHERE id = '[deal-id]';
```

**Action:** Run `enrich-deal` with `onlyFillEmpty: true`

**Expected Behavior:**

- ✅ Website data fills empty fields
- ✅ `company_overview` and `geography` populated
- ✅ `extraction_sources` updated with "website" source
- ✅ Other populated fields remain unchanged

---

### Test Suite 4: Priority System

**Test Case 4.1: Full Priority Chain**

**Sequence:**

1. Create deal with manual entry: `revenue = 5.0` (priority 20)
2. Analyze notes: `revenue = 6.0` (priority 80)
3. Extract transcript: `revenue = 8.5` (priority 100)
4. Enrich website: `revenue = 10.0` (priority 60)

**Expected Final State:**

- ✅ Step 1: `revenue = 5.0`, source = "manual"
- ✅ Step 2: `revenue = 6.0`, source = "notes" (overwrites manual)
- ✅ Step 3: `revenue = 8.5`, source = "transcript" (overwrites notes)
- ✅ Step 4: `revenue = 8.5`, source = "transcript" (website cannot overwrite)

---

**Test Case 4.2: Partial Field Protection**

**Setup:**

- `revenue` from transcript (priority 100)
- `geography` from notes (priority 80)
- `company_overview` from website (priority 60)

**Action:** Run website enrichment with all 3 fields

**Expected Behavior:**

- ✅ `revenue` protected (transcript)
- ✅ `geography` protected (notes)
- ✅ `company_overview` updated (website can overwrite itself)

---

### Test Suite 5: Auto-Enrichment

**Test Case 5.1: Auto-Enrich on Page Load**

**Setup:**

```sql
INSERT INTO deals (deal_name, company_website, last_enriched_at, company_overview)
VALUES ('Test Co', 'https://example.com', NULL, NULL);
```

**Action:** Navigate to deal detail page

**Expected Behavior:**

- ✅ Auto-enrichment triggers (no last_enriched_at, missing overview)
- ✅ Loading banner shows
- ✅ Website scraped and enrichment applied
- ✅ `last_enriched_at` set to NOW()
- ✅ Page reloads with enriched data

---

**Test Case 5.2: Cache Prevents Re-Enrichment**

**Setup:**

```sql
UPDATE deals SET
  last_enriched_at = NOW() - INTERVAL '12 hours'
WHERE id = '[deal-id]';
```

**Action:** Navigate to deal detail page

**Expected Behavior:**

- ✅ Auto-enrichment SKIPPED (enriched < 24 hours ago)
- ✅ No loading banner
- ✅ No API calls made

---

**Test Case 5.3: Multi-Source Auto-Enrichment**

**Setup:**

```sql
INSERT INTO deals (
  deal_name,
  transcript_link,
  additional_info,
  company_website,
  last_enriched_at
) VALUES (
  'Test Co',
  'https://fireflies.ai/transcript/123',
  'Owner wants to retire. $6M revenue.',
  'https://example.com',
  NULL
);
```

**Action:** Navigate to deal detail page

**Expected Sequence:**

1. ✅ Extract transcript (priority 1)
2. ✅ Analyze notes (priority 2)
3. ✅ Enrich website (priority 3)

**Final State:**

- ✅ Transcript data has highest protection
- ✅ Notes filled gaps not in transcript
- ✅ Website filled remaining gaps
- ✅ `last_enriched_at` updated

---

### Test Suite 6: UI/UX

**Test Case 6.1: Confidence Badges Display**

**Setup:**

```sql
UPDATE deals SET
  revenue = 8.5,
  revenue_confidence = 'low',
  ebitda_percentage = 23,
  ebitda_confidence = 'high'
WHERE id = '[deal-id]';
```

**Expected UI:**

- ✅ Revenue shows red "Low Confidence" badge
- ✅ EBITDA shows green "High Confidence" badge
- ✅ Low confidence warning banner visible at top

---

**Test Case 6.2: Follow-Up Questions Display**

**Setup:**

```sql
UPDATE deals SET
  financial_followup_questions = ARRAY[
    'What is the exact EBITDA or operating profit?',
    'Can you clarify if the $500k is pre-tax or post-tax?'
  ]
WHERE id = '[deal-id]';
```

**Expected UI:**

- ✅ Follow-up questions panel visible
- ✅ 2 questions listed with icons
- ✅ Panel highlighted in yellow/warning color

---

**Test Case 6.3: Source Badges**

**Setup:**

```sql
UPDATE deals SET
  revenue = 8.5,
  extraction_sources = '{"revenue": {"source": "transcript", "timestamp": "2026-02-05T10:00:00Z"}}'
WHERE id = '[deal-id]';
```

**Expected UI:**

- ✅ Revenue field shows "Transcript" source badge
- ✅ Badge has distinct color (blue/purple)
- ✅ Tooltip shows extraction timestamp

---

**Test Case 6.4: Data Quality Score**

**Setup:**

```sql
-- Populate 50% of key fields
UPDATE deals SET
  company_overview = 'Test overview',
  revenue = 8.5,
  geography = ARRAY['CA', 'TX']
WHERE id = '[deal-id]';
-- 3 out of 6 key fields filled
```

**Expected UI:**

- ✅ Data quality score shows ~50%
- ✅ Progress bar half-filled
- ✅ Green color if >70%, yellow if 40-70%, red if <40%

---

### Test Suite 7: Edge Cases

**Test Case 7.1: PDF Transcript with No Text**

**Input:** Image-based PDF with no extractable text

**Expected Behavior:**

- ✅ PDF parsing throws error
- ✅ Error message: "Could not extract meaningful text from PDF..."
- ✅ Suggests user paste content in notes field
- ✅ Transcript record remains unprocessed

---

**Test Case 7.2: Extremely Short Content**

**Input:** Transcript with only 50 characters

**Expected Behavior:**

- ✅ Function returns error
- ✅ Error message: "Transcript content too short or empty"
- ✅ Minimum 100 characters required

---

**Test Case 7.3: Invalid Geography Input**

**Input Notes:**

```
Geography: XYZ, ABC, Southeast
```

**Expected Behavior:**

- ✅ Invalid codes (XYZ, ABC) ignored
- ✅ "Southeast" expanded to valid states
- ✅ `geography` = ["GA", "FL", "SC", "NC", "AL", "TN", "MS", "LA", "AR", "KY", "VA", "WV"]

---

**Test Case 7.4: EBITDA Calculation Edge Case**

**Setup:**

- Revenue: 10.0
- EBITDA Margin: 23%
- EBITDA Amount: null

**Expected Behavior:**

- ✅ System calculates: `ebitda_amount = 10.0 × 0.23 = 2.3`
- ✅ `ebitda_is_inferred = true`
- ✅ Financial notes include calculation explanation

---

**Test Case 7.5: Duplicate Domain Prevention**

**Setup:**

```sql
INSERT INTO companies (domain, company_name, user_id)
VALUES ('acmeroofing.com', 'Acme Roofing', '[user-id]');
```

**Action:** User creates new deal with website "https://acmeroofing.com"

**Expected Behavior:**

- ✅ Domain lookup finds existing company
- ✅ UI shows "Company Exists" card
- ✅ Shows deal history across trackers
- ✅ Prevents duplicate in same tracker

---

### Test Suite 8: Performance

**Test Case 8.1: Transcript Extraction Latency**

**Expected Performance:**

- ✅ Firecrawl scrape: < 15 seconds
- ✅ Claude extraction: < 30 seconds
- ✅ Database update: < 2 seconds
- ✅ **Total: < 60 seconds**

**Load Test:**

- Run 10 concurrent extractions
- All should complete within 90 seconds

---

**Test Case 8.2: Notes Analysis Latency**

**Expected Performance:**

- ✅ Pre-extraction (regex): < 1 second
- ✅ Gemini API call: < 10 seconds
- ✅ Database update: < 2 seconds
- ✅ **Total: < 15 seconds**

---

**Test Case 8.3: Website Enrichment Latency**

**Expected Performance:**

- ✅ Firecrawl scrape: < 10 seconds
- ✅ Claude extraction: < 15 seconds
- ✅ Database update: < 2 seconds
- ✅ **Total: < 30 seconds**

---

## Appendix

### Appendix A: Key Configuration Constants

**Geography Utilities**

- `STATE_NAME_TO_ABBREV`: 50 states + DC mapping
- `REGION_TO_STATES`: 13 regional groupings
- `CITY_TO_STATE`: 60+ major cities

**Source Priorities**

```javascript
const SOURCE_PRIORITY = {
  transcript: 100,
  notes: 80,
  website: 60,
  csv: 40,
  manual: 20,
};
```

**Auto-Enrichment Thresholds**

- Cache duration: 24 hours
- Minimum overview length: 50 characters
- Required missing fields: any of [company_overview, company_address, geography]

### Appendix B: API Endpoints

**Supabase Edge Functions**

1. **extract-deal-transcript**
   - Method: POST
   - Body: `{ dealId?: string, transcriptId?: string }`
   - Returns: `{ success: boolean, extractedFields: string[], data: object }`

2. **analyze-deal-notes**
   - Method: POST
   - Body: `{ notes: string, dealId?: string, applyToRecord?: boolean }`
   - Returns: `{ success: boolean, data: object, fieldsExtracted: string[] }`

3. **enrich-deal**
   - Method: POST
   - Body: `{ dealId: string, onlyFillEmpty?: boolean }`
   - Returns: `{ success: boolean, updatedFields: string[], skippedFields: string[] }`

### Appendix C: Error Messages Reference

| Error Code             | Message                                                 | User Action                         |
| ---------------------- | ------------------------------------------------------- | ----------------------------------- |
| `transcript_too_short` | "Transcript content too short or empty"                 | Add more content (min 100 chars)    |
| `pdf_parse_failed`     | "Failed to parse PDF. Please paste content directly."   | Copy text and paste in notes        |
| `no_website`           | "Deal has no company website"                           | Add website to deal                 |
| `scrape_failed`        | "Could not scrape website content"                      | Check URL or paste content manually |
| `rate_limit`           | "Rate limit exceeded. Please try again in a moment."    | Wait 60 seconds                     |
| `access_denied`        | "Deal not found or access denied"                       | Verify you own this tracker         |
| `duplicate_deal`       | "This company is already listed in this buyer universe" | View existing deal instead          |

### Appendix D: Database Migrations

**Migration: Add Financial Confidence Fields**

```sql
ALTER TABLE deals
  ADD COLUMN revenue_confidence TEXT,
  ADD COLUMN revenue_is_inferred BOOLEAN DEFAULT false,
  ADD COLUMN revenue_source_quote TEXT,
  ADD COLUMN ebitda_confidence TEXT,
  ADD COLUMN ebitda_is_inferred BOOLEAN DEFAULT false,
  ADD COLUMN ebitda_source_quote TEXT,
  ADD COLUMN financial_notes TEXT,
  ADD COLUMN financial_followup_questions TEXT[];
```

**Migration: Add Source Tracking**

```sql
ALTER TABLE deals
  ADD COLUMN extraction_sources JSONB DEFAULT '{}',
  ADD COLUMN last_enriched_at TIMESTAMPTZ;
```

**Migration: Add End Market Fields**

```sql
ALTER TABLE deals
  ADD COLUMN end_market_customers TEXT,
  ADD COLUMN customer_concentration TEXT,
  ADD COLUMN customer_geography TEXT;
```

**Migration: Add Additional Intelligence Fields**

```sql
ALTER TABLE deals
  ADD COLUMN key_risks TEXT[],
  ADD COLUMN competitive_position TEXT,
  ADD COLUMN technology_systems TEXT,
  ADD COLUMN real_estate TEXT,
  ADD COLUMN growth_trajectory TEXT;
```

---

## Document Changelog

| Version | Date       | Changes                             |
| ------- | ---------- | ----------------------------------- |
| 1.0     | 2026-02-05 | Initial comprehensive documentation |

---

**End of Documentation**
