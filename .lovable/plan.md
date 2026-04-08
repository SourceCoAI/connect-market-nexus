
What I found after a deeper audit:

1. The core verification plan was mostly implemented
- `src/pages/auth/callback.tsx` no longer writes `profiles.email_verified` directly.
- It now resolves the session, fetches the profile, waits briefly for DB sync, and routes to `/pending-approval`.
- `src/pages/PendingApproval.tsx` now has a reconciliation/loading state (`Finalizing your verification`) and refreshes the profile if Auth says verified but the profile still looks stale.
- The migration `supabase/migrations/20260408140754_e905b07c-7534-444f-af59-15656cefa199.sql` exists and redefines:
  - `public.sync_user_verification_status()`
  - `public.protect_sensitive_profile_fields()`
  - auth triggers `on_auth_user_updated` and `on_auth_user_verification_inserted`
  - a one-time backfill update

2. The live database currently shows the sync is working
For `adambhaile00@gmail.com` right now:
- `auth.users.email_confirmed_at` is set
- `profiles.email_verified = true`
- `approval_status = pending`

So the original “Auth verified but profile still false” problem is not currently present in the live DB for this user.

3. That means the remaining problem is deeper than the original plan
The last plan fixed the DB-side sync path, but that is not the whole story. I found two important remaining risks:

A. Misleading “verification success” email timing
`src/pages/auth/callback.tsx` sends the “Your email is confirmed” success email as soon as:
- Auth session exists
- `authUser.email_confirmed_at` is true
- profile fetch succeeds

That email is not tied to admin approval, and the wording can easily be read as “everything is complete” even though admin still sees `approval_status = pending`. So part of the confusion is product/flow messaging, not just data sync.

B. Split auth state architecture still exists in the codebase
The app’s main auth context uses `useNuclearAuth`, but there is also an older `useAuthState` hook still in the codebase.
- `AuthProvider` uses `useNuclearAuth`
- but `PageEngagementTracker` and `EditorInternalCard` still import `useAuthState`

`useAuthState` has older behavior:
- reads/writes `localStorage`
- creates fallback “minimal user” objects from auth session
- can independently represent email verification from `session.user.email_confirmed_at`
- is not the same source of truth as the main app auth context

Even if it is not the exact cause of the pending-approval bug, this split architecture is dangerous and can absolutely create stale or contradictory UI state elsewhere.

4. Why the app may still have looked wrong even if DB was correct
Most likely scenarios now:
- the session/callback timing briefly showed the old state before refresh
- a stale client auth object remained in memory during navigation
- the success email created the impression that the account should already be “fully verified” in admin, when only email verification had happened
- some parts of the app may still derive state from the old hook instead of the canonical auth context

5. Is that previous plan “all we need”?
No. It solved the original DB-trigger conflict, but not the full reliability problem.

What still needs to be done

Step 1 — verify the current frontend state path end-to-end
Audit the exact route sequence for:
signup -> email link -> `/auth/callback` -> `/pending-approval` -> admin dashboard
and confirm each screen uses the same canonical profile/auth source after the redirect.

Step 2 — make the callback use a stronger verified-state gate
In `src/pages/auth/callback.tsx`, don’t just “wait a bit and continue.”
Instead:
- resolve auth session
- fetch profile
- if `authUser.email_confirmed_at` is true and `profile.email_verified` is still false, explicitly retry profile fetch a few times
- if still not synced, surface a deterministic recovery path/log instead of silently continuing
This avoids hidden partial-success states.

Step 3 — harden pending-approval state derivation
In `src/pages/PendingApproval.tsx`, compute UI from both:
- canonical profile state
- underlying auth verification state
If auth is verified but profile is still stale after retries, show a dedicated reconciliation state, not the old “Verify your email” screen.

Step 4 — remove or isolate the legacy auth hook
Refactor remaining consumers of `useAuthState` to use the main `AuthContext` / `useAuth`.
This is the biggest architectural cleanup still missing.
Goal:
- one auth hook
- one user object
- no localStorage shadow auth state
- no conflicting verification booleans

Step 5 — tighten the verification-success email behavior
Review the success email trigger and copy.
Two changes:
- only send the email after verified-state reconciliation succeeds
- make wording explicitly say “Your email is verified; your application is still pending team approval”
This avoids false expectations.

Step 6 — add debugging instrumentation for stuck verification cases
Because this issue has repeated multiple times, add targeted logs around:
- callback session resolution
- fetched `authUser.email_confirmed_at`
- fetched `profile.email_verified`
- retry attempts / final route decision
That will make the next failure diagnosable instead of speculative.

Step 7 — verify admin dashboard uses canonical profile data only
The admin users hook currently reads directly from `profiles`, which is good.
I would still verify that any status badges, filters, cached query state, and detail views all refresh after verification without stale react-query cache issues.

Most likely final root cause mix

```text
Original issue:
auth verified -> profile sync blocked by protected trigger

Now fixed:
auth.users trigger sync exists and live DB is syncing correctly

Remaining issue:
frontend timing + duplicate auth state patterns + misleading success email
```

Implementation scope I would recommend now
1. Refactor `auth/callback.tsx` to make verified-state reconciliation explicit and logged.
2. Refactor `PendingApproval.tsx` to never show the wrong “Verify your email” screen when Auth already says verified.
3. Remove remaining `useAuthState` consumers or migrate them to `useAuth`.
4. Update verification-success email trigger/copy so it reflects reality.
5. Add temporary verification diagnostics so we can confirm the next signup works cleanly.

Files to update
- `src/pages/auth/callback.tsx`
- `src/pages/PendingApproval.tsx`
- `src/hooks/auth/use-auth-state.ts` (deprecate or stop using)
- `src/components/PageEngagementTracker.tsx`
- `src/components/admin/editor-sections/EditorInternalCard.tsx`
- `src/hooks/auth/use-verification-success-email.ts` and/or related email trigger logic
- possibly the email template/function copy if wording needs correction

Technical note
The DB objects are currently present live:
- `public.sync_user_verification_status()`
- `public.protect_sensitive_profile_fields()`
- triggers on `auth.users`
So I would not center the next fix on SQL first. The deeper remaining work is frontend state consistency and messaging integrity.

Bottom line
- The last plan was implemented in large part.
- The DB sync path is currently working.
- No, that was not the full fix.
- The remaining reliability issue is now mostly in client-state consistency and verification email behavior, not just the database trigger layer.
