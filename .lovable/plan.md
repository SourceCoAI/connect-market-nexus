

# Fix: `calculate-buyer-quality-score` Not Deployed

## Problem

The "Score All Unscored" button is stuck because the `calculate-buyer-quality-score` edge function was **never successfully deployed**. The previous deployment attempt returned a `400 Bad Request` error. Console logs confirm the client code fires ("Starting bulk score for 130 users", "Scoring round 1") but no network request to the function appears, and the function has zero execution logs in Supabase.

## Root Cause

The function needs to be redeployed. The 400 error on the previous attempt was likely transient (Supabase gateway issue) or caused by a stale `deno.lock`.

## Fix

### 1. Redeploy the edge function

Simply trigger a fresh deployment of `calculate-buyer-quality-score`. If a `deno.lock` is present and causing issues, remove it first.

### 2. Verify deployment via logs

After deployment, check edge function logs to confirm the function boots successfully.

### 3. No code changes needed

The client-side code and the function code are both correct. This is purely a deployment issue.

## Files Changed

| File | Change |
|------|--------|
| (none) | Redeploy `calculate-buyer-quality-score` edge function |

