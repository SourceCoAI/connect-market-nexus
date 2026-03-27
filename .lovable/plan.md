

# Fix Missing Buyer Score & Tier on Signup

## Root Cause

After investigation, here's what's actually happening:

- **`buyer_type` IS saving correctly** — all recent signups have their buyer type (privateEquity, searchFund, advisor, etc.) stored in the profiles table. The trigger logs confirm `handle_new_user` succeeds for every signup.
- **`buyer_quality_score` and `buyer_tier` are NULL** for every recent user because **scoring is never triggered on signup**. The `calculate-buyer-quality-score` edge function only runs when an admin manually triggers it from the UI via `queueBuyerQualityScoring()`.
- There is no database trigger, webhook, or cron job that auto-scores new users.

## What the Screenshot Shows

The "—" dashes in Type/Tier/Score columns on the admin users page are likely a **display issue** — `buyer_type` exists in the DB (e.g., "privateEquity") but the UI may not be rendering it. Score and Tier are genuinely NULL because they were never calculated.

## Fix

### 1. Auto-Score on Signup (Frontend)

In `use-nuclear-auth.ts` → `signup()`, add a call to `calculate-buyer-quality-score` alongside the existing fire-and-forget calls (welcome email, admin notification, firm creation):

```typescript
const scoringPromise = supabase.functions
  .invoke('calculate-buyer-quality-score', {
    body: { profile_id: data.user.id },
  })
  .catch((err) => {
    console.warn('Buyer scoring failed (will be scored later):', err);
  });

await Promise.allSettled([
  welcomeEmailPromise,
  adminNotificationPromise,
  firmCreationPromise,
  scoringPromise,  // ← new
]);
```

### 2. Backfill Existing Users

Create a migration that queues scoring for all users who have `buyer_type` set but `buyer_quality_score` is NULL. This will use `pg_net` to call the edge function, or we can run it manually from the admin UI.

### 3. Check UI Display of buyer_type

Verify the admin users table is correctly reading and displaying `buyer_type` from profiles — if it shows "—" despite the field being populated, there's a mapping/display bug to fix.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/use-nuclear-auth.ts` | Add `calculate-buyer-quality-score` call in signup flow |
| `supabase/migrations/[timestamp]_backfill_buyer_scores.sql` | Backfill scores for existing unscored users |

