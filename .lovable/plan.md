

# Auto-Enrich on Ingestion + Rich Lead Intelligence Panel

## Two Changes

### 1. Auto-Enrich on Ingestion

Currently enrichment only triggers when an admin opens the panel. Instead, trigger it automatically in `ingest-match-tool-lead` right after the upsert — fire-and-forget so it doesn't block the 200 response.

**File: `supabase/functions/ingest-match-tool-lead/index.ts`**

After the successful merge RPC, call the enrichment logic inline (same Firecrawl + Gemini pattern from `enrich-match-tool-lead`) but without auth checks since this is server-to-server. Only enrich if the lead doesn't already have `enrichment_data`. Fire-and-forget — don't await, don't block the response.

Since edge functions can't easily call other edge functions internally, inline the enrichment logic directly: after the upsert succeeds, check if enrichment_data is null, then scrape + Gemini + save. Wrap in a try/catch so failures never block ingestion.

### 2. Rich Lead Intelligence Panel

The CSV reveals significant untapped intel. Redesign the panel to show actionable decision-making data:

**New sections in `MatchToolLeadPanel.tsx`:**

| Section | Data Source | What It Shows |
|---------|-----------|---------------|
| **Seller Intent** | `raw_inputs.exit_timing`, `raw_inputs.intent_score`, `raw_inputs.converted`, submission_stage | Timeline badge ("Selling in 6-12m"), intent score bar, conversion status |
| **Buyer Match Results** | `raw_inputs.match_count` | "Matched with 160 buyers" — shows they saw value |
| **Business Profile** | `raw_inputs.company_name`, `raw_inputs.sector` | Self-reported company name and industry vertical |
| **Traffic Source** | `raw_inputs.source`, `raw_inputs.utm_source/medium/campaign` | How they found the tool (embed, standalone, UTM params) |
| **Visitor Geo** | `raw_inputs.city/region/country`, `raw_inputs.latitude/longitude` | Full location with map link |
| **Funnel Journey** | `raw_inputs.reached_step`, `submission_count`, `created_at → updated_at` | Steps completed, return visits, time on tool |
| **Company Intelligence** | `enrichment_data` (AI-generated) | One-liner, services, industry, signals (existing) |

**Priority display for decision-making:**
- Top: Seller intent + timeline (most actionable)
- Middle: Business profile + financials + match results
- Bottom: Traffic source + funnel journey + AI intel

**Visual treatment:**
- Intent score as a small radial/bar indicator
- Timeline as a colored badge (green = <6m urgent, amber = 6-12m, gray = 24m+)
- Match count as a prominent stat
- Funnel steps as a mini progress indicator (hero → basics → financials → results → form)

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/ingest-match-tool-lead/index.ts` | Add inline enrichment after upsert (fire-and-forget) |
| `src/pages/admin/remarketing/MatchToolLeads/MatchToolLeadPanel.tsx` | Redesign with seller intent, match results, traffic source, funnel journey sections |

