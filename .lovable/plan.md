

# Fix Dates & Redesign Match Tool Leads

## Problem
1. **Wrong dates**: The backfill used the edge function which sets `created_at = now()`, so all 13 leads show "24/03/2026" instead of their real dates (March 6–24 from the CSV).
2. **Design is flat**: All rows look the same regardless of lead quality. Full-form leads (who want the buyer list) should stand out visually.

## Plan

### 1. Fix Dates via SQL Migration

Run an UPDATE that sets correct `created_at` from the CSV data, matching by normalized website URL:

```sql
UPDATE match_tool_leads SET created_at = '2026-03-06T12:12:46Z' WHERE lower(website) = 'https://gilbertmechanical.com';
UPDATE match_tool_leads SET created_at = '2026-03-09T14:11:44Z' WHERE lower(website) = 'https://autobahn.com';
UPDATE match_tool_leads SET created_at = '2026-03-09T16:27:29Z' WHERE lower(website) = 'https://saksmetering.com';
UPDATE match_tool_leads SET created_at = '2026-03-10T17:05:57Z' WHERE lower(website) = 'https://bill martin';
UPDATE match_tool_leads SET created_at = '2026-03-10T17:15:00Z' WHERE lower(website) = 'https://www.ur24technology.com/';
UPDATE match_tool_leads SET created_at = '2026-03-12T19:57:57Z' WHERE lower(website) = 'https://spotlightreporting.com';
UPDATE match_tool_leads SET created_at = '2026-03-14T22:35:10Z' WHERE lower(website) = 'https://www.ourayservices.com/';
UPDATE match_tool_leads SET created_at = '2026-03-17T14:53:41Z' WHERE lower(website) = 'https://ninakendosa.com';
UPDATE match_tool_leads SET created_at = '2026-03-17T23:56:17Z' WHERE lower(website) = 'https://dbssearch.today/';
UPDATE match_tool_leads SET created_at = '2026-03-18T00:39:05Z' WHERE lower(website) = 'https://integrityrc.com/';
UPDATE match_tool_leads SET created_at = '2026-03-24T13:13:03Z' WHERE lower(website) = 'https://aquasafepool.com';
-- test records excluded
```

Also update `business_name`, `industry`, `location` from CSV raw_inputs where available (e.g., "Integrity Roofing & Construction", "OURAY", "Digimedia").

### 2. Redesign the UI — `index.tsx`

**Full-form leads get a highlighted row treatment:**
- Left border accent (emerald/green) on full_form rows
- Subtle green background tint (`bg-emerald-50/50`)
- A small "Wants Buyer List" indicator badge
- Contact info displayed more prominently inline

**Browse/financials rows stay clean and minimal:**
- No background tint, standard row
- Muted text for missing data instead of "—" dashes everywhere

**General design improvements:**
- Remove the outer border wrapper, use hairline separators only (quiet luxury pattern)
- Cleaner header with count integrated, not a separate badge
- Relative dates ("3d ago", "2w ago") instead of absolute dates
- Stage badges: smaller, pill-style, color-coded (gray for browse, blue for financials, emerald for full_form)
- Financials displayed as a compact single line: "Rev $5M–10M · Profit $500K–1M"
- Location/geo info from raw_inputs shown as subtle secondary text
- Remove redundant external link icon (the link on the domain is enough)

### 3. Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/[new].sql` | UPDATE created_at + business metadata for backfilled leads |
| `src/pages/admin/remarketing/MatchToolLeads/index.tsx` | Full redesign of layout and LeadRow component |
| `src/pages/admin/remarketing/MatchToolLeads/useMatchToolLeadsData.ts` | Add "Has Financials" tab filter for `financials` stage specifically |

