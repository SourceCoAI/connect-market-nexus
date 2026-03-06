

## Problem

The "No description" on buyer universe rows happens because description generation is **manual only** — the user must click "AI Generate" in the create dialog. Most universes were created without clicking it, or were imported via bulk flows that don't generate descriptions.

There is no auto-generation of the description when a universe is created or after it's been sitting without one.

## Root Causes

1. **Create flow**: The "Create Universe" dialog has an optional manual "AI Generate" button for description. If the user doesn't click it, the universe is saved with `description: null`.
2. **Bulk import flows**: `import-reference-data` and `bulk-import-remarketing` create universes without generating descriptions.
3. **No backfill mechanism**: There's no process to retroactively generate descriptions for universes missing them.

## Plan

### Change 1: Auto-generate description on universe creation
In `useUniversesData.ts`, modify the `createMutation` to automatically call `clarify-industry` with `generate_description: true` after inserting the universe (if no description was provided). This ensures every new universe gets a description without requiring the user to click the button.

### Change 2: Auto-trigger description generation when name is entered
In `useUniversesData.ts`, add a debounced effect that auto-generates the description when the user types a universe name (after ~1.5s of no typing), replacing the manual button click. The button stays as a manual re-trigger option.

### Change 3: Backfill existing universes — add "Generate Missing Descriptions" action
Add a bulk action button on the universes list page (near the existing bulk actions) that finds all universes with `description IS NULL` and generates descriptions for them sequentially via `clarify-industry`. This is a one-time catch-up for existing data.

### Change 4: Bulk import description generation
In `import-reference-data` and `bulk-import-remarketing` edge functions, after inserting a universe, fire a non-blocking call to `clarify-industry` with `generate_description: true` and update the universe record with the result.

### Files to modify
- `src/pages/admin/remarketing/useUniversesData.ts` — auto-generate on create, debounced auto-generate on name input
- `src/pages/admin/remarketing/ReMarketingUniverses.tsx` — add bulk "Generate Missing Descriptions" button
- `supabase/functions/import-reference-data/index.ts` — generate description on import
- `supabase/functions/bulk-import-remarketing/index.ts` — generate description on import

