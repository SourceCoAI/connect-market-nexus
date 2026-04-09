

# Fix: Defensive Redirect in PendingApproval for Already-Approved Users

## Root Cause

Chris's account is `approved` and `email_verified=true` in the database. He should never see this page. But due to a timing race during login (the `SIGNED_IN` event fires before `loadProfile` completes), he briefly lands on `/pending-approval`. Once there, the page shows "Verify your email" or "Account under review" based on potentially stale client state.

The `getUIState()` function on line 224-231 only checks `user.email_verified` from the profile object. If the profile is stale or slow to load, it can show the wrong screen to an already-verified, already-approved user.

## The Safest Fix (1 file, additive only)

**File: `src/pages/PendingApproval.tsx`**

Add a single `useEffect` near the top (after the existing approved redirect on line 47-51) that checks the **real auth state** via `supabase.auth.getUser()` when the page mounts. If the user is both:
- `email_confirmed_at` is set in Auth (verified)
- `approval_status === 'approved'` in the profile

...then immediately redirect to `/` (marketplace). This catches the race condition.

Additionally, update `getUIState()` to also check auth truth: before returning `'email_not_verified'`, do a quick check — if the reconciliation effect already confirmed Auth says verified, skip the "Verify your email" screen and show `'approved_pending'` instead (which is the "Application received / waiting for review" screen — much less confusing than asking to re-verify).

### Specific changes

1. **Add state `authConfirmedVerified`** (boolean, default `false`) that gets set to `true` by the existing reconciliation effect when `supabase.auth.getUser()` confirms `email_confirmed_at` is set.

2. **Update `getUIState()`** (line 224-231): Change `email_not_verified` branch to also check `authConfirmedVerified` — if auth says verified, return `'approved_pending'` instead of `'email_not_verified'`. This prevents showing the "Resend verification" button to already-verified users.

3. **Enhance the existing approved redirect** (line 47-51): Also trigger redirect if the reconciliation confirms the user is verified AND profile says approved — handles the case where `user.approval_status` updates slightly after mount.

### What this does NOT touch
- Login page — no changes
- Signup flow — no changes  
- Password reset — no changes
- Auth callback — no changes
- ProtectedRoute — no changes
- useNuclearAuth — no changes
- Any edge functions — no changes

### Why this is safe
- It's purely additive defensive logic in a single page
- It only redirects users **away** from PendingApproval (never traps them)
- It uses the existing `supabase.auth.getUser()` pattern already in the reconciliation effect
- Worst case if the new code fails: behavior stays exactly as it is today

