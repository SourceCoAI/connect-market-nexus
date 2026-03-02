

## Deploy score-deal-buyers and seed-buyers

### Problem

Deployment failed with a 500 internal error. The root cause is likely the `deno.lock` file (version 5 format) which is incompatible with Supabase's edge runtime. The build errors shown are in **other** functions (`calculate-deal-quality`, `bulk-import-remarketing`, `clarify-industry`, `auto-create-firm-on-approval`, `ai-command-center`) -- not in the two target functions -- but may contribute to deploy pipeline failures.

### Fix

1. **Reset `supabase/functions/deno.lock`** to a minimal version 3 format (empty lock) so the edge runtime regenerates compatible hashes on deploy.

2. **Retry deployment** of `score-deal-buyers` and `seed-buyers`.

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/deno.lock` | Replace version 5 lockfile with minimal `{"version": "3"}` |

### Notes

- The pre-existing TypeScript errors in other functions (`calculate-deal-quality`, etc.) are unrelated to these two functions and won't block their deployment once the lockfile issue is resolved.
- No code changes to `score-deal-buyers` or `seed-buyers` are needed.

