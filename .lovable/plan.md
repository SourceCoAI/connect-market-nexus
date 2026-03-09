

# Audit: AI Search Progress Bar Not Showing

## Root Cause Analysis

After tracing the full flow (`handleSeedBuyers` → `createJob` → polling via `useBuyerSearchJob` → `{job && ...}` render), I identified **two bugs** in `src/hooks/admin/use-buyer-search-job.ts`:

### Bug 1: `pollJob` silently swallows query errors (PRIMARY CAUSE)

```ts
// Line 43-53 of use-buyer-search-job.ts
const pollJob = useCallback(async (jobId: string) => {
  const { data } = await (supabase as any)
    .from('buyer_search_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  if (data) {
    setJob(data as BuyerSearchJob);
    // ...
  }
  // ← If there's an error, data is null, job stays null FOREVER
  // ← No error logging — impossible to debug
}, [stopPolling]);
```

If the Supabase query returns an error (even transiently), `data` is null, `job` stays null, and the progress bar (`{job && ...}` at line 711 of RecommendedBuyersTab) never renders. The polling continues silently failing every 2 seconds with no indication.

### Bug 2: No recovery on component remount

`activeJobId` is stored in `useState`. If the user switches deal tabs (e.g., Overview → Buyer Introductions) while a search is running, the component remounts, `activeJobId` resets to null, and the progress bar is permanently lost — even though the edge function is still running and updating the job row.

## Fix Plan

### File: `src/hooks/admin/use-buyer-search-job.ts`

1. **Add error handling to `pollJob`** — destructure `error` from the query, log it with `console.error`, and optionally set a fallback error state so the UI can show something went wrong.

2. **Check for active jobs on mount** — when the hook initializes, query `buyer_search_jobs` for any job with this `listing_id` that's still in `pending`/`searching`/`scoring` status. If found, resume polling that job. This handles the remount case.

3. **Remove unnecessary `(supabase as any)` cast** — `buyer_search_jobs` exists in the generated types, so the `any` cast is hiding potential type issues.

### File: `src/components/admin/deals/buyer-introductions/tabs/RecommendedBuyersTab.tsx`

4. **No changes needed** — the rendering logic at lines 710-752 is correct; it just needs `job` to actually be populated.

