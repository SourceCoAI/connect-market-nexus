

# Auto-Populate Featured Deals via Similarity Scoring

## Problem

Featured deals on listing pages are either manually selected or default to "most recent" listings. There's no intelligent matching. The admin has to manually pick 2 deals every time, which is tedious and often skipped.

## Solution

When `featured_deal_ids` is null (no manual override), automatically select the 2 most similar active marketplace listings using the same scoring algorithm already in `use-similar-listings.ts` (category overlap, revenue proximity, location match, EBITDA margin similarity). The manual override stays as-is.

## Changes

### File 1: `src/hooks/useDealLandingPage.ts`

Replace the default fallback (lines 148-160) that fetches "most recent" listings. Instead, fetch up to 50 active marketplace listings and score them against the current deal using category, revenue, location, and EBITDA similarity. Return the top 3 by score.

The scoring logic (already proven in `use-similar-listings.ts`):
- Category overlap: +60
- Revenue within 30%: +35
- Location match: +25 exact, +10 same country
- EBITDA margin within 5pp: +20
- Recent (30 days): +15

This runs client-side on a small dataset (50 listings max), so no edge function needed.

### File 2: `src/components/admin/editor-sections/EditorFeaturedDealsSection.tsx`

Add an "Auto-select similar deals" button next to the manual selectors. When clicked, it:
1. Fetches the current listing's category, revenue, ebitda, location
2. Scores all active marketplace listings against it (same algorithm)
3. Pre-fills the top 2 matches
4. Calls `onChange` with those IDs

Update the helper text from "Leave empty for automatic selection" to "Leave empty to auto-match similar deals, or pick manually."

### File 3: `src/components/admin/ImprovedListingEditor.tsx`

Pass `listing` data (category, categories, revenue, ebitda, location) to `EditorFeaturedDealsSection` so it can run similarity scoring without an extra DB fetch.

## How It Works

**For buyers (landing page)**: When `featured_deal_ids` is null, `useRelatedDeals` automatically scores and returns the 3 most similar listings instead of the 3 most recent. Manual overrides still take priority.

**For admins (editor)**: The section shows an "Auto-select" button. Click it to populate the 2 best matches. Clear them to revert to automatic. Pick manually to override.

## No edge function or migration needed

All scoring is client-side on small datasets (50-100 listings). The similarity algorithm is already proven in the codebase.

