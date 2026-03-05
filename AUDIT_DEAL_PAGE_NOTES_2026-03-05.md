# Audit: Deal Page Notes System (Post-Fix)

**Date:** 2026-03-05
**Scope:** All notes-related functionality on the ReMarketing Deal Detail page
**Status:** All issues from initial audit have been resolved

---

## 1. Overview: How Notes Work on Deal Pages

The deal detail page (`/admin/remarketing/deals/:dealId`) has **three distinct notes systems** serving different purposes:

### 1A. General Notes (Overview Tab)

**Component:** `src/components/remarketing/deal-detail/GeneralNotesSection.tsx`
**DB Column:** `listings.general_notes` (text field on the `listings` table)
**Location in UI:** Bottom of the Overview tab, collapsed by default

**How it works:**
- A single large textarea where admins paste raw notes (call transcripts, owner conversations, business details)
- "Save Notes" persists the text to the `listings.general_notes` column via `updateDealMutation` (a direct Supabase `.update()` on `listings`)
- "Enrich Notes" triggers the `analyze-deal-notes` Supabase Edge Function, which:
  1. Runs regex pre-extraction for revenue, EBITDA, margin, employees, locations, geography
  2. Sends the text (up to 15,000 chars) to Gemini AI for structured extraction (owner goals, services, industry, financials, key quotes, etc.)
  3. Merges regex + AI results using source-priority logic (regex wins for numeric fields)
  4. Updates 20+ fields on the `listings` row with extracted intelligence
  5. Sets `notes_analyzed_at` timestamp and updates `extraction_sources` provenance

**Data flow:**
`UI textarea -> listings.general_notes -> analyze-deal-notes edge function -> listings.* (many fields)`

### 1B. Listing Notes Log (Contact History Tab)

**Component:** `src/components/remarketing/deal-detail/ListingNotesLog.tsx`
**DB Table:** `listing_notes` (separate table with individual note entries)
**Location in UI:** Bottom of the Contact History tab

**How it works:**
- A chronological feed of individual timestamped notes + Fireflies meeting summaries
- Each note has: author (admin), timestamp, and text content
- Notes are stored in a separate `listing_notes` table (one row per note)
- Supports add, delete (with confirmation dialog), and Cmd+Enter keyboard shortcut for submission
- Merges with `deal_transcripts` (source='fireflies') into a unified timeline sorted newest-first
- Fireflies entries show call title, duration, and a 2-sentence summary truncation

**Data flow:**
`UI textarea -> listing_notes table (INSERT) -> merged timeline with deal_transcripts`

### 1C. Additional Info / Internal Notes (Overview Tab)

**Component:** `src/components/remarketing/deal-detail/AdditionalInfoCard.tsx`
**DB Columns:** `listings.owner_notes`, `listings.internal_notes`, `listings.key_risks`, `listings.technology_systems`, `listings.real_estate_info`, `listings.growth_trajectory`
**Location in UI:** Near bottom of Overview tab, in the "Additional Information" card

**How it works:**
- A structured card with 6 editable fields (key risks, technology, real estate, growth, other notes, internal notes)
- Edit opens a dialog with separate textareas for each field
- Saves all 6 fields in a single `updateDealMutation` call to the `listings` table
- "Internal Notes (Private)" is visually separated with a border-top

**Data flow:**
`UI dialog -> listings.owner_notes, listings.internal_notes, etc. -> listings table UPDATE`

---

## 2. Issues Found and Fixed

### FIXED (was CRITICAL): ListingNotesLog referenced a DROPPED table

**Files changed:**
- `supabase/migrations/20260522000000_restore_listing_notes.sql` (new) -- Recreates the `listing_notes` table with the same schema and RLS policies as the original
- `src/components/remarketing/deal-detail/ListingNotesLog.tsx` -- Removed all `UntypedTable` / `any` casts; queries now use `supabase.from('listing_notes')` directly

**What was wrong:** The `listing_notes` table was dropped in migration `20260503000000_drop_unused_tables.sql` but the `ListingNotesLog` component still queried it. The `as UntypedTable` (`any`) cast hid this from TypeScript.

**Fix:** Created a new migration to restore the table, and removed all `any` type casts from the component.

### FIXED (was MEDIUM): Stale state after General Notes save/enrichment

**File changed:** `src/components/remarketing/deal-detail/GeneralNotesSection.tsx`

**What was wrong:** `editedNotes` was initialized from the `notes` prop on mount but never synced when the prop changed after save/refetch.

**Fix:** Added a `useEffect` with a `lastSavedNotes` ref that syncs `editedNotes` when the prop changes externally, but only if the user hasn't made local edits since the last known value. Also updates `lastSavedNotes` after a successful save.

### FIXED (was MEDIUM): Fake progress bars replaced with honest spinners

**Files changed:**
- `src/components/remarketing/deal-detail/GeneralNotesSection.tsx` -- Removed the fake `setInterval`-based progress bar; now shows a simple spinner with "Analyzing notes... This may take a minute."
- `src/pages/admin/remarketing/ReMarketingDealDetail/useDealDetail.ts` -- Removed `enrichmentProgress`, `enrichmentStage`, and the `progressTimerRef` with its cleanup effect. Enrichment handler now just shows a spinner while queuing.
- `src/pages/admin/remarketing/ReMarketingDealDetail/WebsiteActionsCard.tsx` -- Removed `Progress` import, `enrichmentProgress`/`enrichmentStage` props, and the fake progress bar. Now shows a simple "Queuing enrichment..." spinner.
- `src/pages/admin/remarketing/ReMarketingDealDetail/OverviewTab.tsx` -- Removed `enrichmentProgress`/`enrichmentStage` from props interface and destructuring.
- `src/pages/admin/remarketing/ReMarketingDealDetail/index.tsx` -- Removed `enrichmentProgress`/`enrichmentStage` from destructuring and prop passing.

### FIXED (was LOW): No delete confirmation for notes

**File changed:** `src/components/remarketing/deal-detail/ListingNotesLog.tsx`

**What was wrong:** Clicking the trash icon immediately deleted the note with no confirmation.

**Fix:** Added an `AlertDialog` that shows the first 80 characters of the note and requires explicit confirmation before deletion.

### FIXED (was LOW): UntypedTable casts bypassed type safety

**File changed:** `src/components/remarketing/deal-detail/ListingNotesLog.tsx`

**What was wrong:** Every Supabase table reference used `as UntypedTable` (`any`), hiding the fact that `listing_notes` was no longer in the DB.

**Fix:** Removed the `UntypedTable` type alias entirely. `listing_notes` queries now use `supabase.from('listing_notes')` directly (table exists after the restore migration). `deal_transcripts` queries use `supabase.from('deal_transcripts')` directly (already in generated types). The `insert` call uses `as never` for the type mismatch since `listing_notes` isn't in the generated Supabase types yet.

### FIXED (was INFO): analyze-deal-notes fallback chain

**File changed:** `supabase/functions/analyze-deal-notes/index.ts`

**What was wrong:** When `notesText` was empty, the function fell back through `general_notes -> internal_notes -> owner_notes`, potentially analyzing the wrong notes field.

**Fix:** Changed to only fall back to `general_notes`. The `internal_notes` and `owner_notes` fields are separate concepts (structured additional info) and should not be silently processed by the enrichment pipeline.

---

## 3. Architecture Diagram (Post-Fix)

```
Deal Detail Page
|
|-- Overview Tab
|   |-- GeneralNotesSection
|   |   |-- Reads/writes: listings.general_notes (single text field)
|   |   |-- "Enrich Notes" -> analyze-deal-notes edge fn -> updates 20+ listing fields
|   |   |-- State syncs with prop changes via useEffect + lastSavedNotes ref
|   |
|   |-- AdditionalInfoCard
|       |-- Reads/writes: listings.owner_notes, internal_notes, key_risks,
|       |   technology_systems, real_estate_info, growth_trajectory
|
|-- Contact History Tab
    |-- ListingNotesLog (RESTORED)
        |-- Reads: listing_notes table + deal_transcripts (Fireflies)
        |-- Writes: listing_notes table (with delete confirmation)
```

---

## 4. Remaining Considerations

| # | Priority | Item | Status |
|---|----------|------|--------|
| 1 | Low | `listing_notes` table is not yet in Supabase generated types (`types.ts`) | Works at runtime; `as never` cast on insert. Will self-resolve on next `supabase gen types` run. |
| 2 | Info | Three overlapping notes concepts (general_notes, listing_notes, owner_notes/internal_notes) | Naming is confusing but each serves a distinct purpose. No code change needed; team should document naming conventions. |

---

## 5. Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260522000000_restore_listing_notes.sql` | New migration to restore dropped table |
| `src/components/remarketing/deal-detail/ListingNotesLog.tsx` | Removed `UntypedTable`, added delete confirmation dialog |
| `src/components/remarketing/deal-detail/GeneralNotesSection.tsx` | Fixed stale state, replaced fake progress bar with spinner |
| `src/pages/admin/remarketing/ReMarketingDealDetail/useDealDetail.ts` | Removed fake progress state/timer, simplified enrichment handler |
| `src/pages/admin/remarketing/ReMarketingDealDetail/WebsiteActionsCard.tsx` | Removed fake progress bar, simplified to spinner |
| `src/pages/admin/remarketing/ReMarketingDealDetail/OverviewTab.tsx` | Removed progress bar props |
| `src/pages/admin/remarketing/ReMarketingDealDetail/index.tsx` | Removed progress bar prop passing |
| `supabase/functions/analyze-deal-notes/index.ts` | Removed misleading fallback to internal_notes/owner_notes |
