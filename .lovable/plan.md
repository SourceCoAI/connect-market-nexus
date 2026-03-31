

# Root Cause: Signup Fails with "Database error saving new user"

## The Error Chain

1. User submits signup → Supabase creates row in `auth.users`
2. Trigger `on_auth_user_created` fires → `handle_new_user()` inserts into `profiles`
3. Trigger `trg_sync_marketplace_buyer_on_signup` fires on `profiles` INSERT → `sync_marketplace_buyer_on_signup()` tries to INSERT into `remarketing_buyers`
4. The INSERT sets `email_domain` from the user's email (e.g. `gmail.com`)
5. **UNIQUE INDEX** `idx_remarketing_buyers_unique_email_domain_per_universe` rejects the insert because another non-archived `remarketing_buyers` row already has that same `email_domain` + `universe_id` combination
6. The error is **not caught** inside `sync_marketplace_buyer_on_signup()` — it propagates up, aborting the entire transaction including the `auth.users` INSERT
7. Result: **500 — "Database error saving new user"**

## Why It Happens

The unique index enforces one buyer per email domain per universe. This makes sense for corporate domains (one `acme.com` buyer), but breaks for:
- **Generic email domains** (gmail.com, yahoo.com, hotmail.com) — multiple unrelated buyers share them
- **Any domain** that already has a buyer record — a second user from the same company triggers the constraint

The `sync_marketplace_buyer_on_signup()` function does check for existing buyers by website domain and company name, but does **NOT** check by email domain. So it falls through to INSERT, which hits the unique constraint.

## The Fix — Single Migration

**File**: New migration

1. **Add email_domain lookup** to `sync_marketplace_buyer_on_signup()` — before attempting INSERT, check if a buyer with the same `email_domain` already exists (same logic path as the website/company-name checks). If found, use that buyer instead of inserting.

2. **Add EXCEPTION handler** around the INSERT INTO `remarketing_buyers` — if the unique constraint is still violated (race condition), catch it and fall back to SELECT the existing row. This prevents the error from killing the entire signup transaction.

3. **Skip email_domain for generic providers** — if the domain is gmail.com, yahoo.com, hotmail.com, etc., set `email_domain` to NULL on the new buyer row so the unique index doesn't apply. The function already has access to the domain; just add a check against a list of common free providers.

```text
Signup flow BEFORE fix:
  auth.users INSERT
    → handle_new_user() → profiles INSERT
      → sync_marketplace_buyer_on_signup()
        → INSERT remarketing_buyers (email_domain = 'gmail.com')
        → UNIQUE VIOLATION → ENTIRE TRANSACTION ABORTS → 500

Signup flow AFTER fix:
  auth.users INSERT
    → handle_new_user() → profiles INSERT
      → sync_marketplace_buyer_on_signup()
        → Check existing buyer by email_domain FIRST
        → If found → use existing (no INSERT)
        → If not found → INSERT with email_domain = NULL for generic domains
        → If INSERT still fails → EXCEPTION handler catches → SELECT existing
        → Transaction succeeds → 200
```

### Technical Details

The migration will `CREATE OR REPLACE FUNCTION public.sync_marketplace_buyer_on_signup()` with three changes:

1. After the company-name fallback lookup (line ~174), add a third lookup:
   ```sql
   IF v_buyer_id IS NULL AND v_email_domain IS NOT NULL THEN
     SELECT id INTO v_buyer_id
     FROM public.remarketing_buyers
     WHERE archived = false
       AND email_domain = v_email_domain
     LIMIT 1;
   END IF;
   ```

2. Wrap the INSERT (lines 211-249) in a `BEGIN ... EXCEPTION WHEN unique_violation` block that does a SELECT fallback.

3. Before INSERT, null out `v_email_domain` if it's a generic provider (gmail.com, yahoo.com, hotmail.com, outlook.com, aol.com, icloud.com, etc.).

One migration file. No frontend changes needed.

