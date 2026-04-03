

# Status Check: Agreement Signed Email + Listing Signing Encouragement

## Feature 1: Email When Agreement Marked as Signed

### What exists
- Edge function `notify-agreement-confirmed/index.ts` exists with correct logic
- Email catalog entry exists (line 253-261) with preview HTML

### What's broken / missing
1. **Edge function is never called.** `handleMarkSigned` in `DocumentTrackingPage.tsx` (line 1131-1183) updates the DB and shows a toast but never invokes `notify-agreement-confirmed`.
2. **`sendEmail` call has wrong field names.** The edge function passes `html` and `tags` but `sendEmail` expects `htmlContent` and does not accept `tags`. This means even if called, the email would fail silently.

### Fix
1. **Fix edge function**: Change `html` to `htmlContent`, remove `tags`, remove the second `supabase` argument from `sendEmail()` (it creates its own client internally).
2. **Wire up the call**: After the successful DB update in `handleMarkSigned` (after line 1177), add `supabase.functions.invoke('notify-agreement-confirmed', { body: { firmId: req.firm_id, agreementType: req.agreement_type } })`. Fire-and-forget (don't block the UI).
3. **Deploy** the fixed edge function.

---

## Feature 2: Encourage Unsigned Buyers to Save Listings

### What exists — already implemented
- **`ListingCardActions.tsx` (lines 172-208)**: When `!isNdaCovered && !isFeeCovered`, shows a "View Listing" button, a "Sign Agreement to Request Access" link, and copy: "Save this listing for later. Sign your agreement to request access."
- **`ConnectionButton.tsx` (lines 180-293)**: Full agreement gate with document status rows (NDA/Fee Agreement sent/signed states), resend buttons, and encouragement copy: "Save this listing so you can request access after signing."

This feature is done. The UX already encourages unsigned buyers to save/bookmark listings and sign agreements.

---

## Summary

| Feature | Status |
|---|---|
| Email on agreement signed | Edge function exists but is broken (wrong field names) and never called from the UI |
| Listing signing encouragement | Fully implemented in both card and detail views |

### Files to change
- `supabase/functions/notify-agreement-confirmed/index.ts` — fix `sendEmail` call signature
- `src/pages/admin/DocumentTrackingPage.tsx` — add `supabase.functions.invoke` call after marking signed
- Deploy `notify-agreement-confirmed`

