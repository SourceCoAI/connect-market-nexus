

# Fix: Valuation Lead Insert Failing — Check Constraint Violation

## What Happened

Your test submission was **received** by the edge function and saved to `incoming_leads` successfully, but **failed** to insert into `valuation_leads` with this error:

```
violates check constraint "chk_calculator_type"
```

The edge function maps `service_type` → `calculator_type` like this:
- `"collision"` → `"collision"`
- `"mechanical"` → `"mechanical"` 
- `"specialty"` → `"specialty"`
- fallback → `"auto_shop"`

But the database check constraint only allows: `general, auto_shop, hvac, collision, dental, plumbing, electrical, landscaping, pest_control`.

Your submission had `service_type = "specialty"`, which mapped to `calculator_type = "specialty"` — a value **not in the allowed list**. Same problem would occur for `"mechanical"`.

## Fix

### 1. Update the DB check constraint
Add `specialty` and `mechanical` to the allowed values:

```sql
ALTER TABLE valuation_leads DROP CONSTRAINT chk_calculator_type;
ALTER TABLE valuation_leads ADD CONSTRAINT chk_calculator_type 
  CHECK (calculator_type = ANY(ARRAY[
    'general','auto_shop','hvac','collision','dental','plumbing',
    'electrical','landscaping','pest_control','specialty','mechanical'
  ]));
```

### 2. Add tab + badge support for new types
Update `ValuationLeadsTable.tsx` tabs to include Specialty and Mechanical tabs, and update `BadgeComponents.tsx` to add badge colors for the new types.

### 3. Re-deploy edge function
The edge function code is correct — it just needs the DB constraint fixed. After the migration, re-deploy and the submission will succeed.

### 4. Re-ingest the failed lead
After the fix, re-submit the test lead (or manually insert it) so it appears in the table.

### Files to change

| File | Change |
|------|--------|
| New migration SQL | Drop + re-add `chk_calculator_type` with `specialty` and `mechanical` |
| `BadgeComponents.tsx` | Add badge config for `specialty` and `mechanical` |
| `ValuationLeadsTable.tsx` | Add Specialty / Mechanical tabs (or group under Auto Shop) |
| Edge function | Re-deploy (no code change needed) |

