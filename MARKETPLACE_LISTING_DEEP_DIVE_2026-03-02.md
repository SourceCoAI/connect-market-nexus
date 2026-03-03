# Marketplace Listing Creation — Deep Dive Audit

**Date:** 2026-03-02
**Scope:** End-to-end review of the marketplace listing creation system — database, workflow, AI prompts, automation, frontend, publishing, and security. Post-deal-pipeline rebuild.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Layer](#2-database-layer)
3. [Deal-to-Listing Workflow](#3-deal-to-listing-workflow)
4. [AI Content Generation](#4-ai-content-generation)
5. [Frontend: Editor & Forms](#5-frontend-editor--forms)
6. [Publishing Pipeline](#6-publishing-pipeline)
7. [Pipeline Health Checks](#7-pipeline-health-checks)
8. [Security & Data Protection](#8-security--data-protection)
9. [What's Working Well](#9-whats-working-well)
10. [Issues & Gaps Found](#10-issues--gaps-found)
11. [Recommendations](#11-recommendations)

---

## 1. Architecture Overview

The marketplace listing creation follows a **deal-first architecture**: deals (internal company records) are enriched, scored, and pushed to a marketplace queue. From there, an admin creates an anonymized marketplace listing, generates AI-powered memo content, and publishes to the buyer-facing marketplace.

### Key Data Flow

```
Deal (internal, in listings table with is_internal_deal=true)
  │
  ├── Enrichment Pipeline (enrich-deal: transcripts, website scrape, LinkedIn, Google)
  ├── Quality Scoring (calculate-deal-quality: revenue/EBITDA/employee scoring)
  │
  ▼
Marketplace Queue (pushed_to_marketplace=true on listings table)
  │
  ├── Admin reviews deal, clicks "Create Listing"
  ├── anonymizeDealToListing() strips company identity
  │
  ▼
Marketplace Listing (new row in listings table, source_deal_id→parent deal)
  │
  ├── AI Lead Memo Generation (generate-lead-memo: Claude Sonnet)
  │   ├── Full Memo (post-NDA, with company name)
  │   └── Anonymous Teaser (blind profile, codename only)
  │       └── Syncs custom_sections + description back to listing
  │
  ├── Admin edits in ImprovedListingEditor
  ├── PDF uploads to data_room_documents
  │
  ▼
Publishing (publish-listing edge function)
  │
  ├── Quality gate: title, description, category, location, revenue, EBITDA, image, PDFs
  ├── Sets is_internal_deal=false, published_at timestamp
  │
  ▼
Live on Marketplace (visible to buyers via marketplace_listings view)
```

### Single Source of Truth

The `listings` table serves as the **single source of truth** for all company/deal data. This is architecturally validated by `listingsSourceOfTruth.test.ts`, which uses TypeScript conditional types to enforce at compile time that:

- Enrichment columns (deal_total_score, executive_summary, service_mix, geographic_states, etc.) live on `listings`, NOT on `deal_pipeline`
- Seller contact columns (main_contact_name, email, phone, title) live on `listings`
- Address columns (city, state, zip) live on `listings`
- The `deal_pipeline` table only tracks buyer journeys — it never duplicates company data

---

## 2. Database Layer

### 2.1 The `listings` Table

Dual-purpose table — stores both internal deals (is_internal_deal=true) and marketplace listings (is_internal_deal=false).

**Core fields:** title, description, description_html, description_json, hero_description, categories, category, location, revenue, ebitda, ebitda_margin, image_url, status, status_tag, tags

**Internal/admin fields:** internal_company_name, internal_notes, internal_salesforce_link, internal_deal_memo_link, primary_owner_id, presented_by_admin_id, main_contact_name/email/phone/title, website, address_city/state/zip

**Enrichment fields:** executive_summary, services, service_mix, geographic_states, deal_total_score, linkedin_employee_count, google_rating, google_review_count, enriched_at, is_priority_target

**Marketplace queue fields:** pushed_to_marketplace (bool), pushed_to_marketplace_at (timestamp), pushed_to_marketplace_by (UUID)

**Publishing fields:** is_internal_deal (bool), published_at (timestamp), published_by_admin_id (UUID), source_deal_id (self-referential FK to parent deal)

**Content/landing page fields:** custom_sections (JSONB array of {title, description}), investment_thesis, growth_drivers, competitive_position, ownership_structure, seller_motivation, business_model, customer_geography, customer_types, revenue_model, end_market_description

**Buyer visibility:** visible_to_buyer_types (text[] of: privateEquity, corporate, familyOffice, searchFund, individual, independentSponsor, advisor, businessOwner)

**Custom metrics:** 4 configurable metric slots (revenue, EBITDA built-in, metric_3 and metric_4 can be employees/custom)

### 2.2 The `marketplace_listings` View

**File:** `supabase/migrations/20260304300000_marketplace_listings_view.sql`

Defense-in-depth database view that enforces `is_internal_deal = false` and `deleted_at IS NULL` at the SQL level. Selects only safe, buyer-visible columns. Even if the application layer has a bug, confidential data cannot leak through this view.

### 2.3 The `deal_pipeline` Table

**File:** `supabase/migrations/20260506000000_rename_deals_to_deal_pipeline.sql`

Renamed from `deals` to `deal_pipeline` to clarify its purpose — tracking **buyer journeys** through the pipeline, not company data. Contains: listing_id (FK to listings), stage_id, source, contact_name/email/company, nda_status, fee_agreement_status, priority, probability, remarketing_buyer_id.

Key functions rebuilt in this migration:
- `move_deal_stage_with_ownership()`
- `get_deals_with_buyer_profiles()`
- `get_deals_with_details()`
- `create_deal_from_connection_request()`
- `create_deal_from_inbound_lead()`
- `create_deal_on_request_approval()`

### 2.4 The `lead_memos` Table

Stores AI-generated memos: deal_id, memo_type (full_memo/anonymous_teaser), branding, content (JSONB sections), html_content, status (draft/published), pdf_storage_path, generated_from (source tracking), created_by.

### 2.5 The `data_room_documents` Table

Stores uploaded PDFs: deal_id, document_category (full_memo/anonymous_teaser/other), storage_path, metadata. These are the **final PDF versions** that the publishing gate checks for.

### 2.6 Dead Column Cleanup

**File:** `supabase/migrations/20260506300000_drop_dead_listings_columns.sql`

Drops deprecated columns that were migrated or never used: seller_interest_analyzed_at, seller_interest_notes, lead_source_id. Confirmed absent via compile-time type checks in tests.

---

## 3. Deal-to-Listing Workflow

### 3.1 Marketplace Queue (`src/pages/admin/MarketplaceQueue.tsx`)

- Queries `listings` where `pushed_to_marketplace = true`
- Shows: company name, industry, revenue, EBITDA, score, push date
- De-duplicates by checking for existing listings with matching `source_deal_id`
- Supports search, sort by push date/name/score
- "Create Listing" button navigates to `CreateListingFromDeal`

### 3.2 Anonymization (`src/lib/deal-to-listing-anonymizer.ts`)

The `anonymizeDealToListing()` function transforms deal data:

**Title generation** — 3 template patterns:
1. Revenue-anchored: "$X.XM [Industry] Platform — [State]"
2. Margin-anchored: "High-Margin [Industry] Business in [State]"
3. Years-anchored: "XX+ Year [Industry] Business in [State]"

Selection logic: high margins → pattern 2, has revenue → pattern 1, 10+ years → pattern 3, fallback generic.

**Description generation:**
- If executive_summary or description > 100 chars: anonymize existing text via `stripIdentifyingInfo()`
- Otherwise: build 3-paragraph structured description from fields (overview, financials, market position)

**Hero description generation:**
- Highlights: years, revenue, margins, employees, locations
- Varied sentence construction based on available data
- Capped at 500 characters

**Identity stripping (`stripIdentifyingInfo`):**
- Company name + common suffixes (Inc, LLC, Corp, etc.)
- Contact names (full + individual parts >=3 chars)
- Email addresses (regex pattern)
- Phone numbers (US format regex)
- Website URLs and domain bases (>=4 chars)
- Internal deal memo links
- Sorted by length (longest first) to prevent partial matches

**Custom metrics auto-population:**
- metric_3: If services exist → "Service Lines" count; else → employees
- metric_4: Defaults to ebitda_margin

### 3.3 Listing Creation (`src/pages/admin/CreateListingFromDeal.tsx`)

1. Fetches deal data from `listings` table (the source deal)
2. Calls `anonymizeDealToListing()` to generate prefilled form data
3. Auto-triggers AI content generation when prefilled data is ready
4. Renders `ImprovedListingEditor` with prefilled values
5. On submit: calls `useRobustListingCreation` which:
   - Validates via Zod schema
   - Sanitizes arrays, strings, numbers
   - Inserts new row with `is_internal_deal = true`, `source_deal_id = dealId`
   - Sets `custom_sections = []` (populated later by lead memo)
6. Checks for existing listing (dedup via source_deal_id)

### 3.4 Robust Creation Hook (`src/hooks/admin/listings/use-robust-listing-creation.ts`)

**Validation/sanitization functions:**
- `sanitizeArrayField()` — removes empty strings, deduplicates
- `sanitizeStringField()` — trims whitespace, validates length
- `sanitizeNumericField()` — parses currency format strings ("$1.5M" → 1500000)

**Insert payload:** Explicitly maps every field (no `SELECT *`), sets `is_internal_deal: true` for new listings, connects via `source_deal_id`.

---

## 4. AI Content Generation

### 4.1 Lead Memo Generator (`supabase/functions/generate-lead-memo/index.ts`)

**Model:** Claude Sonnet (DEFAULT_CLAUDE_MODEL) via Anthropic API
**Temperature:** 0.3 (low creativity, factual)
**Max tokens:** 16,384

**Auth:** Admin-only via `requireAdmin()` middleware

**Memo types:** anonymous_teaser, full_memo, both

**Guard:** Anonymous teaser requires a Final PDF of the Full Lead Memo to already be uploaded to `data_room_documents`. This ensures the full memo is reviewed/approved before the blind teaser goes out.

**Data context builder** collects from 5 sources (in priority order):
1. **Transcripts** — up to 10 most recent, 25K chars each. Includes extracted_data JSON.
2. **General Notes** — admin-entered notes from internal_notes field
3. **Enrichment Data** — website scrape + LinkedIn data (description, executive_summary, services, service_mix, etc.)
4. **Manual Entries** — admin-entered structured fields (company name, contact info, seller motivation, etc.)
5. **Valuation Data** — from valuation_leads if applicable

**Source priority:** Transcripts > General Notes > Enrichment/Website > Manual entries

### 4.2 AI Prompt Architecture

**System prompt** — VP-level investment bank memo for PE firm investment committee

**Anonymous Teaser prompt (9 required sections):**
1. Company Overview (3-5 paragraphs)
2. Financial Overview (3-year table + narrative)
3. Services & Operations (3-5 paragraphs)
4. Ownership & Management (2-3 paragraphs)
5. Employees & Workforce
6. Facilities & Locations
7. Growth Opportunities (3-4 paragraphs)
8. Key Considerations (risks)
9. Transaction Overview

**Anonymity rules (comprehensive):**
- NO company name — use codename only (e.g., "Project Southeast")
- NO owner/CEO name — use "the owner," "the founder"
- NO street address, city, or specific state names
- Use broad regional descriptors only ("Southeast United States")
- NO website, email, phone
- NO specific client/partner/vendor names
- Financial data as ranges only ("$4.5M–$5.5M revenue")
- NO founding dates — use approximate years ("approximately 3–5 years")
- Explicit BANNED TERMS list generated from deal data

**Full memo prompt (9 sections):**
1. Header
2. Contact Information
3. Company Overview
4. Ownership & Management
5. Services & Operations
6. Financial Overview
7. Employees & Workforce
8. Facilities & Locations
9. Transaction Overview

### 4.3 Post-Processing Pipeline

Three post-processors run sequentially on AI output:

1. **`enforceBannedWords()`** — Strips marketing buzzwords: "strong", "robust", "impressive", "attractive", "compelling", "well-positioned", "significant opportunity", "poised for growth", "track record of success", "best-in-class", "proven", "demonstrated", "synergies", "uniquely positioned", "market leader", "value creation opportunity"

2. **`stripDataNeededTags()`** — Removes `[DATA NEEDED: ...]` and `[VERIFY: ...]` placeholder tags that the AI sometimes generates despite instructions

3. **`enforceAnonymization()`** (anonymous teasers only) — Programmatic safety net:
   - Strips company name, title, website/domain, contact name/email/phone, city name
   - Replaces specific state names with regional descriptor
   - Strips remaining emails, phone numbers, URLs via regex
   - Cleans up orphaned punctuation/whitespace

### 4.4 Listing Sync

After anonymous teaser generation, sections are synced back to the listing:
- `custom_sections` ← teaser sections (excluding header_block and contact_information)
- `description` ← company_overview section content
- `description_html` ← basic HTML conversion of description

This makes the lead memo the **single source of truth for listing content**.

### 4.5 Deal Enrichment AI (`supabase/functions/enrich-deal/index.ts`)

**Model:** Gemini 2.0 Flash
**Sources:** Transcripts (Gemini extraction), Firecrawl (website scraping), LinkedIn (Apify), Google Reviews (Apify)

**Source-priority merge system** — prevents lower-confidence sources from overwriting higher-confidence data. Financial data (revenue, EBITDA) is **blocked from website scraping** — only allowed from transcripts or manual entry.

**Column whitelist** (`VALID_LISTING_UPDATE_KEYS`) — 35 explicitly allowed columns. Prevents schema-cache 500 errors from invalid column names.

### 4.6 Deal Quality Scoring (`supabase/functions/calculate-deal-quality/index.ts`)

Scoring algorithm with two paths:

**Path A (has financials):** Revenue score (0-75) + EBITDA score (0-25) + LinkedIn boost. Revenue bands from <$5M (44) to $100M+ (75).

**Path B (no financials):** Employee waterfall: LinkedIn count → LinkedIn range → website FT+PT → team page. Estimates deal size from headcount.

**Employee source waterfall:** linkedin_employee_count → linkedin_employee_range (midpoint estimation) → full_time + part_time → team_page_employee_count

---

## 5. Frontend: Editor & Forms

### 5.1 Listing Form Architecture

`ListingForm.tsx` → delegates to `ImprovedListingEditor.tsx`

The editor is modular with section components:
- `EditorTopBar` — title, categories, acquisition type, status/tag
- `EditorFinancialCard` — revenue, EBITDA, employees
- `EditorDescriptionSection` — main description (rich text)
- `EditorHeroDescriptionSection` — short hero text (500 char max)
- `EditorVisualsSection` — image upload
- `EditorInternalCard` — internal company name, owner, salesforce link, contact info, notes
- `EditorLandingPageContentSection` — investment thesis, growth drivers, competitive position, etc.
- `EditorLivePreview` — real-time preview of how the listing will look
- `EditorBuyerVisibilitySection` — buyer type visibility controls

### 5.2 Form Schema (Zod)

```
title: string, 5-100 chars
categories: string[], min 1
acquisition_type: 'add_on' | 'platform' (optional)
location: string (required, from array select)
revenue: currency string → number, >= 0
ebitda: currency string → number, >= 0
full_time_employees: int, >= 0 (optional)
part_time_employees: int, >= 0 (optional)
description: string, min 20 chars
description_html: string (optional)
hero_description: string, max 500 (optional)
status: 'active' | 'inactive'
status_tag: string (optional)
visible_to_buyer_types: enum[] of 8 buyer types (optional)
custom_sections: JSONB (optional)
+ 15 internal/metric fields
```

---

## 6. Publishing Pipeline

### 6.1 Publish Listing Hook (`src/hooks/admin/listings/use-publish-listing.ts`)

Calls the `publish-listing` edge function with listing_id and action (publish/unpublish).

### 6.2 Publish Listing Edge Function (`supabase/functions/publish-listing/index.ts`)

**Auth:** Admin-only (JWT + is_admin RPC)

**Publish action quality checks:**
1. Title >= 5 characters
2. Description >= 50 characters
3. At least one category
4. Location present
5. Revenue > 0
6. EBITDA present (any value)
7. Image URL present
8. Both PDF memos present in `data_room_documents` (full_memo + anonymous_teaser)

**On publish:** Sets `is_internal_deal = false`, `published_at = now()`, `published_by_admin_id = caller`

**On unpublish:** Sets `is_internal_deal = true`, clears `published_at` and `published_by_admin_id`

### 6.3 Marketplace Visibility

Buyers see listings through the `marketplace_listings` view and the `use-listings.ts` hook which enforces:
- `status = 'active'`
- `deleted_at IS NULL`
- `is_internal_deal = false`
- Explicit safe column list (no SELECT *)
- Full-text search via PostgreSQL FTS index

---

## 7. Pipeline Health Checks

### 7.1 Pipeline Checks (`src/pages/admin/listing-pipeline/runPipelineChecks.ts`)

10 sequential checks for a given deal:

| # | Check | Pass Criteria |
|---|-------|---------------|
| 1 | Deal exists | Can fetch from listings table |
| 2 | Push gate: deal fields (8 checks) | Website, revenue, EBITDA, location, category/industry, description, contact name, contact email |
| 3 | Push gate: memo PDFs | Both full_memo + anonymous_teaser in data_room_documents |
| 4 | In marketplace queue | pushed_to_marketplace = true |
| 5 | Lead memo drafts | Full memo + teaser exist in lead_memos table |
| 6 | Marketplace listing exists | A listing with source_deal_id = this deal exists |
| 7 | Listing quality | Title >= 5, description >= 50, category, location, revenue > 0, EBITDA, image |
| 8 | Listing memo PDFs | Both PDFs found for the created listing |
| 9 | Publishing status | is_internal_deal = false AND published_at set |
| 10 | Landing page content | >= 5 of 13 content fields populated |

---

## 8. Security & Data Protection

### 8.1 Defense-in-Depth Layers

1. **Database view** (`marketplace_listings`) — enforces `is_internal_deal = false` at SQL level
2. **RLS policies** — admin-only access to internal fields; buyers see only safe columns
3. **Application layer** — explicit safe column list in `use-listings.ts` (no SELECT *)
4. **Anonymization** — `deal-to-listing-anonymizer.ts` strips all identifying info
5. **AI post-processing** — `enforceAnonymization()` catches anything the AI leaked
6. **Publishing gate** — quality requirements enforced by edge function
7. **Buyer type visibility** — `visible_to_buyer_types` array controls which buyer types can see each listing

### 8.2 Internal Field Protection

Fields that never reach the marketplace:
- internal_company_name, internal_notes, internal_salesforce_link, internal_deal_memo_link
- main_contact_name/email/phone/title
- website, address_city/state/zip (specific)
- primary_owner_id, presented_by_admin_id

### 8.3 Financial Data Protection

Financial fields (revenue, EBITDA) are **blocked from website scraping** in the enrichment pipeline — only allowed from transcripts or manual entry. This prevents incorrect public financial data from polluting deal records.

---

## 9. What's Working Well

### Architecture
- **Single source of truth** — `listings` table with compile-time type enforcement tests
- **Clean separation** — `deal_pipeline` tracks buyer journeys, `listings` holds company data
- **Defense-in-depth** — 7 layers of protection for confidential data
- **Modular edge functions** — each function has a clear purpose and documented header

### AI System
- **Multi-source context** — transcripts, enrichment, notes, valuation all feed the AI
- **Source priority system** — prevents low-quality data from overwriting high-quality data
- **3-layer post-processing** — banned words, placeholder stripping, anonymization enforcement
- **Comprehensive anonymity rules** — explicit banned terms, state-to-region mapping, regex fallbacks
- **Few-shot examples** in prompt — correct tone calibration (RIA, defense contractor, plumbing)
- **Banned word list** — prevents marketing fluff ("robust", "compelling", "synergies")

### Workflow
- **Pipeline health checks** — 10 sequential checks give full visibility into deal readiness
- **Dedup protection** — CreateListingFromDeal checks for existing listings via source_deal_id
- **Guard on anonymous teaser** — requires full memo PDF before generating blind profile
- **Auto-sync** — anonymous teaser sections automatically sync to listing custom_sections and description

### Frontend
- **Modular editor** — 8 section components keep the form organized
- **Zod validation** — schema-level enforcement with meaningful error messages
- **Robust creation hook** — sanitization of arrays, strings, and currency values
- **Live preview** — editors can see the listing as buyers will see it

---

## 10. Issues & Gaps Found

### P0 — Critical

1. **No image generation or assignment in the deal-to-listing flow.** The publish gate requires an image (`image_url`), but `anonymizeDealToListing()` doesn't generate or assign one, and `CreateListingFromDeal.tsx` doesn't prefill it. Every listing will fail the image check at publish time until an admin manually uploads one. This is a known friction point — the editor has an image upload section, but there's no automation or placeholder generation.

2. **Duplicate `STATE_CODE_TO_NAME` maps across the codebase.** The state code-to-name mapping is defined independently in at least 3 places: `deal-tools.ts`, `generate-lead-memo/index.ts` (twice — in `enforceAnonymization()` and `generateMemo()`). Each is maintained separately, creating risk of drift. Should be consolidated into `_shared/geography.ts`.

### P1 — High

3. **Anonymous teaser generation syncs content to the source deal, not the marketplace listing.** In `generate-lead-memo/index.ts` (line ~228), the sync of `custom_sections` and `description` updates `.eq('id', deal_id)` — that's the **source deal**, not the marketplace listing. If memo generation runs after the listing exists, the marketplace listing's custom_sections won't get updated. The sync should also target listings where `source_deal_id = deal_id`.

4. **`convert-to-pipeline-deal` auto-creates `firm_agreements` without dedup check.** If a remarketing buyer doesn't have a `marketplace_firm_id`, the function creates a new `firm_agreements` row (line ~182). But there's no check for existing firms by `normalized_company_name` or `email_domain` — could create duplicate firms across multiple conversions for the same buyer company.

5. **Marketplace Queue doesn't filter by `is_internal_deal`.** `MarketplaceQueue.tsx` queries `listings` where `pushed_to_marketplace = true` but doesn't add `.eq('is_internal_deal', true)`. Already-published marketplace listings (is_internal_deal=false) could show up in the queue alongside pending items.

### P2 — Medium

6. **Landing page content fields never populated.** The 13 content fields checked by pipeline check #10 (investment_thesis, growth_drivers, competitive_position, etc.) remain null when a listing is created. The anonymous teaser sync only populates `custom_sections` and `description` — not those 13 individual fields. The landing page content pipeline check will always show most fields as unpopulated.

7. **Deal detail fields not carried to new listings.** `CreateListingFromDeal` doesn't pass `services`, `service_mix`, `geographic_states`, or any of the enrichment detail fields to the new listing. These columns exist on the listing schema but are left empty, reducing listing quality and search accuracy.

8. **Currency normalization inconsistency.** `calculate-deal-quality` has its own `normalizeFinancial()` that interprets values < 1000 as millions and < 100000 as thousands. This is separate from `parseCurrency()` in the frontend. If storage conventions aren't consistent, scoring can misinterpret values.

9. **Basic `description_html` generation.** When syncing the anonymous teaser's company_overview to the listing (line ~216), the HTML conversion only handles bold, italic, and paragraph breaks. It misses bullet points and tables that the AI commonly generates. The full `markdownToHtml()` function exists later in the same file but isn't used for this sync.

### P3 — Low

10. **`stateToRegion` map excludes US territories** (PR, GU, VI, AS, MP). Territory-based deals default to region "Central" which is geographically incorrect.

11. **`enforceBannedWords()` word-boundary matching** may not consistently catch hyphenated phrases like "well-positioned" due to how `\b` treats hyphens.

12. **Lead memo few-shot examples contain named companies** (Brook Capital LLC, NES). While instructional and not surfaced in output, they could theoretically bias AI toward those industry domains.

---

## 11. Recommendations

### Immediate (Address now)

1. **Fix the custom_sections sync target** (P1 #3) — After generating an anonymous teaser, also sync custom_sections and description to any listing where `source_deal_id = deal_id`. This ensures marketplace listings always have up-to-date content from the memo.

2. **Filter MarketplaceQueue by `is_internal_deal = true`** (P1 #5) — Add `.eq('is_internal_deal', true)` to the queue query to exclude already-published listings.

3. **Consolidate state/geography maps** (P0 #2) — Move all state-to-name and state-to-region mappings into `_shared/geography.ts`. Export and import from the single location everywhere.

### Short-term

4. **Add firm dedup check** (P1 #4) — Before creating a new `firm_agreements` row in `convert-to-pipeline-deal`, check for existing firms by `normalized_company_name` or `email_domain`. Link to existing firm if found.

5. **Pass deal detail fields to new listings** (P2 #7) — When creating a listing from a deal, carry over: services, service_mix, geographic_states, investment_thesis, growth_drivers, competitive_position, ownership_structure, business_model, customer_geography, customer_types, revenue_model, end_market_description.

6. **Use full `markdownToHtml()` for listing sync** (P2 #9) — Replace the basic regex HTML conversion with the same `markdownToHtml()` function used for the full memo rendering.

### Future Enhancements

7. **Automated listing image generation** — Generate industry-themed placeholder images to reduce the manual image upload bottleneck.

8. **Listing creation from AI Command Center** — Allow the AI assistant to create marketplace listings directly, using the same anonymization and validation pipeline.

9. **Listing quality score** — Add a calculated quality score to listings (similar to deal_total_score) factoring in: content completeness, image, description length, memo availability.

10. **Bulk listing creation** — For deals that pass all gate checks, allow batch creation of marketplace listings from the queue.
