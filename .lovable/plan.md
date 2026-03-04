

# Fix Duplicate Leads from Dual-Submission (Initial Unlock → Full Report)

## Problem

The edge function uses a SELECT-then-INSERT/UPDATE pattern (lines 148–235) which has a **race condition**: when the calculator fires two rapid requests (initial unlock + full report) for the same email, both SELECTs can return empty before either INSERT commits, creating two rows instead of merging.

The unique index `idx_valuation_leads_email_calc_type_active` exists on `(email, calculator_type)` but the code doesn't leverage it for atomic upserts — it only catches failures in the fallback path.

## Fix

**Replace the SELECT→INSERT/UPDATE pattern with a single atomic SQL UPSERT** using `ON CONFLICT (email, calculator_type) WHERE excluded = false AND email IS NOT NULL`.

### Changes to `supabase/functions/receive-valuation-lead/index.ts`:

1. **Remove** the `SELECT ... maybeSingle()` check (lines 148–154) and the branching if/else for existing vs new.

2. **Replace with a single upsert** using Supabase's `.upsert()` with `onConflict: 'email,calculator_type'` that:
   - On INSERT (new lead): sets all fields, `submission_count = 1`, `lead_source` from payload.
   - On CONFLICT (existing lead): merges fields — updates structured data, increments `submission_count`, upgrades `lead_source` to `full_report` if applicable, preserves `initial_unlock_at` via a raw SQL expression or a small DB function.

3. **Handle the `initial_unlock_at` preservation** with a database function: create a small `merge_valuation_lead` SQL function that accepts the payload and handles the merge atomically — setting `initial_unlock_at = CASE WHEN lead_source = 'initial_unlock' THEN created_at ELSE initial_unlock_at END` when upgrading from initial_unlock to full_report.

### Simpler alternative (preferred):

Use Supabase `.upsert()` directly — it maps to `INSERT ... ON CONFLICT DO UPDATE`:

```ts
const { error } = await supabaseAdmin
  .from("valuation_leads")
  .upsert({
    email,
    calculator_type: calculatorType,
    full_name,
    website: website ?? null,
    // ... all structured fields ...
    lead_source: leadSource,
    submission_count: 1, // will be overridden by raw SQL for updates
    updated_at: now,
  }, { 
    onConflict: 'email,calculator_type',
    ignoreDuplicates: false 
  });
```

**Issue**: Supabase JS `.upsert()` doesn't support incrementing `submission_count` or conditional `lead_source` logic. So we need a **database function** approach:

### Final approach — `merge_valuation_lead` RPC function

1. **Migration**: Create a `merge_valuation_lead` PL/pgSQL function that:
   - Attempts `INSERT` with all fields
   - `ON CONFLICT (email, calculator_type) WHERE excluded = false AND email IS NOT NULL` → `DO UPDATE` with merge logic:
     - Increment `submission_count`
     - If new `lead_source = 'full_report'` and existing is `'initial_unlock'`, set `initial_unlock_at = existing.created_at`
     - Always update structured fields with latest data

2. **Edge function**: Replace the SELECT→branch→INSERT/UPDATE with a single `supabase.rpc('merge_valuation_lead', { ... })` call. This is fully atomic — no race condition possible.

### Also: clean up the two test duplicates
Delete the test rows for `email@mail.com` and `ahaile14@gmail.com` via the insert tool.

### Files to change

| File | Change |
|------|--------|
| Migration SQL | Create `merge_valuation_lead` RPC function |
| `receive-valuation-lead/index.ts` | Replace SELECT→branch with single `rpc('merge_valuation_lead', ...)` call |
| Data cleanup | Delete 2 test duplicate rows |

