

# Fix: "column nda_scope does not exist" Error

## Root Cause

The `update_firm_agreement_status` RPC function (in migration `20260302162807`) references two columns that do not exist on the `firm_agreements` table:

- **Line 58**: `nda_scope = COALESCE(p_scope, nda_scope)` — column `nda_scope` does not exist
- **Line 59**: `nda_deal_id = COALESCE(p_deal_id, nda_deal_id)` — column `nda_deal_id` does not exist

The fee agreement side has `fee_agreement_scope` and `fee_agreement_deal_id`, but the NDA side was never given equivalent columns. The RPC assumes they exist and fails on any NDA status update (sign or unsign).

## Fix

**One new migration** that either:

**Option A (minimal):** Recreate the RPC function, removing the two bad lines (58-59). The NDA branch simply won't set scope/deal_id since those columns don't exist and aren't needed (NDAs are always blanket, not deal-specific).

This is the correct approach because scope and deal_id are fee-agreement-specific concepts. NDAs don't have deal-specific variants.

### Migration content

```sql
CREATE OR REPLACE FUNCTION public.update_firm_agreement_status(...)
```

Same function body as the current one, but with lines 58-59 removed from the NDA `UPDATE` block. Everything else stays identical.

### Files changed
- New migration file (SQL) to recreate the RPC without the invalid column references

