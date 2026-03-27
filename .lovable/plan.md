
# Deep Dive: Why bulk scoring still appears stuck, and what needs fixing

## What I found

There are two different issues happening at once:

### 1. The scoring action still is not reaching the edge function
I verified:
- the button exists in the live page code (`src/pages/admin/AdminUsers.tsx`)
- the handler sets `isBulkScoring` and calls `invokeEdgeFunction('calculate-buyer-quality-score', ...)`
- there are still **no network requests**
- there are still **no edge function logs**
- edge gateway analytics also show **no executions**

That means the request is still dying **before Supabase receives it**.

### 2. The project currently has build/typecheck problems unrelated to this button
Your latest error dump shows:
- a frontend type error in `PipelineDetailDealInfo.tsx` (`listing.hired_broker` missing from the typed deal shape)
- many edge-function TypeScript errors under `supabase/functions/ai-command-center/...`

This matters because if the project is not clean, recent changes may not be reflected reliably and edge-function deploy/typegen can fail noisily.

## Most likely root cause of the stuck button

The strongest signal is still this:

```text
Button enters "Scoring…"
but no browser request appears
and no edge logs exist
```

That means one of these pre-request stages is failing:
1. `invokeEdgeFunction()`
2. `invokeWithTimeout()`
3. `supabase.auth.getSession()` / token retrieval
4. request construction before `fetch()`

The auth deadlock is still the leading candidate, but there is one more thing to tighten: the current helper still depends entirely on `getSession()` returning a token. If it times out or returns null in this admin route, the UI should fail immediately with a visible toast. Right now, if logs are not surfacing in preview, it can still look like a stuck spinner.

## Important database reality check

From the database:
- profiles with buyer type but missing score: about **130**
- profiles with buyer type but missing tier: about **130**
- approved users still missing score: about **60**
- missing buyer_type: **0**

So the backlog is real, and scoring/backfill still needs to run.

## What I would fix next

### 1. Make the bulk action visibly prove where it stops
Update `src/pages/admin/AdminUsers.tsx` to:
- toast before starting round 1
- toast again immediately before the invoke call
- wrap each round with a short local timeout/failure state
- surface a very explicit message if session lookup fails or returns no token

Goal:
```text
Starting...
Preparing auth...
Calling scorer...
Round 1 complete...
```
So we can tell exactly where it stops from the UI alone.

### 2. Harden the invocation helper one step further
Update `src/lib/invoke-with-timeout.ts` to:
- keep the 5s session timeout
- add a fallback token path if available from current auth state
- return a clearly categorized error for:
  - session timeout
  - missing session
  - fetch not started
- fix error parsing to match your shared edge-function schema:
  - current code checks `errorBody.code`
  - your shared helper returns `error_code`
  - that mismatch should be corrected

This will make failures much clearer.

### 3. Add a direct admin-only fallback path for bulk scoring
Right now the UI depends on the browser session being healthy to call the function.

A more reliable pattern for this admin tool is:
- call a small admin-safe endpoint/function mode that starts server-side batch work
- return progress per round
- avoid the UI depending on long-running client orchestration

The existing `batch_all_unscored` mode is close, but the client is still driving rounds. I’d harden this so one admin click can execute the full backfill server-side or at least return deterministic progress.

### 4. Fix the current build blockers
These need to be cleaned up because they can interfere with reliable iteration:

#### Frontend
- `src/components/admin/pipeline/tabs/PipelineDetailDealInfo.tsx`
  - `listing.hired_broker` is referenced but missing on the typed object
  - fix the type source or map this field properly from the query result

#### Edge functions
The `ai-command-center` tree has multiple TypeScript issues:
- implicit `any`
- unknown typing in `.map()` / `.sort()`
- query builders being pushed where `Promise` is expected
- unsafe property access on `unknown`
- return types too narrow in some tools

These should be fixed in a cleanup pass so edge function typegen/deploy stops failing noisily.

### 5. Re-verify the scoring function itself
The scorer code is generally sound, but I would tighten two areas:
- validate body shape before using `body.self_score`, `body.batch_all_unscored`, etc.
- make the buyer lookup more precise:
  ```ts
  .or(`primary_contact_email.eq.${profile.email},marketplace_firm_id.not.is.null`)
  ```
  This condition is too broad and can match unrelated buyers whenever `marketplace_firm_id` is not null.
- for scoring quality, this should be replaced with a true linkage rule.

## What else should be fixed around buyer scoring

Beyond the stuck button, these are still worth addressing:

### Buyer scoring correctness
- ensure bulk backfill writes both:
  - `buyer_quality_score`
  - `buyer_tier`
- ensure signup self-score still runs for future users
- ensure admin override logic remains respected

### Data integrity
- tighten profile ↔ buyer association logic for enrichment/scoring
- confirm no users are missing required firm/profile relationships during signup
- verify all approved buyers have:
  - profile
  - buyer_type
  - score
  - tier
  - firm linkage if expected

### Operational visibility
- add one lightweight admin metric/card:
  - “Unscored buyers”
  - “Missing tier”
  - “Last bulk score run”
This prevents this kind of silent backlog from building again.

## Recommended implementation order

1. Fix the frontend type error in `PipelineDetailDealInfo.tsx`
2. Fix the edge-function typecheck errors in `ai-command-center`
3. Harden `invoke-with-timeout.ts` error classification and token retrieval
4. Improve `AdminUsers.tsx` bulk scoring feedback so the exact stop point is visible
5. Refactor bulk scoring to a more server-driven/admin-safe execution path
6. Re-run the backfill and verify DB counts drop from ~130 missing scores/tiers to 0
7. Audit signup again to confirm future users are scored automatically

## Expected outcome after this pass

After these fixes:
- the button will either actually start scoring or fail with a precise message
- the edge function will finally show logs if the request is reaching Supabase
- the codebase will be clean enough that changes reliably reflect in the app
- the backlog of unscored buyers can be fully backfilled
- future signups should continue populating score and tier automatically

## Files most likely needing changes

- `src/lib/invoke-with-timeout.ts`
- `src/pages/admin/AdminUsers.tsx`
- `supabase/functions/calculate-buyer-quality-score/index.ts`
- `src/components/admin/pipeline/tabs/PipelineDetailDealInfo.tsx`
- multiple files under `supabase/functions/ai-command-center/tools/`

## Technical notes

- The absence of both browser network activity and edge logs still points to a pre-request client failure.
- The current build errors are real and should be fixed before trusting further UI behavior.
- The scorer’s batch mode is present and configured in `supabase/config.toml`, so this no longer looks like a missing-route problem.
- The buyer scoring function’s remarketing buyer lookup is currently too loose and should be corrected for scoring accuracy.

