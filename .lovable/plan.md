

# Auto-Enrich Match Tool Leads: Logos + Company Intel Panel

## What We're Building

1. **Favicons/logos next to every website** — shown immediately, no API calls needed
2. **Side panel** that opens on row click with AI-generated company intelligence
3. **Edge function** (`enrich-match-tool-lead`) that scrapes the website via Firecrawl + uses Gemini to extract a concise company profile

## Architecture

```text
Lead Row Click
  ├─ Instant: Show favicon via Google's favicon API (no cost, no API)
  └─ Panel Opens → calls enrich-match-tool-lead edge function
       ├─ Firecrawl: scrape website markdown
       ├─ Gemini: extract structured company intel
       ├─ Cache result in match_tool_leads.enrichment_data (JSONB)
       └─ Return to panel (cached on subsequent opens)
```

## Plan

### 1. Logos — Zero-cost Google Favicon API

No scraping needed. Google provides favicons for any domain instantly:

```
https://www.google.com/s2/favicons?domain=example.com&sz=32
```

Add a 20×20 `<img>` before the domain text in LeadRow. Falls back gracefully to a generic globe icon if no favicon exists.

**File**: `index.tsx` — LeadRow website column only.

### 2. Database: Add `enrichment_data` Column

New JSONB column on `match_tool_leads` to cache enrichment results so we only scrape once per lead:

```sql
ALTER TABLE match_tool_leads 
ADD COLUMN IF NOT EXISTS enrichment_data jsonb DEFAULT NULL;
```

Schema of the cached JSON:
```json
{
  "company_name": "Gilbert Mechanical",
  "one_liner": "Commercial HVAC contractor in Phoenix, AZ",
  "services": ["HVAC installation", "maintenance", "repair"],
  "industry": "Home Services — HVAC",
  "geography": "Phoenix, AZ",
  "employee_estimate": "20-50",
  "year_founded": "2005",
  "notable_signals": ["Licensed contractor", "Serves commercial & residential"],
  "enriched_at": "2026-03-24T..."
}
```

### 3. Edge Function: `enrich-match-tool-lead`

- Accepts `{ lead_id, website }`
- Checks if `enrichment_data` already exists (cache hit → return immediately)
- Scrapes website via Firecrawl (markdown, main content only)
- Sends markdown to Gemini with a tight extraction prompt
- Saves result to `enrichment_data` column
- Returns the structured data

Uses existing `FIRECRAWL_API_KEY` and `GEMINI_API_KEY` (both already configured).

### 4. Lead Detail Panel (Sheet)

New `MatchToolLeadPanel.tsx` component using the existing `Sheet` pattern (same as ValuationLeadDetailDrawer):

- Opens on row click
- Shows:
  - Large favicon + domain + business name
  - Stage badge + date
  - Contact info (if available)
  - Financials (if available)
  - **Company Intel section** — one-liner, services list, industry, geography, employee estimate, year founded, notable signals
  - Loading skeleton while enrichment fetches
- Actions: "Not a Fit", "Delete", external link to website

### 5. Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/[new].sql` | Add `enrichment_data` JSONB column |
| `supabase/functions/enrich-match-tool-lead/index.ts` | New edge function: Firecrawl scrape → Gemini extract → cache |
| `src/pages/admin/remarketing/MatchToolLeads/MatchToolLeadPanel.tsx` | New Sheet-based detail panel with company intel |
| `src/pages/admin/remarketing/MatchToolLeads/index.tsx` | Add favicon images to LeadRow, wire row click → panel open |
| `src/pages/admin/remarketing/MatchToolLeads/types.ts` | Add `enrichment_data` to MatchToolLead interface |
| `src/pages/admin/remarketing/MatchToolLeads/useMatchToolLeadsData.ts` | Add `enrichLead` mutation that calls the edge function |

