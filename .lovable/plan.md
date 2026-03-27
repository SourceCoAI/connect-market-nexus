

# Fix Buyer Quality Scoring on Signup + Backfill

## Root Cause

The `calculate-buyer-quality-score` edge function has an **admin-only guard** (line 329-331). When called during signup, the newly created user is not an admin, so it returns **403 Forbidden**. The `.catch()` silently swallows this error with a console.warn.

## Fix

### 1. Add a signup bypass to the scoring edge function

In `supabase/functions/calculate-buyer-quality-score/index.ts`, add a `self_score` mode: if `body.self_score === true` AND `body.profile_id` matches the caller's own user ID, skip the admin check. This allows a user to score themselves on signup without opening the function to arbitrary non-admin use.

```typescript
// After parsing body, before admin check:
const isSelfScore = body.self_score === true && body.profile_id === callerUser.id;
if (!isSelfScore) {
  const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: callerUser.id });
  if (!isAdmin) {
    return errorResponse('Forbidden', 403, corsHeaders, 'forbidden');
  }
}
```

### 2. Update the signup call to use self_score flag

In `src/hooks/use-nuclear-auth.ts`, add `self_score: true` to the scoring invocation body so the edge function knows to allow it.

### 3. Backfill existing unscored users

Run a backfill from the admin UI using the existing `batch_all_unscored` mode. No migration needed — the admin can trigger this from the Quality Score panel which already has bulk scoring. I'll add a note about this.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/calculate-buyer-quality-score/index.ts` | Add `self_score` bypass for own profile |
| `src/hooks/use-nuclear-auth.ts` | Add `self_score: true` to scoring call body |

