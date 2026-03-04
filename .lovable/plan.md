

# Dual Submission Strategy: Initial Unlock vs Full Report

## How It Works Today

1. **Yes — leads show up immediately.** The external calculator calls `receive-valuation-lead`, which inserts into `valuation_leads`. It appears in the Auto Shop tab instantly. Clicking the row opens the side panel with all calculator inputs (grouped by step) and valuation results.

2. **The dual-submission problem:** Your calculator captures the user twice:
   - **First gate** ("Initial Unlock"): captures name + email to show basic results
   - **Second gate** ("Full Report"): captures again (possibly more data) to unlock the full report

3. **Current behavior:** The edge function checks for an existing row matching `email + calculator_type`. If found, it **overwrites** the first submission with the second. So only the latest submission survives in `valuation_leads`. The `incoming_leads` table also upserts on `email` alone — so only one raw record exists period.

## The Problem

- You **lose the initial_unlock submission** — it gets overwritten by the full_report
- You can't see the user's journey (did they just unlock initial? or did they come back for full?)
- If a user only does the initial unlock and never returns, that lead still has value — but the `lead_source` says "initial_unlock" and you can't distinguish it from someone who did both

## Recommended Strategy

**Keep one row per email+calculator_type** (current behavior — no duplicates), but **merge intelligently instead of blindly overwriting**:

### Changes to `receive-valuation-lead` edge function

1. When an existing row is found, **merge** instead of replace:
   - If the new submission is `full_report` and existing is `initial_unlock`, update `lead_source` to `full_report` and set a new field `initial_unlock_at` to preserve the first touch timestamp
   - If both are the same source, just update with latest data (current behavior)
   - Store a `submission_count` field so you can see how many times the user submitted

2. For `incoming_leads`, change the upsert to **not overwrite** — use `ignoreDuplicates: true` or insert with a composite key of `email + lead_source` so both the initial_unlock and full_report raw payloads are preserved as an audit trail

### Database migration

Add two columns to `valuation_leads`:
- `initial_unlock_at` (timestamptz, nullable) — when the user first unlocked results
- `submission_count` (integer, default 1) — how many times this email submitted

### Drawer UI update

In `ValuationLeadDetailDrawer.tsx`, show submission history in the header:
- Badge: "2 submissions" if count > 1
- Show both timestamps: "First seen: Mar 4 · Full report: Mar 4"
- The `lead_source` badge already shows "Full Report" vs "Initial Unlock"

### Files to change

| File | Change |
|------|--------|
| `supabase/functions/receive-valuation-lead/index.ts` | Merge logic: preserve `initial_unlock_at`, increment `submission_count`, don't blindly overwrite |
| `incoming_leads` upsert | Change conflict key to `email + lead_source` so both submissions are preserved |
| DB migration | Add `initial_unlock_at` and `submission_count` to `valuation_leads` |
| `ValuationLeadDetailDrawer.tsx` | Show submission count badge and first-seen timestamp |
| `types.ts` | Add `initial_unlock_at` and `submission_count` to `ValuationLead` type |

