

## Problem

When a user clicks the email verification link, the auth callback (`/auth/callback`) correctly establishes a session and detects that `auth.users.email_confirmed_at` is set. However, it **never updates `profiles.email_verified` to `true`**. There is also no database trigger syncing this field.

The `PendingApproval` page checks `user.email_verified` (from the `profiles` table), sees `false`, and renders the "Verify your email" screen -- even though the email IS verified in `auth.users`.

For Adam Haile: `auth.users.email_confirmed_at = 2026-04-08T13:32:25` but `profiles.email_verified = false`.

## Fix

**File: `src/pages/auth/callback.tsx`**

After establishing the session and confirming `emailConfirmed` is true (line 90), add a Supabase UPDATE to set `profiles.email_verified = true`:

```typescript
// After line 90: const emailConfirmed = !!authUser.email_confirmed_at;
if (emailConfirmed) {
  await supabase
    .from('profiles')
    .update({ email_verified: true })
    .eq('id', authUser.id)
    .eq('email_verified', false); // no-op if already true
}
```

This goes before the navigation (line 92) so the profile is updated before the user lands on `/pending-approval`. The `refreshUserProfile()` call in `PendingApproval` will then read `email_verified = true` and show the correct "Application received" state.

**Immediate data fix**: Also update Adam's profile directly so he sees the correct screen without re-verifying:

```sql
UPDATE profiles SET email_verified = true WHERE email = 'adambhaile00@gmail.com';
```

## Summary

| Change | Detail |
|--------|--------|
| `src/pages/auth/callback.tsx` | Add `profiles.email_verified = true` update when `email_confirmed_at` is set |
| Database | One-time fix for `adambhaile00@gmail.com` |

Single-file code change plus a one-time data correction.

