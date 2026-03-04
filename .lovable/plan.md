

# Accept ALL Submissions — Bulletproof Ingestion

## Problem
The `chk_calculator_type` constraint on `valuation_leads` rejects any submission with an unknown `calculator_type`. Every time a new calculator is added, the constraint must be manually updated — and if it isn't, the lead is silently lost.

## Solution: Drop the constraint entirely + catch-all fallback

### 1. Drop `chk_calculator_type` constraint (migration)
Remove it permanently. The `calculator_type` column becomes a free-text `text` field. Any value is accepted. No submission can ever be rejected by this constraint again.

```sql
ALTER TABLE valuation_leads DROP CONSTRAINT IF EXISTS chk_calculator_type;
```

### 2. Update edge function for resilience
Wrap the entire `valuation_leads` insert in a try/catch fallback. If the structured insert fails for **any reason** (schema mismatch, new columns, unexpected data), fall back to inserting a minimal row with just `email`, `full_name`, `calculator_type`, and the raw JSONB payloads. This guarantees the lead is never lost.

In `receive-valuation-lead/index.ts`:
- Wrap the insert/update in try/catch
- On failure, attempt a minimal "safe insert" with only: `email`, `full_name`, `calculator_type` (defaulting to `'unknown'`), `raw_calculator_inputs`, `raw_valuation_results`, `lead_source`
- Log the original error but return 200 to the caller so the calculator doesn't show an error to the user
- The `incoming_leads` insert already serves as a raw backup, but this ensures the lead also appears in the main table

### 3. Clean up old migration
Remove the re-creation of `chk_calculator_type` from the latest migration file so it's never re-added.

### Files to change

| File | Change |
|------|--------|
| New migration SQL | `DROP CONSTRAINT IF EXISTS chk_calculator_type` |
| `receive-valuation-lead/index.ts` | Add try/catch fallback for valuation_leads insert; default `calculatorType` to `'unknown'` if unmappable; always return 200 if `incoming_leads` succeeded |

