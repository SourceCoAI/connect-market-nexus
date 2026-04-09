

# Investigation: "Signup failed — Invalid email address" for rafeh@rafnumpartners.com

## Root Cause

**The error message is misleading.** Line 190 in `src/pages/Signup/index.tsx`:

```typescript
else if (msgLower.includes('email')) errorMessage = 'Invalid email address.';
```

This catches **any** error whose message contains the word "email" and replaces it with "Invalid email address." The email `rafeh@rafnumpartners.com` is perfectly valid — the real error is being masked.

The actual Supabase error is almost certainly one of these:

1. **Metadata payload too large** — The `signUp` call sends ~60+ fields in `options.data` (lines 198-306 of `use-nuclear-auth.ts`). Supabase has a limit on `raw_user_meta_data`. The error message from Supabase likely says something like "Unable to create user with email..." or "Error processing email signup..." — anything with "email" in it triggers the bad catch.

2. **Duplicate account** — If this user previously started a signup (even partially), Supabase may return a different duplicate error message that contains "email" but doesn't match the exact "user already registered" check on line 186.

3. **Supabase rate limiting or transient error** — The error response might mention the email in context, getting caught by the broad filter.

## The Fix (1 file, safe)

**File: `src/pages/Signup/index.tsx`** — Fix the error handling to:

1. **Show the actual error message** instead of masking it — change line 190 to only match specific known email validation errors (e.g., "invalid format", "not valid"), not any string containing "email"
2. **Add the real error to the toast** so users (and you) can see what actually went wrong
3. Keep the existing user-friendly mappings for "user already registered" and password errors

This is safe because it only changes error display text in the catch block — no signup logic, no auth flow, no validation changes.

## Files

| File | Change |
|------|--------|
| `src/pages/Signup/index.tsx` | Narrow the "email" error catch to only match actual email validation errors. For unknown errors, show the real message instead of masking it. |

