

# Fix: Copy Deal Info — Empty Output + service_mix Crash

## Root Cause

Two issues:

1. **Missing data in copy output**: `DealHeader` declares a narrow `DealHeaderDeal` interface with only ~10 fields. It passes this to `CopyDealInfoButton`, which accepts `CopyDealDeal` (also narrow — missing description, executive_summary, etc. from the actual deal object). At runtime the full deal IS passed through, but the format function only reads the fields it knows about — and many are simply not being read because the interface is too restrictive.

2. **`service_mix?.join is not a function`**: The `service_mix` column comes from Supabase as a JSON value. Depending on how it was stored, it may arrive as a string (e.g. `'["plumbing","HVAC"]'`) rather than a native JS array. Calling `.join()` on a string crashes.

## Fix Plan

### File 1: `CopyDealInfoButton.tsx`

- **Widen the deal interface** to accept `Record<string, unknown>` (or a much broader interface) so it captures all fields from the actual deal object at runtime — description, executive_summary, service_mix, geographic_states, owner_notes, general_notes, etc.
- **Safe array handling**: Replace `deal.service_mix?.join(', ')` and `deal.geographic_states?.join(', ')` with a helper that handles both string and array inputs:
  ```ts
  function safeJoin(val: unknown): string | null {
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'string') {
      try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed.join(', '); } catch {}
      return val;
    }
    return null;
  }
  ```
- **Add all missing fields** to the format function: `owner_notes`, `general_notes`, `internal_notes`, `customer_types`, `growth_trajectory`, `ownership_structure`, `key_risks`, `technology_systems`, `real_estate_info`, `owner_goals`, `special_requirements`, `revenue_model`, `business_model`, `number_of_locations`, `services`, etc.

### File 2: `DealHeader.tsx`

- Change the `CopyDealInfoButton` prop to pass the full deal object without narrowing. Cast it or use a broader type so all fields flow through.

Two files changed. Fixes both the empty/lorem-ipsum output and the runtime crash.

